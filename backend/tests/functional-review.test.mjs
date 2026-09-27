import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { TournamentsService } from '../dist/modules/tournaments/tournaments.service.js';
import { PlayerService } from '../dist/modules/player/player.service.js';
import { StartggOAuthClient } from '../dist/modules/player/startgg-oauth.client.js';
import { createPlayerRouter } from '../dist/modules/player/player.routes.js';
import { updateParticipantSchema } from '../dist/modules/tournaments/tournament.schemas.js';

function localFixture() {
  const repo = {
    tournament: {id:'t', title:'Local', status:'DRAFT', maxParticipants:16, settings:{format:'DOUBLE_ELIMINATION', bracketMode:'STANDARD', bestOf:1, seedingMethod:'MANUAL'}},
    participants: Array.from({length:5},(_,i)=>({id:`p${i+1}`,displayName:`Player ${i+1}`,seed:i+1,status:'ACTIVE',checkedIn:false})), matches:[],
    async getTournament(){return structuredClone(this.tournament);},
    async listParticipants(){return structuredClone(this.participants);},
    async listMatches(){return structuredClone(this.matches);},
    async replaceParticipants(_,values){this.participants=structuredClone(values);},
    async replaceMatches(_,values){this.matches=structuredClone(values);},
    async saveTournament(value){this.tournament=structuredClone(value);},
    async appendActivity(){},
  };
  return {repo,service:new TournamentsService(repo)};
}

test('regeneration cannot erase a started or completed local tournament', async()=>{
  for(const status of ['IN_PROGRESS','COMPLETED','CANCELLED']) {
    const f=localFixture();await f.service.generateBracket('t');f.repo.tournament.status=status;
    const before=structuredClone(f.repo.matches);
    await assert.rejects(f.service.generateBracket('t'),/reinicia|reset|started/i);
    assert.deepEqual(f.repo.matches,before);assert.equal(f.repo.tournament.status,status);
  }
});
test('real match activity also prevents regeneration if tournament status is stale',async()=>{
  const f=localFixture();await f.service.generateBracket('t');f.repo.matches.find(m=>m.participants.length===2).status='CALLED';
  await assert.rejects(f.service.generateBracket('t'),/reinicia|reset|started/i);
});
test('cancelled tournaments cannot be started again without an explicit reset',async()=>{
  const f=localFixture();await f.service.generateBracket('t');f.repo.tournament.status='CANCELLED';
  await assert.rejects(f.service.startTournament('t'),/cancelled/);
  assert.equal(f.repo.tournament.status,'CANCELLED');
});
test('individual tournament capacity cannot be lowered below confirmed entrants',async()=>{
  const f=localFixture();
  await assert.rejects(f.service.updateTournament('t',{...f.repo.tournament,maxParticipants:4}),/aforo/i);
  assert.equal(f.repo.tournament.maxParticipants,16);
});
test('starting locks structural options even before the first game; setups remain editable',async()=>{
  for (const status of ['IN_PROGRESS','COMPLETED','CANCELLED']) {
    for (const change of ['format','capacity']) {
      const f=localFixture();await f.service.generateBracket('t');f.repo.tournament.status=status;
      const before=structuredClone(f.repo.matches), input=structuredClone(f.repo.tournament);
      if(change==='format')input.settings.format='SINGLE_ELIMINATION';else input.maxParticipants=32;
      await assert.rejects(f.service.updateTournament('t',input),/options|opciones|iniciad/i);
      assert.deepEqual(f.repo.matches,before);assert.equal(f.repo.tournament.status,status);
    }
  }
  const f=localFixture();await f.service.generateBracket('t');await f.service.startTournament('t');
  const before=structuredClone(f.repo.matches);
  await f.service.updateSetups('t',4,2);
  assert.equal(f.repo.tournament.settings.setupCount,4);assert.deepEqual(f.repo.matches,before);
});
test('adding an entrant invalidates an unstarted draw including automatic byes',async()=>{
  const f=localFixture();await f.service.generateBracket('t');
  assert(f.repo.matches.some(m=>m.status==='COMPLETED'));
  await f.service.addParticipant('t',{displayName:'Late entry'});
  assert.equal(f.repo.matches.length,0);assert.equal(f.repo.tournament.status,'DRAFT');
  await f.service.generateBracket('t');
  assert(f.repo.matches.some(m=>m.participants.some(p=>p.displayName==='Late entry')));
});
test('participants cannot be added or removed after start even before the first result',async()=>{
  const f=localFixture();await f.service.generateBracket('t');await f.service.startTournament('t');
  await assert.rejects(f.service.addParticipant('t',{displayName:'Late entry'}));
  await assert.rejects(f.service.deleteParticipant('t','p1'));
  assert.equal(f.repo.participants.length,5);
});
test('changing a seed invalidates a ready draw and cannot change it after start',async()=>{
  const f=localFixture();await f.service.generateBracket('t');
  await f.service.updateParticipant('t','p1',{displayName:'Player 1',seed:6});
  assert.equal(f.repo.matches.length,0);assert.equal(f.repo.tournament.status,'DRAFT');
  await f.service.generateBracket('t');await f.service.startTournament('t');
  await assert.rejects(f.service.updateParticipant('t','p1',{displayName:'Player 1',seed:7}));
});
test('renaming a participant updates every drawn occurrence without losing results',async()=>{
  const f=localFixture();await f.service.generateBracket('t');await f.service.startTournament('t');
  const match=f.repo.matches.find(m=>m.participants.length===2 && m.participants.every(p=>/^p\d+$/.test(p.participantId)));
  const id=match.participants[0].participantId;
  await f.service.recordGameWin('t',match.id,{participantId:id});
  const before=structuredClone(f.repo.matches);
  await f.service.updateParticipant('t',id,{displayName:'Corrected name'});
  for(const m of f.repo.matches) {
    assert.equal(m.status,before.find(b=>b.id===m.id).status);
    assert.equal(m.winnerParticipantId,before.find(b=>b.id===m.id).winnerParticipantId);
    for(const p of m.participants.filter(p=>p.participantId===id))assert.equal(p.displayName,'Corrected name');
  }
});
test('an omitted seed preserves it, explicit clear removes it and invalidates the draw',async()=>{
  const f=localFixture();await f.service.generateBracket('t');
  await f.service.updateParticipant('t','p1',updateParticipantSchema.parse({displayName:'Player 1'}));
  assert.equal(f.repo.participants[0].seed,1);assert(f.repo.matches.length>0);
  await f.service.updateParticipant('t','p1',updateParticipantSchema.parse({displayName:'Player 1',clearSeed:true}));
  assert.equal(f.repo.participants[0].seed,undefined);assert.equal(f.repo.matches.length,0);
});
test('pending import cannot be reset, started, seeded or manually edited',async()=>{
  const f=localFixture();await f.service.generateBracket('t');f.repo.tournament.settings.importJob={state:'RUNNING'};
  for(const call of [()=>f.service.generateBracket('t'),()=>f.service.resetTournament('t'),()=>f.service.startTournament('t'),()=>f.service.addParticipant('t',{displayName:'New'}),()=>f.service.updateParticipant('t','p1',{displayName:'New'}),()=>f.service.deleteParticipant('t','p1')]) {
    await assert.rejects(call(),/importaci[oó]n/i);
  }
});

const identity={userId:'u',playerId:'42',gamerTag:'Same nick',displayName:'Same nick'};
test('start.gg participant lookup ignores matching nicks and checks every page for player identity',async()=>{
  const client=new StartggOAuthClient();const pages=[];
  client.graphql=async(_token,_query,vars)=>{
    pages.push(vars.page);
    return {event:{entrants:{pageInfo:{totalPages:2},nodes:vars.page===1
      ?[{id:1,name:'Same nick',participants:[{gamerTag:'Same nick',player:{id:99}}]}]
      :[{id:2,name:'Our doubles team',participants:[{gamerTag:'Changed nick',player:{id:42}}]}]}}};
  };
  assert.equal((await client.findEntrantForEvent('token','event',identity)).entrantId,'2');
  assert.deepEqual(pages,[1,2]);
  assert.deepEqual(await client.findEntrantForEvent('token','event',{...identity,playerId:undefined}),{});
});
test('Players never falls back to a local nickname, and caches confirmed non-membership',async()=>{
  let calls=0;
  const service=new PlayerService({deleteTournamentBinding:async()=>{}}, {listParticipants:async()=>[{id:'someone-else',displayName:'Same nick'}]}, {}, {}, {findEntrantForEvent:async()=>{calls++;return{};}});
  const t={id:'t',importSource:{provider:'START_GG',eventId:'e'}};
  const session={account:{id:'account'},identity};
  assert.equal(await service.findPlayerParticipantForTournament(session,t),undefined);
  assert.equal(await service.findPlayerParticipantForTournament(session,t),undefined);
  assert.equal(calls,1);
  await service.findPlayerParticipantForTournament(session,{...t,importSource:{...t.importSource,eventId:'different'}});
  assert.equal(calls,2);
});
test('parallel Players requests refresh the same account once and can retry after temporary failure',async()=>{
  let account={id:'a',tokenExpiresAt:new Date(0).toISOString(),refreshToken:'old',startggUserId:'u',startggPlayerId:'42',gamerTag:'nick'};
  let refreshes=0,fail=true;
  const repo={findSessionByTokenHash:async()=>({id:'s',accountId:'a'}),findAccountById:async()=>({...account}),saveAccount:async value=>(account=value),touchSession:async()=>{}};
  const oauth={refreshAccessToken:async()=>{refreshes++;await new Promise(r=>setTimeout(r,15));if(fail)throw Error('temporary');return {accessToken:'new',refreshToken:'rotated',expiresIn:3600};}};
  const service=new PlayerService(repo,{}, {}, {},oauth,'https://example.test');
  assert((await Promise.allSettled([service.requireSession('a'),service.requireSession('b')])).every(r=>r.status==='rejected'));
  assert.equal(refreshes,1);fail=false;
  const sessions=await Promise.all([service.requireSession('a'),service.requireSession('b'),service.requireSession('c')]);
  assert.equal(refreshes,2);assert(sessions.every(s=>s.account.accessToken==='new'));
});
test('all Players routes signal revoked sessions as 401 but preserve sessions on provider outages',async t=>{
  let message='Player session not found';
  const service=new Proxy({}, {get:()=>async()=>{throw Error(message);}});
  const app=express();app.use(express.json());app.use(createPlayerRouter(service));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port;
  const routes=[['/tournaments/t'],['/tournaments/t/matches/m/characters',{selections:[]}],['/tournaments/t/matches/m/game-win',{participantId:'p'}],['/tournaments/t/matches/m/report-detailed',{games:[{winnerParticipantId:'p'}]}],['/tournaments/t/matches/m/absence',{outcome:'NONE_PRESENT'}],['/tournaments/t/matches/m/reset',{}],['/tournaments/t/ladder/join',{}],['/tournaments/t/ladder/leave',{}],['/tournaments/t/ladder/matches/m/ready',{}],['/tournaments/t/ladder/matches/m/cancel',{}],['/tournaments/t/ladder/matches/m/report-detailed',{games:[{winnerParticipantId:'p'}]}],['/tournaments/t/ladder/matches/m/review',{action:'CONFIRM',expectedRevision:'r'}]];
  for(const [path,body]of routes){const res=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer expired','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(res.status,401,path);}
  for(const status of [429,500,503]) {
    message=`start.gg OAuth refresh failed (${status})`;
    assert.equal((await fetch(base+'/me',{headers:{Authorization:'Bearer valid'}})).status,500);
  }
});

test('withdrawn or wrongly linked Players lose stale push bindings; outages preserve them',async()=>{
  const deleted=[], repo={deleteTournamentBinding:async(account,tournament)=>deleted.push([account,tournament])};
  let fail=true;
  const client={findEntrantForEvent:async()=>{if(fail)throw Error('temporary outage');return {};}};
  const service=new PlayerService(repo,{listParticipants:async()=>[]},{},{},client);
  const session={account:{id:'a'},identity},tournament={id:'t',importSource:{provider:'START_GG',eventId:'e'}};
  await assert.rejects(service.findPlayerParticipantForTournament(session,tournament),/outage/);
  assert.deepEqual(deleted,[]);
  fail=false;
  assert.equal(await service.findPlayerParticipantForTournament(session,tournament),undefined);
  assert.deepEqual(deleted,[['a','t']]);
});
