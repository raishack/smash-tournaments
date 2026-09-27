import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { fortniteFixture,validRows,report } from './fixtures/fortnite-fixture.mjs';
import { createFortniteRound,fortniteStandings,fortniteConfig } from '../dist/modules/fortnite/fortnite-model.js';
import { createFortniteRouters } from '../dist/modules/fortnite/fortnite.routes.js';
import { createTournamentSchema } from '../dist/modules/tournaments/tournament.schemas.js';
import { RegistrationService } from '../dist/modules/registration/registration.service.js';

test('Fortnite: balanced groups, random seats in range and qualification always converge to one full final',()=>{
  for(let size=5;size<=100;size+=5)for(const count of new Set([2,size-1,size,size+1,2*size+1,Math.min(2048,size*size+1),2048])) {
    let ids=Array.from({length:count},(_,i)=>String(i)),number=1;
    while(true){
      const round=createFortniteRound(ids,number,{lobbySize:size,gamesPerRound:3});
      const sizes=round.groups.map(g=>g.slots.length);assert(Math.max(...sizes)-Math.min(...sizes)<=1);assert(Math.max(...sizes)<=size);
      assert.equal(new Set(round.groups.flatMap(g=>g.slots.map(s=>s.participantId))).size,ids.length);
      for(const group of round.groups){assert.equal(new Set(group.slots.map(s=>s.seat)).size,group.slots.length);assert(group.slots.every(s=>s.seat>=1&&s.seat<=size));assert(group.qualifyCount<=group.slots.length);}
      if(round.final){assert.equal(round.groups.length,1);assert.equal(ids.length,Math.min(count,size));break;}
      assert(round.groups.every(g=>g.qualifyCount>0));
      const next=round.groups.flatMap(g=>g.slots.slice(0,g.qualifyCount).map(s=>s.participantId));assert(next.length<ids.length);ids=next;number++;assert(number<12);
    }
  }
});

test('Fortnite: scoring, provisional drafts and deterministic published tie-breaks',()=>{
  const group=createFortniteRound(['a','b','c','d'],1,{lobbySize:5,gamesPerRound:2}).groups[0];
  const rows=validRows(group);rows[0].kills=2;rows[0].vipKill=true;
  group.games[0]={...group.games[0],status:'PLAYING',vipName:'VIP externo',rows};
  assert(fortniteStandings(group).every(r=>r.points===0));
  group.games[0].status='COMPLETED';
  assert.equal(fortniteStandings(group)[0].points,17);
  const tie=createFortniteRound(['a','b','c'],1,{lobbySize:5,gamesPerRound:1}).groups[0];
  assert.deepEqual(fortniteStandings(tie).map(r=>r.seat),tie.slots.map(s=>s.seat).sort((a,b)=>a-b));
  assert.throws(()=>fortniteConfig({fortniteLobbySize:101}),/Fortnite/);
  assert.throws(()=>fortniteConfig({fortniteLobbySize:21}),/Fortnite/);
  assert.throws(()=>fortniteConfig({teamSize:5}),/individual/);
});

test('Fortnite: full multi-game tournament, safe corrections, finalists reset points and completion is final',async t=>{
  const f=await fortniteFixture(t);assert(createTournamentSchema.safeParse(f.tournament).success);
  let view=await f.action({action:'GENERATE'});assert.equal(view.state.rounds[0].groups.length,3);
  assert.equal((await f.repo.getTournament(f.tournament.id)).settings.registrationEnabled,false);
  await assert.rejects(f.action({action:'GENERATE'}),/ya están generados/);
  await assert.rejects(f.action({action:'ADVANCE',acceptTies:true,revision:view.state.revision}),/todas las partidas/);
  const round=view.state.rounds[0];
  for(const originalGroup of round.groups)for(let gameNumber=1;gameNumber<=2;gameNumber++){
    const group=(await f.view()).state.rounds.at(-1).groups.find(g=>g.id===originalGroup.id);
    view=await f.action(report(group,gameNumber));
  }
  const old=report(view.state.rounds[0].groups[0]);
  view=await f.action(old);await assert.rejects(f.action(old),/Otro dispositivo/);
  view=await f.action({action:'ADVANCE',acceptTies:true,revision:view.state.revision});
  assert(view.state.rounds[1].final);assert.equal(view.state.rounds[1].groups[0].slots.length,20);
  assert(view.summary.rounds[1].groups[0].standings.every(r=>r.points===0));
  await assert.rejects(f.action(report(round.groups[0])),/ronda actual/);
  view=await f.action(report(view.state.rounds[1].groups[0],1));view=await f.action(report(view.state.rounds[1].groups[0],2));
  view=await f.action({action:'ADVANCE',acceptTies:true,revision:view.state.revision});assert.equal(view.tournament.status,'COMPLETED');
  assert.equal((await f.repo.listParticipants(f.tournament.id)).filter(p=>p.status==='ACTIVE').length,1);
  await assert.rejects(f.action(report(view.state.rounds[1].groups[0],2)),/estado actual/);
  const detail=await f.tournaments.getTournamentOverview(f.tournament.id);assert.equal(detail.fortnite.rounds[1].groups[0].standings[0].rank,1);
  assert(!('rows' in detail.fortnite.rounds[0].groups[0].games[0]),'Display payload omits full score sheets');
});

test('Fortnite: invalid podium, kills, VIP, player substitution and out-of-order games reject atomically',async t=>{
  const f=await fortniteFixture(t,{count:5,size:5,games:2});const view=await f.action({action:'GENERATE'}),group=view.state.rounds[0].groups[0],good=report(group);
  const bad=async mutate=>{const input=structuredClone(good);mutate(input);await assert.rejects(f.action(input));assert.equal((await f.view()).state.revision,view.state.revision);};
  await bad(i=>{i.rows[1].placement=1;});await bad(i=>{i.rows[0].placement=0;});await bad(i=>{i.rows[0].kills=5;});
  await bad(i=>{i.rows[0].vipKill=true;i.rows[0].kills=0;});
  await bad(i=>{i.rows[0].vipKill=true;i.rows[0].kills=1;i.rows[1].vipKill=true;i.rows[1].kills=1;});
  await bad(i=>{i.vipName='';});
  await bad(i=>{i.rows[4].participantId='outsider';});await bad(i=>{i.rows.pop();});
  await assert.rejects(f.action(report(group,2)),/anteriores/);
  const started=await f.action({action:'START',groupId:group.id,gameNumber:1,revision:group.games[0].revision,vipName:'VIP externo'});
  const input=report(started.state.rounds[0].groups[0]);input.vipName='VIP externo';input.rows[0].kills=1;input.rows[0].vipKill=true;
  const done=await f.action(input);assert.equal(done.summary.rounds[0].groups[0].standings[0].points,16);
});

test('Fortnite: simultaneous different groups succeed; same game conflicts; reset invalidates old reports and retains signups',async t=>{
  const f=await fortniteFixture(t,{count:11,size:5,games:1});let view=await f.action({action:'GENERATE'});
  const [a,b]=view.state.rounds[0].groups;
  const results=await Promise.allSettled([f.action(report(a)),f.action(report(b))]);assert(results.every(r=>r.status==='fulfilled'));
  const c=(await f.view()).state.rounds[0].groups[2],same=report(c);
  const collision=await Promise.allSettled([f.action(same),f.action(same)]);assert.equal(collision.filter(r=>r.status==='fulfilled').length,1);
  await f.tournaments.resetTournament(f.tournament.id);assert.equal((await f.view()).state,null);assert.equal((await f.repo.listParticipants(f.tournament.id)).length,11);
  await f.action({action:'GENERATE'});await assert.rejects(f.action(same),/ronda actual/);
  await f.repo.deleteTournament(f.tournament.id);assert.equal((await f.db.query('select count(*)::int as count from tournament_fortnite')).rows[0].count,0);
});

test('Fortnite: signup cap, closing, legacy settings preservation and exclusion of ordinary bracket actions',async t=>{
  const f=await fortniteFixture(t,{count:10,size:10,games:4});
  await assert.rejects(f.tournaments.addParticipant(f.tournament.id,{displayName:'Full'}),/full/);
  const settings={...f.tournament.settings};delete settings.fortniteLobbySize;delete settings.fortniteGamesPerRound;
  await f.tournaments.updateTournament(f.tournament.id,{...f.tournament,settings});
  assert.equal((await f.view()).config.gamesPerRound,4);assert.equal((await f.view()).config.lobbySize,10);
  await f.action({action:'GENERATE'});
  const registration=new RegistrationService(f.repo,f.tournaments,{configured:true,async send(){}},'https://your-domain.example');
  assert.equal((await registration.publicInfo(f.tournament.id)).open,false);
  await assert.rejects(registration.updateOptions(f.tournament.id,{registrationEnabled:true}),/antes de generar/);
  await assert.rejects(f.tournaments.deleteParticipant(f.tournament.id,f.participants[0].id),/sorteados/);
  await assert.rejects(f.tournaments.updateParticipant(f.tournament.id,f.participants[0].id,{displayName:'Change'}),/sorteados/);
  await assert.rejects(f.tournaments.updateTournament(f.tournament.id,{...f.tournament,settings:{...f.tournament.settings,fortniteLobbySize:20}}),/sorteados/);
  await assert.rejects(f.tournaments.generateBracket(f.tournament.id),/panel Fortnite/);
  await assert.rejects(f.tournaments.startTournament(f.tournament.id),/panel Fortnite/);
});

test('Fortnite: management tickets are one-use and bearer sessions remain scoped to one tournament',async t=>{
  const f=await fortniteFixture(t,{count:5,size:5,games:1}),routers=createFortniteRouters(f.service,'https://your-domain.example');
  const app=express();app.use(express.json());app.use('/api/fortnite',routers.publicRouter);
  app.use('/api/tournaments/:tournamentId/fortnite',(req,res,next)=>req.header('x-app-key')==='test-key'?next():res.sendStatus(403),routers.protectedRouter);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`,post=(url,body,headers={})=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const path=`/api/tournaments/${f.tournament.id}/fortnite/session`;
  assert.equal((await post(path,{})).status,403);
  const ticket=await(await post(path,{}, {'x-app-key':'test-key'})).json();const token=new URLSearchParams(new URL(ticket.url).hash.slice(1)).get('session');
  assert.equal(new URL(ticket.url).searchParams.has('session'),false);
  const session=await(await post('/api/fortnite/session',{token})).json();
  assert.equal((await post('/api/fortnite/session',{token})).status,410);
  assert.equal((await fetch(base+'/api/fortnite/view')).status,401);
  const headers={Authorization:'Bearer '+session.token};
  assert.equal((await post('/api/fortnite/action',{action:'GENERATE',tournamentId:'another'},headers)).status,400);
  assert.equal((await post('/api/fortnite/action',{action:'GENERATE'},headers)).status,200);
  const result=await(await fetch(base+'/api/fortnite/view?tournamentId=another',{headers})).json();assert.equal(result.tournament.id,f.tournament.id);
});
