import test from 'node:test';
import assert from 'node:assert/strict';
import {TournamentsService} from '../dist/modules/tournaments/tournaments.service.js';

function fixture(overrides={}) {
 const now=new Date().toISOString();
 const repo={
  tournament:{id:'t',title:'Local',gameTitle:'Test',status:'IN_PROGRESS',settings:{format:'SINGLE_ELIMINATION',bestOf:3}},
  matches:[{id:'m',tournamentId:'t',bracketStage:'FINALS',roundNumber:1,matchNumber:1,status:'PLAYING',bestOf:3,advancersRequired:1,createdAt:now,updatedAt:now,
   participants:[{participantId:'a',displayName:'Alpha',slot:1,score:0},{participantId:'b',displayName:'Beta',slot:2,score:0}],...overrides}],
  async getTournament(){return structuredClone(this.tournament);},async listMatches(){return structuredClone(this.matches);},
  async listParticipants(){return ['a','b'].map(id=>({id,displayName:id,status:'ACTIVE'}));},
  async replaceMatches(_,matches){this.matches=structuredClone(matches);},async saveTournament(t){this.tournament=structuredClone(t);},
 };
 return {repo,service:new TournamentsService(repo)};
}
const scores=(a,b)=>[{participantId:'a',score:a},{participantId:'b',score:b}];
const games=ids=>ids.map(winnerParticipantId=>({winnerParticipantId}));

test('summary reports require a real winner, every entrant once and a valid deciding score',async()=>{
 const invalid=[
  {winnerParticipantId:'outsider',scores:[{participantId:'outsider',score:2},...scores(0,0)]},
  {winnerParticipantId:'a',scores:scores(0,2)},
  {winnerParticipantId:'a',scores:scores(2,2)},
  {winnerParticipantId:'a',scores:scores(1,0)},
  {winnerParticipantId:'a',scores:scores(3,0)},
  {winnerParticipantId:'a',scores:[{participantId:'a',score:2}]},
  {winnerParticipantId:'a',scores:[...scores(2,0),{participantId:'a',score:2}]},
  {winnerParticipantId:'a',scores:[...scores(2,0),{participantId:'outsider',score:0}]},
  {winnerParticipantId:'a',scores:scores(2,-1)},
  {winnerParticipantId:'a',scores:scores(2,0.5)},
 ];
 for(const input of invalid){
  const f=fixture(),before=structuredClone(f.repo.matches);
  await assert.rejects(f.service.reportResult('t','m',input),undefined,JSON.stringify(input));
  assert.deepEqual(f.repo.matches,before);assert.equal(f.repo.tournament.status,'IN_PROGRESS');
 }
});

test('summary reports reconstruct a game sequence that ends with the deciding victory',async()=>{
 const f=fixture();await f.service.reportResult('t','m',{winnerParticipantId:'a',scores:scores(2,1)});
 assert.equal(f.repo.matches[0].gameResults.at(-1),'a');
 assert.equal(f.repo.matches[0].gameResults.slice(0,-1).filter(id=>id==='a').length,1);
 assert.equal(f.repo.matches[0].winnerParticipantId,'a');
});

test('detailed reports reject games played after the set was already decided',async()=>{
 for(const input of [{games:games(['a','a','b'])},{bestOfOverride:5,games:games(['b','b','b','a'])}]){
  const f=fixture(),before=structuredClone(f.repo.matches);
  await assert.rejects(f.service.reportDetailedResult('t','m',input));assert.deepEqual(f.repo.matches,before);
 }
});

test('valid detailed sequences and explicit Bo changes still work',async()=>{
 const f=fixture();await f.service.reportDetailedResult('t','m',{games:games(['a','b','a'])});
 assert.deepEqual(f.repo.matches[0].participants.map(p=>p.score),[2,1]);
 await f.service.reportDetailedResult('t','m',{bestOfOverride:1,games:games(['b'])});
 assert.equal(f.repo.matches[0].reportedBestOf,1);assert.equal(f.repo.matches[0].winnerParticipantId,'b');
 await f.service.reportDetailedResult('t','m',{bestOfOverride:3,games:games(['a','a'])});
 assert.equal(f.repo.matches[0].reportedBestOf,undefined);
});

test('correcting a result without a new Bo selection preserves the existing override',async()=>{
 const f=fixture({bestOf:5,reportedBestOf:1});
 await f.service.reportDetailedResult('t','m',{games:games(['b'])});
 assert.equal(f.repo.matches[0].reportedBestOf,1);assert.equal(f.repo.matches[0].winnerParticipantId,'b');
 const summary=fixture({bestOf:5,reportedBestOf:1});
 await summary.service.reportResult('t','m',{winnerParticipantId:'a',scores:scores(1,0)});
 assert.equal(summary.repo.matches[0].reportedBestOf,1);
});

test('summary reports clear obsolete per-game characters and preserve the current entrant selection',async()=>{
 const f=fixture({gameCharacterSelections:[{gameNum:1,selections:[{participantId:'a',characterName:'Mario'}]}],characterSelections:[{participantId:'a',characterName:'Mario'}]});
 await f.service.reportResult('t','m',{winnerParticipantId:'b',scores:scores(0,2)});
 assert.deepEqual(f.repo.matches[0].gameCharacterSelections,[]);assert.deepEqual(f.repo.matches[0].characterSelections,[{participantId:'a',characterName:'Mario'}]);
});

test('incremental reporting uses the same overridden Bo as detailed and summary reports',async()=>{
 const f=fixture({bestOf:5,reportedBestOf:1});await f.service.recordGameWin('t','m',{participantId:'a'});
 assert.equal(f.repo.matches[0].status,'COMPLETED');assert.equal(f.repo.matches[0].winnerParticipantId,'a');
});
