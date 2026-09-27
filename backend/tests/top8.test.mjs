import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildTop8Data, localTop8, top8Catalog } from '../dist/modules/top8/top8-data.js';
import { createTop8Routers } from '../dist/modules/top8/top8.routes.js';
import { StartggClient } from '../dist/modules/tournaments/startgg.client.js';

const tournament = { id:'top8-test', title:'Torneo Tournament Platform', gameTitle:'Super Smash Bros. Ultimate', startsAt:'2026-09-22T18:00:00Z', status:'COMPLETED', settings:{ format:'DOUBLE_ELIMINATION' } };
const participants=Array.from({length:8},(_,i)=>({id:'p'+(i+1),displayName:'Player '+(i+1),externalRef:{entrantId:String(i+1)}}));
const match=(stage,round,ids,winner,extra={})=>({id:stage+round+ids.join(''),bracketStage:stage,roundNumber:round,matchNumber:1,status:'COMPLETED',winnerParticipantId:'p'+winner,participants:ids.map(n=>({participantId:'p'+n,slot:n,displayName:'Player '+n})),...extra});
const se=[match('WINNERS',1,[1,8],1),match('WINNERS',1,[4,5],4),match('WINNERS',1,[2,7],2),match('WINNERS',1,[3,6],3),match('WINNERS',2,[1,4],1),match('WINNERS',2,[2,3],2),match('WINNERS',3,[1,2],1)];
const de=[...se,match('LOSERS',1,[8,5],5),match('LOSERS',1,[7,6],6),match('LOSERS',2,[5,3],3),match('LOSERS',2,[6,4],4),match('LOSERS',3,[3,4],3),match('LOSERS',4,[3,2],2),match('FINALS',1,[1,2],1),match('FINALS',2,[],undefined,{status:'PENDING',winnerParticipantId:undefined})];
test('Top8 ranks single and double elimination with ties, ignores dormant reset and handles active reset',()=>{
  assert.deepEqual(localTop8({...tournament,settings:{format:'SINGLE_ELIMINATION'}},participants,se).map(r=>r.placement),[1,2,3,3,5,5,5,5]);
  const result=localTop8(tournament,participants,de);
  assert.deepEqual(result.map(r=>r.placement),[1,2,3,4,5,5,7,7]);
  assert.equal(result[0].participant.id,'p1');
  const reset=[...de.slice(0,-2),match('FINALS',1,[1,2],2),match('FINALS',2,[1,2],2)];
  assert.equal(localTop8(tournament,participants,reset)[0].participant.id,'p2');
  assert.equal(localTop8(tournament,participants,reset)[1].participant.id,'p1');
});
test('Top8 prefills official placements and recorded team characters, local events leave visuals empty',()=>{
  const chars=[{participantId:'p1',characterId:1302,characterName:'Mario'},{participantId:'p1',characterId:1302,characterName:'Mario'}];
  const matches=[...de,match('POOLS',1,[1,2],1,{gameCharacterSelections:[{gameNum:1,selections:chars},{gameNum:2,selections:chars}],characterSelections:chars})];
  const standings=[{entrantId:'1',name:'Remote Player',placement:1},{entrantId:'8',name:'Remote Eight',placement:2}];
  const data=buildTop8Data({...tournament,importSource:{provider:'START_GG'}},participants,matches,standings);
  assert.deepEqual(data.players.map(p=>p.id),['p1','p8']);
  assert.deepEqual(data.players[0].characters.map(c=>c.name),['Mario','Mario']);
  assert.equal(data.source,'start.gg');
  assert.equal(buildTop8Data(tournament,participants,matches).players[0].characters.length,0);
  const noPositions=buildTop8Data({...tournament,settings:{format:'ROUND_ROBIN'}},participants,[]);
  assert(noPositions.players.every(p=>p.placement===null));assert(noPositions.warnings.length);
  const limited=buildTop8Data({...tournament,settings:{format:'DOUBLE_ELIMINATION'},importSource:{provider:'START_GG'}},participants,de.map((m,i)=>({...m,externalRef:{phaseGroupId:String(i%2)}})));
  assert(limited.players.every(p=>p.placement===null));
});
test('Top8 keeps report character identities but never supplies stock icons as poster artwork',()=>{
  for(const list of Object.values(top8Catalog()))for(const c of list){assert.equal(c.image,'');assert(Number.isInteger(c.id));}
});
test('Top8 sessions expire, are one-use, omit private data and only open finished tournaments',async t=>{
  let overview={tournament:{...tournament,registrationEmail:'private@example.test'},participants,matches:de};
  const service={async getTournamentOverview(){return overview;}};
  const router=createTop8Routers(service,{isConfigured:()=>false},'https://your-domain.example');
  const app=express();app.use(express.json());app.use('/api/tournaments/:tournamentId/top8-session',(req,res,next)=>req.header('X-App-Key')==='test'?next():res.sendStatus(403),router.protectedRouter);app.use('/api/top8',router.publicRouter);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,auth=false)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{'X-App-Key':'test'}:{})},body:JSON.stringify(body)});
  const endpoint='/api/tournaments/top8-test/top8-session';
  assert.equal((await post(endpoint,{})).status,403);
  const response=await post(endpoint,{},true);assert.equal(response.status,200);const url=new URL((await response.json()).url);assert.equal(url.origin,'https://your-domain.example');assert.equal(url.searchParams.has('session'),false);
  const token=new URLSearchParams(url.hash.slice(1)).get('session');const redeemed=await post('/api/top8/session',{token});assert.equal(redeemed.status,200);assert.equal(redeemed.headers.get('cache-control'),'no-store');assert(!(await redeemed.text()).includes('private@example.test'));
  assert.equal((await post('/api/top8/session',{token})).status,410);
  const another=new URL((await(await post(endpoint,{},true)).json()).url);const expired=new URLSearchParams(another.hash.slice(1)).get('session');const clock=Date.now;Date.now=()=>clock()+360000;
  try{assert.equal((await post('/api/top8/session',{token:expired})).status,410);}finally{Date.now=clock;}
  overview={...overview,tournament:{...tournament,status:'IN_PROGRESS'}};
  assert.equal((await post(endpoint,{},true)).status,409);
});
test('Top8 official standings use a bounded page and the shared start.gg read client',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let calls=0;
  globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);assert.equal(body.operationName,'Top8Standings');assert.match(body.query,/perPage: 8/);assert.equal(body.variables.eventId,'123');calls++;return new Response(JSON.stringify({data:{event:{state:'COMPLETED',standings:{nodes:[{placement:1,entrant:{id:10,name:'Winner'}}]}}}}),{status:200});};
  const data=await new StartggClient('test-token').getTop8Standings('123');assert.equal(calls,1);assert.deepEqual(data,[{entrantId:'10',name:'Winner',placement:1}]);
});
