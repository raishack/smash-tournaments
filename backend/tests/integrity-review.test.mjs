import test from 'node:test';
import assert from 'node:assert/strict';
import {TournamentsService} from '../dist/modules/tournaments/tournaments.service.js';
import {buildTop8Data} from '../dist/modules/top8/top8-data.js';
import {fortniteFixture} from './fixtures/fortnite-fixture.mjs';

function fixture(settings={},count=8) {
 const repo={
  tournament:{id:'local',title:'Local review',gameTitle:'Test',status:'DRAFT',maxParticipants:32,settings:{format:'SINGLE_ELIMINATION',bracketMode:'STANDARD',bestOf:3,seedingMethod:'MANUAL',...settings}},
  participants:Array.from({length:count},(_,i)=>({id:'p'+i,displayName:'Player '+i,seed:i+1,status:'ACTIVE',checkedIn:true})),matches:[],
  async getTournament(){return structuredClone(this.tournament);},async saveTournament(t){this.tournament=structuredClone(t);},
  async listParticipants(){return structuredClone(this.participants);},async replaceParticipants(_,p){this.participants=structuredClone(p);},
  async listMatches(){return structuredClone(this.matches);},async replaceMatches(_,m){this.matches=structuredClone(m);},
  async listTeamMembers(){return this.participants.filter(p=>p.checkedIn).flatMap(p=>[0,1].map(i=>({id:p.id+'-'+i,teamId:p.id,role:'PLAYER'})));},
 };
 return {repo,service:new TournamentsService(repo)};
}
const playable=m=>!['COMPLETED','WALKOVER'].includes(m.status)&&m.participants.length===2&&m.participants.every(p=>/^p\d+$/.test(p.participantId));
async function start(f){await f.service.generateBracket('local');await f.service.startTournament('local');}
async function result(f,m,winner=m.participants[0].participantId,loserScore=0) {
 const loser=m.participants.find(p=>p.participantId!==winner).participantId;
 await f.service.reportDetailedResult('local',m.id,{games:[...Array(loserScore).fill(loser),winner,winner].map(winnerParticipantId=>({winnerParticipantId}))});
}
async function finish(f,reset=false) {
 for(let n=0;n<80&&f.repo.tournament.status!=='COMPLETED';n++){
  const m=f.repo.matches.find(playable);assert(m,'There must be a playable set');
  await result(f,m,reset&&m.bracketStage==='FINALS'&&m.roundNumber===1?m.participants[1].participantId:m.participants[0].participantId);
 }
 assert.equal(f.repo.tournament.status,'COMPLETED');
}

test('correcting a local score with the same winner keeps later results and the final Top 8',async()=>{
 for(const format of ['SINGLE_ELIMINATION','DOUBLE_ELIMINATION'])for(const kind of ['summary','detailed']) {
  const f=fixture({format});await start(f);await finish(f);
  const m=f.repo.matches.find(m=>m.bracketStage==='WINNERS'&&m.roundNumber===1),others=structuredClone(f.repo.matches.filter(x=>x.id!==m.id));
  const top=buildTop8Data(f.repo.tournament,f.repo.participants,f.repo.matches).players;
  if(kind==='summary')await f.service.reportResult('local',m.id,{winnerParticipantId:m.winnerParticipantId,scores:m.participants.map(p=>({participantId:p.participantId,score:p.participantId===m.winnerParticipantId?2:1}))});
  else await result(f,m,m.winnerParticipantId,1);
  assert.deepEqual(f.repo.matches.filter(x=>x.id!==m.id),others,format+'/'+kind);
  assert.equal(f.repo.tournament.status,'COMPLETED');assert.deepEqual(buildTop8Data(f.repo.tournament,f.repo.participants,f.repo.matches).players,top);
  assert.equal(f.repo.matches.find(x=>x.id===m.id).participants.find(p=>p.participantId!==m.winnerParticipantId).score,1);
 }
});

test('a same-winner correction preserves a called next set and an already played grand final reset',async()=>{
 const f=fixture({},4);await start(f);
 const first=f.repo.matches[0];await result(f,first);await result(f,f.repo.matches[1]);
 const next=f.repo.matches.find(playable);await f.service.callMatch('local',next.id,{calledByUserId:'manager',stationLabel:'Setup 1'});
 const called=structuredClone(f.repo.matches.find(m=>m.id===next.id));await result(f,first,first.participants[0].participantId,1);
 assert.deepEqual(f.repo.matches.find(m=>m.id===next.id),called);
 const de=fixture({format:'DOUBLE_ELIMINATION'},4);await start(de);await finish(de,true);
 const gf=de.repo.matches.find(m=>m.bracketStage==='FINALS'&&m.roundNumber===1),reset=structuredClone(de.repo.matches.find(m=>m.bracketStage==='FINALS'&&m.roundNumber===2));
 await result(de,gf,gf.winnerParticipantId,1);assert.deepEqual(de.repo.matches.find(m=>m.id===reset.id),reset);assert.equal(de.repo.tournament.status,'COMPLETED');
});

test('changing the winner still resets dependent results and keeps independent branches',async()=>{
 const f=fixture({},4);await start(f);await finish(f);
 const first=f.repo.matches[0],independent=structuredClone(f.repo.matches[1]);
 await result(f,first,first.participants.find(p=>p.participantId!==first.winnerParticipantId).participantId);
 assert.equal(f.repo.tournament.status,'IN_PROGRESS');assert.deepEqual(f.repo.matches[1],independent);assert.equal(f.repo.matches.at(-1).winnerParticipantId,undefined);
 await finish(f);assert.equal(f.repo.tournament.status,'COMPLETED');
});

test('standard and Mario Kart draws honor active status and required check-in',async()=>{
 for(const bracketMode of ['STANDARD','MKART']) {
  const f=fixture({bracketMode,checkInRequired:true},6);f.repo.participants[2].checkedIn=false;f.repo.participants[3].status='DISQUALIFIED';f.repo.participants[4].status='ELIMINATED';
  await f.service.generateBracket('local');
  const drawn=new Set(f.repo.matches.flatMap(m=>m.participants.map(p=>p.participantId)).filter(id=>/^p\d+$/.test(id)));
  assert.deepEqual([...drawn].sort(),['p0','p1','p5']);assert.equal(f.repo.participants.length,6);
 }
 const optional=fixture({checkInRequired:false},4);optional.repo.participants.forEach(p=>p.checkedIn=false);optional.repo.participants[3].status='DISQUALIFIED';
 await optional.service.generateBracket('local');assert(!optional.repo.matches.some(m=>m.participants.some(p=>p.participantId==='p3')));assert(optional.repo.matches.some(m=>m.participants.some(p=>p.participantId==='p2')));
});

test('insufficient eligible players leave registration and any existing draw unchanged',async()=>{
 const f=fixture({checkInRequired:true,registrationEnabled:true},3);f.repo.participants.slice(1).forEach(p=>p.checkedIn=false);
 const before=structuredClone(f.repo.tournament);await assert.rejects(f.service.generateBracket('local'),/dos|two|asistencia/i);
 assert.deepEqual(f.repo.tournament,before);assert.deepEqual(f.repo.matches,[]);
});

test('changing eligibility before start invalidates a prepared draw; after start it is rejected',async()=>{
 for(const field of ['checkedIn','status']) {
  const f=fixture({checkInRequired:true},4);await f.service.generateBracket('local');
  const input={displayName:'Player 0',[field]:field==='checkedIn'?false:'DISQUALIFIED'};
  await f.service.updateParticipant('local','p0',input);assert.equal(f.repo.matches.length,0,field);assert.equal(f.repo.tournament.status,'DRAFT');
  await start(f);const before=structuredClone(f.repo.participants);
  await assert.rejects(f.service.updateParticipant('local','p0',{displayName:'Player 0',[field]:field==='checkedIn'?true:'ACTIVE'}));assert.deepEqual(f.repo.participants,before);
 }
});

test('enabling required check-in invalidates a previously prepared draw',async()=>{
 const f=fixture({checkInRequired:false},4);await f.service.generateBracket('local');
 await f.service.updateTournament('local',{...f.repo.tournament,settings:{...f.repo.tournament.settings,checkInRequired:true}});
 assert.equal(f.repo.matches.length,0);assert.equal(f.repo.tournament.status,'DRAFT');
});

test('only eligible teams need complete rosters to draw; absent teams remain registered',async()=>{
 const f=fixture({teamSize:2,reserveCount:0,checkInRequired:true},3);f.repo.participants[2].checkedIn=false;
 await f.service.generateBracket('local');assert.equal(f.repo.matches.length,1);assert.equal(f.repo.participants.length,3);
});

test('local Top 8 excludes registered players absent from the bracket and retains played DQs',async()=>{
 const f=fixture({},4);await start(f);await finish(f);
 f.repo.participants.push({id:'not-drawn',displayName:'Absent registration',status:'ACTIVE'});f.repo.participants[3].status='DISQUALIFIED';
 const data=buildTop8Data(f.repo.tournament,f.repo.participants,f.repo.matches);
 assert.equal(data.players.length,4);assert(!data.players.some(p=>p.id==='not-drawn'));assert(data.players.some(p=>p.id==='p3'));assert(!data.warnings.some(w=>w.includes('puestos')));
});

test('real persistence preserves corrected results, eligibility, audit and archived read-only state',async t=>{
 const f=await fortniteFixture(t,{count:5}),id=f.tournament.id;
 await f.repo.saveTournament({...f.tournament,settings:{...f.tournament.settings,bracketMode:'STANDARD',checkInRequired:true,seedingMethod:'MANUAL'}});
 await f.repo.replaceParticipants(id,f.participants.map((p,i)=>({...p,checkedIn:i<4})));
 await f.tournaments.generateBracket(id);await f.tournaments.startTournament(id);
 for(let i=0;i<3;i++) {
  const m=(await f.repo.listMatches(id)).find(m=>m.status==='PENDING'&&m.participants.every(p=>p.participantId.startsWith('player-')));assert(m);
  await f.tournaments.reportDetailedResult(id,m.id,{games:[0,1].map(()=>({winnerParticipantId:m.participants[0].participantId}))});
 }
 const before=await f.repo.listMatches(id),first=before.find(m=>m.roundNumber===1),winner=first.winnerParticipantId;
 await f.tournaments.reportResult(id,first.id,{winnerParticipantId:winner,scores:first.participants.map(p=>({participantId:p.participantId,score:p.participantId===winner?2:1}))});
 const after=await f.repo.listMatches(id);assert.deepEqual(after.filter(m=>m.id!==first.id),before.filter(m=>m.id!==first.id));
 assert.equal((await f.repo.getTournament(id)).status,'COMPLETED');
 assert.equal(buildTop8Data(await f.repo.getTournament(id),await f.repo.listParticipants(id),after).players.length,4);
 assert((await f.repo.listActivity(id)).some(a=>a.action==='reportResult'&&a.matchId===first.id));
 await f.tournaments.setArchived(id,true);
 await assert.rejects(f.tournaments.reportDetailedResult(id,first.id,{games:[0,1].map(()=>({winnerParticipantId:winner}))}),/archived/i);
 assert.deepEqual(await f.repo.listMatches(id),after);
});
