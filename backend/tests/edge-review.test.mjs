import test from 'node:test';
import assert from 'node:assert/strict';
import {TournamentsService} from '../dist/modules/tournaments/tournaments.service.js';
import {NoopTournamentNotifier} from '../dist/modules/tournaments/tournament-notifier.js';

function fixture() {
  const repo={
    tournament:{id:'t',title:'Local',gameTitle:'Test',status:'DRAFT',maxParticipants:16,settings:{format:'DOUBLE_ELIMINATION',bracketMode:'STANDARD',bestOf:1,setupCount:2,seedingMethod:'MANUAL'}},
    participants:Array.from({length:5},(_,i)=>({id:`p${i+1}`,displayName:`Player ${i+1}`,seed:i+1,status:'ACTIVE',checkedIn:false})),matches:[],
    async getTournament(){return structuredClone(this.tournament);},
    async listParticipants(){return structuredClone(this.participants);},
    async listMatches(){return structuredClone(this.matches);},
    async replaceParticipants(_,rows){this.participants=structuredClone(rows);},
    async replaceMatches(_,rows){this.matches=structuredClone(rows);},
    async saveTournament(row){this.tournament=structuredClone(row);},
    async replaceOverview(t,p,m){this.tournament=structuredClone(t);this.participants=structuredClone(p);this.matches=structuredClone(m);},
    async appendActivity(){},
  };
  let notifications=0,launches=0;
  const notifier=new NoopTournamentNotifier();notifier.notifyMatchCalled=async()=>{notifications++;};
  const service=new TournamentsService(repo,notifier);
  // Capture scheduling: no external requests are made by this regression suite.
  service.launchBackgroundImport=()=>{launches++;};
  return {repo,service,notifications:()=>notifications,launches:()=>launches};
}
const importInput={eventUrl:'https://start.gg/tournament/fixture/event/singles',syncResults:false,preserveTournamentTitle:true};
const snapshot={eventId:'1',eventName:'Imported',eventUrl:importInput.eventUrl,eventSlug:'fixture',gameTitle:'Test',format:'DOUBLE_ELIMINATION',bestOf:3,participants:[],matches:[]};
const snapshotOptions={syncResults:false,preserveTournamentTitle:true,preserveLocalProgress:false};
async function started() {
  const f=fixture();await f.service.generateBracket('t');await f.service.startTournament('t');
  f.match=f.repo.matches.find(m=>m.participants.length===2&&m.participants.every(p=>/^p\d+$/.test(p.participantId)));
  return f;
}

test('background import cannot replace started or closed local tournaments without played games',async()=>{
  for(const status of ['IN_PROGRESS','COMPLETED','CANCELLED']) {
    const f=await started();f.repo.tournament.status=status;
    const before=structuredClone(f.repo.matches);
    await assert.rejects(f.service.startBackgroundImport('t',importInput),/iniciad|cerrado|active local/i);
    assert.equal(f.launches(),0);assert.equal(f.repo.tournament.settings.importJob,undefined);assert.deepEqual(f.repo.matches,before);
  }
});

test('import worker rechecks local lifecycle before calling start.gg',async()=>{
  for(const status of ['IN_PROGRESS','COMPLETED','CANCELLED']) {
    const f=await started();f.repo.tournament.status=status;let fetched=false;
    f.service.loadStableStartggSnapshot=async()=>{fetched=true;throw Error('Unexpected external fetch');};
    await assert.rejects(f.service.importFromStartgg('t',importInput),/iniciad|cerrado|active local/i);
    assert.equal(fetched,false);
  }
});

test('a late start.gg snapshot never recreates a deleted tournament',async()=>{
  const f=fixture(),oldTournament=structuredClone(f.repo.tournament);f.repo.tournament=undefined;
  await assert.rejects(f.service.applyStartggSnapshot(oldTournament,snapshot,snapshotOptions),/not found/i);
  assert.equal(f.repo.tournament,undefined);
});

test('snapshot commit rechecks local state after the external fetch',async()=>{
  const f=fixture();await f.service.generateBracket('t');
  let release,entered;const fetching=new Promise(resolve=>{entered=resolve;});
  f.service.loadStableStartggSnapshot=async()=>{entered();return new Promise(resolve=>{release=resolve;});};
  const pending=f.service.importFromStartgg('t',importInput);await fetching;
  await f.service.startTournament('t');const before=structuredClone(f.repo.matches);release(snapshot);
  await assert.rejects(pending,/iniciad|cerrado|active local/i);
  assert.equal(f.repo.tournament.status,'IN_PROGRESS');assert.deepEqual(f.repo.matches,before);
});

test('unstarted local draws and mirrored tournaments can still import',async()=>{
  const local=fixture();await local.service.generateBracket('t');
  await local.service.startBackgroundImport('t',importInput);assert.equal(local.launches(),1);
  const mirrored=await started();mirrored.repo.tournament.importSource={provider:'START_GG'};
  mirrored.service.loadStableStartggSnapshot=async()=>snapshot;
  const result=await mirrored.service.importFromStartgg('t',importInput);assert.equal(result.tournament.importSource.eventId,'1');
});

test('calling a playing or closed match cannot rewind it or send a false notice',async()=>{
  for(const status of ['PLAYING','COMPLETED','WALKOVER','CANCELLED']) {
    const f=await started();f.match.status=status;
    const before=structuredClone(f.repo.matches);
    await assert.rejects(f.service.callMatch('t',f.match.id,{calledByUserId:'test',stationLabel:'Setup 1'}),/llamar|estado|pending/i);
    assert.deepEqual(f.repo.matches,before);assert.equal(f.notifications(),0);
  }
});

test('cancel call cannot reopen played or resolved matches and preserves downstream winners',async()=>{
  for(const status of ['PENDING','PLAYING','COMPLETED','WALKOVER','CANCELLED']) {
    const f=await started();f.match.status=status;f.match.winnerParticipantId=f.match.participants[0].participantId;
    const before=structuredClone(f.repo.matches);
    await assert.rejects(f.service.cancelMatchCall('t',f.match.id),/llamada|estado|called/i);
    assert.deepEqual(f.repo.matches,before);
  }
  const f=await started();f.match.status='CALLED';f.match.call={startedAt:new Date().toISOString()};
  await assert.rejects(f.service.cancelMatchCall('t',f.match.id),/llamada|estado|called/i);
});

test('start cannot restart a playing or closed match from an outdated client',async()=>{
  for(const mirrored of [false,true])for(const status of ['PLAYING','COMPLETED','WALKOVER','CANCELLED']) {
    const f=await started();f.match.status=status;
    if(mirrored){f.repo.tournament.importSource={provider:'START_GG'};f.match.externalRef={provider:'START_GG',setId:'1'};}
    const before=structuredClone(f.repo.matches);
    await assert.rejects(f.service.startMatch('t',f.match.id,{startedByUserId:'test'}),/iniciar|estado|pending|reported/i);
    assert.deepEqual(f.repo.matches,before);
  }
});

test('normal call, cancel, recall and start still work',async()=>{
  const f=await started(),id=f.match.id;
  await f.service.callMatch('t',id,{calledByUserId:'test',stationLabel:'Setup 1'});
  assert.equal((await f.service.cancelMatchCall('t',id)).status,'PENDING');
  await f.service.callMatch('t',id,{calledByUserId:'test',stationLabel:'Setup 2'});
  const match=await f.service.startMatch('t',id,{startedByUserId:'test'});
  assert.equal(match.status,'PLAYING');assert.equal(match.call.stationLabel,'Setup 2');assert.equal(f.notifications(),2);
});
