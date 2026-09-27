import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {fortniteFixture,report} from './fixtures/fortnite-fixture.mjs';
import {RegistrationService} from '../dist/modules/registration/registration.service.js';
import {TeamsService} from '../dist/modules/teams/teams.service.js';
import {createTournamentRouter} from '../dist/modules/tournaments/tournaments.routes.js';
import {operationRequest} from '../dist/modules/tournaments/tournament-operations.js';

async function completed(t) {
 const f=await fortniteFixture(t,{count:5,size:5,games:1});
 let v=await f.action({action:'GENERATE'});v=await f.action(report(v.state.rounds[0].groups[0]));
 await f.action({action:'ADVANCE',revision:v.state.revision,acceptTies:true});
 const id=f.tournament.id;
 return {...f,id,archive:()=>f.tournaments.setArchived(id,true),restore:()=>f.tournaments.setArchived(id,false)};
}

test('archive preserves a completed Fortnite tournament, hides it by default and restores without enabling display',async t=>{
 const f=await completed(t),before=await f.view(),participants=await f.repo.listParticipants(f.id);
 const first=await f.archive();assert.equal(first.status,'ARCHIVED');assert.equal(first.settings.displayEnabled,false);assert.equal(first.settings.registrationEnabled,false);
 assert.deepEqual((await f.view()).state,before.state);assert.deepEqual(await f.repo.listParticipants(f.id),participants);
 assert.equal((await f.tournaments.listTournaments()).length,0);assert.equal((await f.tournaments.listTournaments(true)).length,1);
 assert.equal((await f.tournaments.listTournaments(true))[0].registeredParticipants,5);
 assert.equal((await f.tournaments.getTournamentOverview(f.id)).tournament.status,'ARCHIVED');
 const count=(await f.repo.listActivity(f.id)).length;await f.archive();assert.equal((await f.repo.listActivity(f.id)).length,count);
 const restored=await f.restore();assert.equal(restored.status,'COMPLETED');assert.equal(restored.settings.displayEnabled,false);
 assert.equal((await f.tournaments.listTournaments()).length,1);assert.deepEqual((await f.view()).state,before.state);
});

test('only completed tournaments can be archived and pending imports cannot be frozen',async t=>{
 const f=await completed(t),original=await f.repo.getTournament(f.id);
 for(const status of ['DRAFT','READY','IN_PROGRESS','CANCELLED']){
  await f.repo.saveTournament({...original,status});await assert.rejects(f.archive(),/completed/);assert.equal((await f.repo.getTournament(f.id)).status,status);
 }
 await f.repo.saveTournament({...original,settings:{...original.settings,importJob:{state:'RUNNING'}}});await assert.rejects(f.archive(),/import/i);
});

test('all management mutations reject archived tournaments, including old Top8 sessions and Fortnite reopen',async t=>{
 const f=await completed(t);await f.archive();const original=await f.repo.getTournament(f.id),state=await f.repo.getFortniteState(f.id),players=await f.repo.listParticipants(f.id);
 const registration=new RegistrationService(f.repo,f.tournaments,{configured:true,async send(){}},'https://test.example');
 const calls=[
  ()=>f.tournaments.updateTournament(f.id,{...original,title:'Changed'}),()=>f.tournaments.updateSetups(f.id,5),
  ()=>f.tournaments.deleteTournament(f.id),()=>f.tournaments.resetTournament(f.id),()=>f.tournaments.generateBracket(f.id),
  ()=>f.tournaments.startTournament(f.id),()=>f.tournaments.addParticipant(f.id,{displayName:'New'}),
  ()=>f.tournaments.updateParticipant(f.id,players[0].id,{displayName:'New'}),()=>f.tournaments.deleteParticipant(f.id,players[0].id),
  ()=>f.tournaments.startBackgroundImport(f.id,{eventUrl:'https://start.gg/tournament/test/event/singles'}),
  ()=>f.repo.saveTopProject(f.id,0,{title:'Late editor'}),()=>registration.updateOptions(f.id,{displayEnabled:true}),
  ()=>registration.updateOptions(f.id,{registrationEnabled:true}),()=>registration.recover(f.id,'test@example.test','127.0.0.1'),
  ()=>f.action({action:'REOPEN',revision:state.revision,reason:'Old panel'})
 ];
 for(const call of calls)await assert.rejects(call(),/archived/i);
 assert.deepEqual(await f.repo.getTournament(f.id),original);assert.deepEqual(await f.repo.getFortniteState(f.id),state);assert.deepEqual(await f.repo.listParticipants(f.id),players);
 assert.equal(await f.repo.getTopProject(f.id),null);assert.equal((await registration.publicInfo(f.id)).open,false);
});

test('archived team rosters are read-only, including reads when an old team has no invitation code',async t=>{
 const f=await completed(t),original=await f.repo.getTournament(f.id);
 await f.repo.saveTournament({...original,settings:{...original.settings,bracketMode:'STANDARD',teamSize:2,reserveCount:1}});
 const teams=new TeamsService(f.repo,f.tournaments);await f.archive();
 const view=await teams.overview(f.id);assert.equal(view.canEdit,false);assert.equal(view.canSubstitute,false);assert.equal((await f.repo.listTeamCodes(f.id)).length,0);
 for(const action of [{action:'SOLO_OPTION',enabled:true},{action:'ROTATE_CODE',teamId:f.participants[0].id,code:'old'}])await assert.rejects(teams.action(f.id,action));
 assert.equal((await f.repo.listTeamCodes(f.id)).length,0);
});

test('archiving waits for running jobs and current failed results but not obsolete failures',async t=>{
 const f=await completed(t);const now=new Date().toISOString();
 await f.repo.replaceMatches(f.id,[{id:'match',tournamentId:f.id,status:'COMPLETED',bracketStage:'FINALS',roundNumber:1,matchNumber:1,bestOf:3,advancersRequired:1,participants:[],externalRef:{provider:'START_GG',setId:'1',localSyncVersion:2},createdAt:now,updatedAt:now}]);
 for(const state of ['PENDING','RUNNING','FAILED']){
  await f.repo.saveSyncJob({id:'job',tournamentId:f.id,matchId:'match',version:2,action:'set-completion',attempts:1,state,updatedAt:now});
  await assert.rejects(f.archive(),/submissions/);
 }
 await f.repo.saveSyncJob({id:'job',tournamentId:f.id,matchId:'match',version:1,action:'set-completion',attempts:1,state:'FAILED',updatedAt:now});await f.archive();
});

test('archive and editing are serialized and restoring re-enables explicit changes',async t=>{
 const f=await completed(t);
 const results=await Promise.allSettled([f.archive(),f.tournaments.updateSetups(f.id,6)]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');
 assert.equal((await f.repo.getTournament(f.id)).settings.setupCount,1);
 await f.restore();await f.tournaments.updateSetups(f.id,6);assert.equal((await f.repo.getTournament(f.id)).settings.setupCount,6);
});

test('archive HTTP endpoints require management and public lists omit the archive',async t=>{
 const f=await completed(t),app=express();app.use(express.json());
 app.use((req,res,next)=>{if(req.header('Authorization')==='Bearer fixture-manager')res.locals.managementUser={id:'manager',role:'MANAGER'};next();});
 app.use('/api/tournaments',createTournamentRouter(f.tournaments));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/api/tournaments`,headers={Authorization:'Bearer fixture-manager','Content-Type':'application/json'};
 assert.equal((await fetch(base+'/'+f.id+'/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"archived":true}'})).status,403);
 assert.equal((await fetch(base+'/'+f.id+'/archive',{method:'POST',headers,body:'{"archived":true}'})).status,200);
 const rejected=await fetch(base+'/'+f.id+'/setups',{method:'POST',headers,body:'{"setupCount":5,"streamCount":0}'});
 assert.equal(rejected.status,409);assert.match((await rejected.json()).message,/archived/i);
 assert.deepEqual(await(await fetch(base)).json(),[]);assert.equal((await fetch(base+'?includeArchived=true')).status,403);
 assert.equal((await(await fetch(base+'?includeArchived=true',{headers})).json())[0].status,'ARCHIVED');
 assert.equal((await fetch(base+'/'+f.id+'/archive',{method:'POST',headers,body:'{"archived":false}'})).status,200);
});

test('registration maintenance reloads archive state under the lock before changing a deadline',async t=>{
 const f=await completed(t),before=await f.repo.getTournament(f.id);
 const candidate={...before,settings:{...before.settings,registrationEnabled:true,registrationClosesAt:'2000-01-01T00:00:00.000Z'}};
 await f.repo.saveTournament(candidate);await f.archive();const archived=await f.repo.getTournament(f.id);
 // A worker may have read this candidate just before a manager archives it.
 f.repo.listTournaments=async()=>[candidate];
 const registration=new RegistrationService(f.repo,f.tournaments,{configured:true,async send(){}},'https://test.example');
 await registration.maintenance();assert.deepEqual(await f.repo.getTournament(f.id),archived);
});

test('a completed local bracket remains readable but stale results and idempotent replays cannot change its archive',async t=>{
 const f=await fortniteFixture(t,{count:4,size:5,games:1}),id=f.tournament.id;
 await f.repo.saveTournament({...f.tournament,settings:{...f.tournament.settings,bracketMode:'STANDARD',format:'SINGLE_ELIMINATION',bestOf:1}});
 await f.tournaments.generateBracket(id);await f.tournaments.startTournament(id);
 let last;
 for(let n=0;n<10;n++){
  const overview=await f.tournaments.getTournamentOverview(id);if(overview.tournament.status==='COMPLETED')break;
  const match=overview.matches.find(m=>m.status==='PENDING'&&m.participants.length===2&&m.participants.every(p=>p.participantId.startsWith('player-')));
  assert.ok(match,'A playable match must exist');
  await f.tournaments.callMatch(id,match.id,{calledByUserId:'test',stationLabel:'Setup 1'});
  await f.tournaments.startMatch(id,match.id,{startedByUserId:"test"});
  last={matchId:match.id,winner:match.participants[0].participantId,operationId:'archive-result-'+match.id,input:{winnerParticipantId:match.participants[0].participantId,scores:match.participants.map((p,i)=>({participantId:p.participantId,score:i===0?1:0}))}};
  await operationRequest.run({id:last.operationId},()=>f.tournaments.reportResult(id,last.matchId,last.input));
 }
 assert.equal((await f.repo.getTournament(id)).status,'COMPLETED');
 const matches=await f.repo.listMatches(id);await f.tournaments.setArchived(id,true);
 assert.deepEqual((await f.tournaments.getTournamentOverview(id)).matches.map(m=>m.id),matches.map(m=>m.id));
 await assert.rejects(operationRequest.run({id:last.operationId},()=>f.tournaments.reportResult(id,last.matchId,last.input)),/archived/i);
 for(const call of [()=>f.tournaments.resetMatch(id,last.matchId),()=>f.tournaments.callMatch(id,last.matchId,{calledByUserId:'test'}),()=>f.tournaments.startMatch(id,last.matchId)])await assert.rejects(call(),/archived/i);
 assert.deepEqual(await f.repo.listMatches(id),matches);
});
