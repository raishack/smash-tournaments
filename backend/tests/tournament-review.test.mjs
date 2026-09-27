import test from 'node:test';
import assert from 'node:assert/strict';
import { tournamentReview } from '../dist/modules/tournaments/tournament-review.js';
import { fortniteFixture, report } from './fixtures/fortnite-fixture.mjs';
import express from 'express';
import { createTournamentRouter } from '../dist/modules/tournaments/tournaments.routes.js';

const now = Date.parse('2026-09-27T12:00:00Z');
function input() {
  return { tournament: { id: 't', status: 'DRAFT', settings: { bracketMode: 'STANDARD', teamSize: 1, checkInRequired: true, registrationEnabled: true } },
    participants: [ { id: 'a', displayName: 'Álex', status: 'ACTIVE', checkedIn: true }, { id: 'b', displayName: 'Equipo B', status: 'ACTIVE', checkedIn: false } ],
    matches: [], members: [], registrations: [], jobs: [], fortnite: null, activeLadder: false, importing: false };
}
const item=(review,id)=>review.items.find(row=>row.id===id);
test('Preparation distinguishes confirmed attendance, optional check-in and unopened draw', () => {
  const data=input(), before=structuredClone(data), review=tournamentReview(data,now);
  assert.equal(item(review,'participants').level,'BLOCKED');
  assert.match(item(review,'attendance').detail,/Quedarán fuera/);
  assert.equal(item(review,'draw').level,'BLOCKED');
  assert.equal(item(review,'registration').level,'WARNING');
  assert.deepEqual(data,before);
  data.tournament.settings.checkInRequired=false;
  assert.equal(item(tournamentReview(data,now),'participants').level,'OK');
});
test('Teams distinguish incomplete eligible teams, reserves and unassigned solo players', () => {
  const data=input();data.tournament.settings.teamSize=2;data.tournament.settings.reserveCount=1;
  data.members=[{teamId:'a',role:'PLAYER'},{teamId:'a',role:'PLAYER'}, {teamId:null,role:'PLAYER'}];
  assert.equal(item(tournamentReview(data,now),'teams').level,'WARNING');
  assert.equal(item(tournamentReview(data,now),'solo').level,'WARNING');
  data.participants[1].checkedIn=true;
  assert.equal(item(tournamentReview(data,now),'teams').level,'BLOCKED');
  data.members.push({teamId:'b',role:'PLAYER'},{teamId:'b',role:'PLAYER'});
  assert.equal(item(tournamentReview(data,now),'teams').level,'OK');
  data.members.push({teamId:'b',role:'RESERVE'},{teamId:'b',role:'RESERVE'});
  assert.equal(item(tournamentReview(data,now),'teams').level,'BLOCKED');
});
test('Expired/cancelled registrations do not inflate pending counts; no private registration data', () => {
  const data=input();data.tournament.settings.registrationClosesAt='2026-09-26T12:00:00Z';
  const registration={email:'private@example.invalid',tokenHash:'private-token',nickname:'Private',expiresAt:'2026-09-28T12:00:00Z'};
  data.registrations=[registration,{...registration,expiresAt:'2026-09-25T12:00:00Z'}, {...registration,meta:{waitingAt:'today'}},{...registration,meta:{cancelledAt:'today'}}];
  const review=tournamentReview(data,now);
  assert.equal(item(review,'registration').level,'OK');
  assert.match(item(review,'waiting').detail,/1 en lista de espera · 1 correos/);
  assert.doesNotMatch(JSON.stringify(review),/private-token|private@example|Private/);
});
test('Closing uses only current failed sync jobs and blocks archive until resolved', () => {
  const data=input();data.tournament.status='COMPLETED';data.tournament.importSource={provider:'START_GG'};
  data.matches=[{id:'m',externalRef:{localSyncVersion:2}}];
  data.jobs=[{matchId:'m',version:1,state:'FAILED'},{matchId:'m',version:2,state:'SYNCED'}];
  let review=tournamentReview(data,now);
  assert.equal(item(review,'sync').level,'OK');assert.equal(item(review,'archive').level,'OK');assert.deepEqual(review.standings,[]);
  data.jobs[1].state='FAILED';review=tournamentReview(data,now);
  assert.equal(item(review,'sync').level,'BLOCKED');assert.equal(item(review,'archive').level,'BLOCKED');
  data.jobs=[];data.activeLadder=true;assert.equal(item(tournamentReview(data,now),'archive').level,'BLOCKED');
  data.activeLadder=false;data.importing=true;assert.equal(item(tournamentReview(data,now),'archive').level,'BLOCKED');
});
test('Archived review never offers a mutation target or attendance editing', () => {
  const data=input();data.tournament.status='ARCHIVED';data.tournament.importSource={provider:'START_GG'};
  const review=tournamentReview(data,now);
  assert.equal(review.editable,false);assert.ok(review.items.every(row=>row.target===''));
  assert.equal(item(review,'archive'),undefined);assert.equal(item(review,'top8'),undefined);
});
test('Fortnite review reads real storage, locks attendance after draw and shows final standings excluding VIP', async t => {
  const f=await fortniteFixture(t,{count:2,size:5,games:1});
  let review=await f.tournaments.getReview(f.tournament.id);
  assert.equal(review.editable,true);assert.equal(item(review,'draw').target,'FORTNITE');
  await f.action({action:'GENERATE'});
  review=await f.tournaments.getReview(f.tournament.id);
  assert.equal(review.editable,false);assert.equal(item(review,'draw').level,'OK');
  const view=await f.view();const group=view.state.rounds[0].groups[0];
  await f.action(report(group));
  await f.action({action:'ADVANCE',revision:(await f.view()).state.revision});
  review=await f.tournaments.getReview(f.tournament.id);
  assert.equal(review.phase,'CLOSING');assert.deepEqual(review.standings.map(p=>p.placement),[1,2]);
  assert.ok(review.standings.every(p=>!p.name.includes('VIP')));
  assert.equal(await f.tournaments.getReview('absent'),undefined);
});

test('Attendance preserves current names and seeds, invalidates required-check-in draw and refuses archived edits', async t => {
  const f=await fortniteFixture(t,{count:2,size:5,games:1});
  await f.repo.saveTournament({...f.tournament,settings:{...f.tournament.settings,bracketMode:'STANDARD',checkInRequired:true}});
  await f.repo.replaceParticipants(f.tournament.id,f.participants.map((p,i)=>({...p,displayName:'Renamed '+i,seed:i+1,checkedIn:true})));
  await f.tournaments.generateBracket(f.tournament.id);
  assert.ok((await f.repo.listMatches(f.tournament.id)).length);
  await f.tournaments.updateAttendance(f.tournament.id,f.participants[0].id,false);
  const rows=await f.repo.listParticipants(f.tournament.id);
  assert.equal(rows[0].displayName,'Renamed 0');assert.equal(rows[0].seed,1);assert.equal(rows[0].checkedIn,false);
  assert.equal((await f.repo.listMatches(f.tournament.id)).length,0);
  await f.repo.saveTournament({...await f.repo.getTournament(f.tournament.id),status:'ARCHIVED'});
  await assert.rejects(f.tournaments.updateAttendance(f.tournament.id,f.participants[0].id,true),/archivado/i);
});

test('Review route denies public reads, uses no-store and returns 404 for a missing tournament', async t => {
  const app=express();app.use(express.json());
  app.use((req,res,next)=>{if(req.headers['x-test-manager']==='yes')res.locals.managementUser={id:'staff'};next();});
  app.use('/api/tournaments',createTournamentRouter({getReview:async id=>id==='t'?tournamentReview(input(),now):undefined}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/api/tournaments`;
  assert.equal((await fetch(base+'/t/review')).status,403);
  const result=await fetch(base+'/t/review',{headers:{'x-test-manager':'yes'}});
  assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(base+'/missing/review',{headers:{'x-test-manager':'yes'}})).status,404);
});
