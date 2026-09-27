import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {TournamentsPostgresRepository} from '../dist/modules/tournaments/tournaments.postgres-repository.js';
import {TournamentsService} from '../dist/modules/tournaments/tournaments.service.js';
import {LadderPostgresRepository} from '../dist/modules/ladder/ladder.postgres-repository.js';
import {LadderService} from '../dist/modules/ladder/ladder.service.js';
import {defaultLadderSettings,selectLadderPair,ladderStandings} from '../dist/modules/ladder/ladder.rules.js';
async function fixture(t, mirrored = true) {
  const db = await PGlite.create();
  t.after(() => db.close());
  await db.exec(await readFile(new URL('../../infra/postgres/init/001_schema.sql', import.meta.url), 'utf8'));
  const trace = []; let tail = Promise.resolve(); let failPattern;
  const raw = async (sql, args = []) => {
    trace.push({ sql, args });
    if (failPattern && sql.includes(failPattern)) throw new Error('simulated write failure');
    if (!args.length) return (await db.exec(sql)).at(-1) ?? { rows: [] };
    return db.query(sql, args);
  };
  const pool = {
    async connect() {
      const previous = tail; let release;
      tail = new Promise(resolve => { release = resolve; });
      await previous;
      return { query: raw, release };
    },
    async query(sql, args) { const client = await this.connect(); try { return await client.query(sql, args); } finally { client.release(); } },
  };
  const repo = new TournamentsPostgresRepository(pool);
  // A worker uses a separate session lock in production; PGlite has one session.
  repo.withSyncWorker = async (_id, action) => action();
  await repo.ensureSchema();
  await repo.ensureSchema(); // Migration is repeatable.
  const now = new Date().toISOString();
  const tournament = { id: 't1', ownerId: 'test', title: 'Test', gameTitle: 'Tekken 8', description: 'Test', platform: 'PC',
    status: 'IN_PROGRESS', startsAt: now, maxParticipants: 8, isPublic: false,
    settings: { format: 'SINGLE_ELIMINATION', bestOf: 3, setupCount: 3 }, createdAt: now, updatedAt: now,
    importSource: mirrored ? { provider: 'START_GG', syncResults: true, eventUrl: 'https://www.start.gg/tournament/test/event/singles', eventId: '1', eventSlug: 'test', phaseId: 'phase', entrantSize: 1, hasPools: false, importedAt: now } : undefined };
  const participants = Array.from({ length: 6 }, (_, i) => ({ id: `p${i+1}`, tournamentId: 't1', displayName: `P${i+1}`, checkedIn: false, status: 'ACTIVE', createdAt: now,
    externalRef: mirrored ? { provider: 'START_GG', entrantId: String(100+i+1) } : undefined }));
  const matches = Array.from({ length: 3 }, (_, i) => ({ id: `m${i+1}`, tournamentId: 't1', bracketStage: 'WINNERS', roundNumber: 1, matchNumber: i+1,
    status: 'PENDING', bestOf: 3, advancersRequired: 1, participants: participants.slice(i*2,i*2+2).map((p,j) => ({ id: `slot-${i}-${j}`, participantId: p.id, displayName: p.displayName, slot: j+1, score: 0 })),
    createdAt: now, updatedAt: now, externalRef: mirrored ? { provider: 'START_GG', setId: String(501+i), phaseId: 'phase', phaseGroupId: 'group', identifier: `A${i+1}`, localSyncVersion: 0 } : undefined }));
  await repo.replaceOverview(tournament, participants, matches);
  trace.length = 0;
  const ladderRepo = new LadderPostgresRepository(pool); await ladderRepo.ensureSchema(); await ladderRepo.ensureSchema();
  const notifier = {notifyLadderMatchFound:async()=>{},notifyLadderCompleted:async()=>{}};
  const service = new LadderService(ladderRepo,repo,notifier);
  const bracket = new TournamentsService(repo); bracket.setLadderCoordinator((id,m,s)=>service.reserveForBracket(id,m,s));
  await service.startLadder('t1','test');
  return {db,repo,ladderRepo,service,bracket,participants,trace, restart:()=>new LadderService(ladderRepo,repo,notifier)};
}

const view = f => f.service.getOverview('t1');
async function pair(f) { for (const p of f.participants.slice(0,2)) await f.service.joinQueue('t1',p); return (await view(f)).activeMatches[0]; }
async function play(f,m) { for(const p of m.participants) await f.service.readyUp('t1',m.id,p.participantId); }
const games = [{winnerParticipantId:'p1'},{winnerParticipantId:'p1'}];
test('membership: outsiders cannot cancel, ready or report another ladder set', async t=>{
 const f=await fixture(t);const m=await pair(f);
 await assert.rejects(f.service.cancelReadyCheck('t1',m.id,'p3'),/does not belong/);
 await assert.rejects(f.service.readyUp('t1',m.id,'p3'),/does not belong/);
 await play(f,m);await assert.rejects(f.service.reportDetailedResult('t1',m.id,games,{reporterParticipantId:'p3',bestOfOverride:3}),/does not belong/);
 assert.equal((await view(f)).activeMatches[0].status,'PLAYING');
});
test('concurrent joins produce exactly one assignment per participant and setup',async t=>{
 const f=await fixture(t); await Promise.all(f.participants.map(p=>f.service.joinQueue('t1',p)));
 const v=await view(f);assert.equal(v.activeMatches.length,1);assert.equal(v.queue.length,4);
 assert.equal(v.activeMatches[0].stationLabel,'Setup 3');
 assert.ok(f.trace.some(q=>q.sql.includes('pg_advisory_xact_lock')));
});
test('restart worker expires absentees, retains present player priority and rematches without a GET',async t=>{
 const f=await fixture(t);const m=await pair(f);await f.service.readyUp('t1',m.id,'p1');
 const original=m.details.queueEnteredAt.p1;
 await f.service.joinQueue('t1',f.participants[2]);
 await f.db.query("update ladder_matches set ready_deadline_at=now()-interval '1 minute' where id=$1",[m.id]);
 await f.restart().tick(); const v=await view(f);
 assert.equal(v.completedMatches[0].status,'EXPIRED');assert.deepEqual(v.completedMatches[0].details.absenceParticipantIds,['p2']);
 assert.equal(v.activeMatches.length,1);assert.equal(v.activeMatches[0].details.queueEnteredAt.p1,original);
 assert.deepEqual(new Set(v.activeMatches[0].participants.map(p=>p.participantId)),new Set(['p1','p3']));
});
test('result frees a setup and immediately matches the waiting queue; Bo override persists',async t=>{
 const f=await fixture(t);const m=await pair(f);await play(f,m);for(const p of f.participants.slice(2,4)) await f.service.joinQueue('t1',p);
 await f.service.reportDetailedResult('t1',m.id,games,{reporterParticipantId:'p1',bestOfOverride:3});const v=await view(f);
 assert.equal(v.completedMatches[0].bestOf,3);assert.equal(v.activeMatches.length,1);
 assert.deepEqual(new Set(v.activeMatches[0].participants.map(p=>p.participantId)),new Set(['p3','p4']));
});
test('main bracket suspends ladder atomically; worker resumes the same set after bracket finishes',async t=>{
 const f=await fixture(t);const m=await pair(f);await play(f,m);
 await f.bracket.callMatch('t1','m1',{calledByUserId:'test',stationLabel:'Setup 1'});
 let v=await view(f);assert.equal(v.activeMatches[0].status,'SUSPENDED');assert.equal(v.activeMatches[0].details.stationNumber,undefined);
 const matches=await f.repo.listMatches('t1');await f.repo.replaceMatches('t1',matches.map(x=>x.id==='m1'?{...x,status:'COMPLETED'}:x));
 await f.restart().tick();v=await view(f);assert.equal(v.activeMatches[0].id,m.id);assert.equal(v.activeMatches[0].status,'READY_CHECK');
});
test('pause allows queuing; resume pairs; close rejects joins and lets active sets finish',async t=>{
 const f=await fixture(t);await f.service.control('t1',{action:'PAUSE',actor:'test'});for(const p of f.participants.slice(0,2))await f.service.joinQueue('t1',p);
 await f.restart().tick();assert.equal((await view(f)).activeMatches.length,0);
 await f.service.control('t1',{action:'RESUME',actor:'test'});const m=(await view(f)).activeMatches[0];await play(f,m);
 await f.service.finalizeLadder('t1','test');assert.equal((await view(f)).activeMatches[0].status,'PLAYING');
 await assert.rejects(f.service.joinQueue('t1',f.participants[2]),/cerradas/);
 await f.service.reportDetailedResult('t1',m.id,games,{bestOfOverride:3,reporterParticipantId:'p1'});
 const v=await view(f);assert.equal(v.session.status,'COMPLETED');assert.equal(v.standings[0].participantId,'p1');
});
test('opponent confirmation, stale revision rejection, dispute and audited correction',async t=>{
 const f=await fixture(t);await f.service.control('t1',{action:'SETTINGS',actor:'test',settings:{...defaultLadderSettings,requireConfirmation:true,mode:'COMPETITIVE',minimumSets:1}});
 const m=await pair(f);await play(f,m);await f.service.reportDetailedResult('t1',m.id,games,{bestOfOverride:3,reporterParticipantId:'p1'});
 let v=await view(f);let pending=v.activeMatches[0];assert.equal(v.standings.length,0);assert.equal(pending.status,'AWAITING_CONFIRMATION');
 await assert.rejects(f.service.reviewResult('t1',m.id,'p1',{action:'CONFIRM',expectedRevision:pending.details.revision}),/rival/);
 await assert.rejects(f.service.reviewResult('t1',m.id,'p2',{action:'CONFIRM',expectedRevision:'old'}),/ha cambiado/);
 await f.service.reviewResult('t1',m.id,'p2',{action:'DISPUTE',expectedRevision:pending.details.revision,reason:'Marcador incorrecto'});
 pending=(await view(f)).activeMatches[0];assert.equal(pending.status,'DISPUTED');
 await f.service.control('t1',{action:'RESOLVE_RESULT',actor:'admin',matchId:m.id,expectedRevision:pending.details.revision,reason:'Verificado con ambos',winnerParticipantId:'p2',scores:[{participantId:'p1',score:1},{participantId:'p2',score:2}]});
 v=await view(f);assert.equal(v.standings[0].participantId,'p2');assert.equal(v.standings[0].rating,1016);assert.equal(v.standings[0].eligible,true);
 assert.ok(v.activity.some(e=>e.action==='RESOLVE_RESULT'&&e.before.winnerParticipantId==='p1'&&e.after.winnerParticipantId==='p2'));
});
test('scheduled close survives restart and read-only overview does not run matchmaking',async t=>{
 const f=await fixture(t);await f.service.control('t1',{action:'PAUSE',actor:'test'});await pair(f);
 let v=await view(f);assert.equal(v.activeMatches.length,0);
 await f.service.control('t1',{action:'SETTINGS',actor:'test',settings:{...defaultLadderSettings,closesAt:new Date(Date.now()+60000).toISOString()}});
 await f.db.query("update ladder_sessions set options=jsonb_set(options,'{settings,closesAt}',to_jsonb('2000-01-01T00:00:00.000Z'::text))");
 await f.restart().tick();v=await view(f);assert.equal(v.session.status,'COMPLETED');assert.equal(v.queue.length,0);
});
test('matchmaking never skips the oldest entrant and bounds the rematch wait',()=>{
 const now=Date.now();const q=['a','b'].map((id,i)=>({participantId:id,queuedAt:new Date(now-10000+i).toISOString()}));
 const history=[{id:'h',status:'COMPLETED',participants:[{participantId:'a',score:2},{participantId:'b',score:0}],winnerParticipantId:'a',completedAt:new Date(now-20000).toISOString()},{id:'busy',status:'PLAYING',participants:[{participantId:'c'},{participantId:'d'}]}];
 assert.equal(selectLadderPair(q,history,defaultLadderSettings,now),undefined);
 assert.equal(selectLadderPair(q,history,defaultLadderSettings,now+180000)[0].participantId,'a');
 assert.equal(selectLadderPair([...q,{participantId:'c',queuedAt:new Date(now).toISOString()}],history,defaultLadderSettings,now)[0].participantId,'a');
 assert.equal(ladderStandings(history,{...defaultLadderSettings,mode:'COMPETITIVE'})[0].eligible,false);
});

test('confirmed result counts once; repeated review is rejected without changing standings',async t=>{
 const f=await fixture(t);await f.service.control('t1',{action:'SETTINGS',actor:'test',settings:{...defaultLadderSettings,requireConfirmation:true}});
 const m=await pair(f);await play(f,m);await f.service.reportDetailedResult('t1',m.id,games,{bestOfOverride:3,reporterParticipantId:'p1'});
 const pending=(await view(f)).activeMatches[0];const input={action:'CONFIRM',expectedRevision:pending.details.revision};
 await f.service.reviewResult('t1',m.id,'p2',input);await assert.rejects(f.service.reviewResult('t1',m.id,'p2',input),/editable/);
 assert.equal((await view(f)).standings[0].matchesPlayed,1);
});
test('organizer removal blocks rejoining, preserves opponent priority and can be undone',async t=>{
 const f=await fixture(t);const m=await pair(f);
 await f.service.control('t1',{action:'REMOVE_PLAYER',actor:'test',participantId:'p1'});
 let v=await view(f);assert.equal(v.queue[0].participantId,'p2');assert.equal(v.queue[0].queuedAt,m.details.queueEnteredAt.p2);
 await assert.rejects(f.service.joinQueue('t1',f.participants[0]),/retirado/);
 await f.service.control('t1',{action:'ADD_PLAYER',actor:'test',participantId:'p1'});v=await view(f);assert.equal(v.activeMatches.length,1);
 assert.ok(v.activity.some(e=>e.action==='REMOVE_PLAYER'&&e.after.participantId==='p1'));
});
test('setups occupied by other bracket players also suspend ladder; stale organizer writes fail',async t=>{
 const f=await fixture(t);const m=await pair(f);await play(f,m);
 await f.bracket.callMatch('t1','m2',{calledByUserId:'test',stationLabel:'Setup 3'});
 assert.equal((await view(f)).activeMatches[0].status,'SUSPENDED');
 const original=(await view(f)).session.options.revision;await f.service.control('t1',{action:'PAUSE',actor:'test',expectedRevision:original});
 await assert.rejects(f.service.control('t1',{action:'RESUME',actor:'test',expectedRevision:original}),/ha cambiado/);
});

test('management controls require a validated user session and reject legacy admin keys',async t=>{
 const {default:express}=await import('express');const {createTournamentRouter}=await import('../dist/modules/tournaments/tournaments.routes.js');const {createManageRouter}=await import('../dist/modules/manage/manage.routes.js');
 let changes=0;const tournaments={isImporting:async()=>false};const ladder={control:async()=>{changes++;return {queue:[]};}};
 const old=process.env.ADMIN_DELETE_KEY;process.env.ADMIN_DELETE_KEY='fixture-secret';t.after(()=>{if(old===undefined)delete process.env.ADMIN_DELETE_KEY;else process.env.ADMIN_DELETE_KEY=old;});
 const app=express();app.use(express.json());app.use('/direct',createTournamentRouter(tournaments,ladder));app.use('/manage',createManageRouter(tournaments,ladder,{accounts:{userFor:async token=>token==='fixture-session'?{id:'fixture',role:'MANAGER'}:null}}));
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action:'PAUSE'})});
 assert.equal((await post('/direct/t1/ladder/control')).status,401);assert.equal((await post('/direct/t1/ladder/control',{'X-Admin-Key':'wrong'})).status,401);
 assert.equal((await post('/direct/t1/ladder/control',{'X-Admin-Key':'fixture-secret'})).status,401);
 assert.equal((await post('/manage/tournaments/t1/ladder/control',{Authorization:'Bearer fixture-session'})).status,200);
 assert.equal((await post('/manage/tournaments/t1/ladder/control',{Authorization:'Bearer invalid'})).status,401);assert.equal(changes,1);
});

test('removing a tournament entrant releases the ladder and preserves the other entrant',async t=>{
 const f=await fixture(t);const m=await pair(f);await play(f,m);
 await f.db.query("delete from tournament_participants where id='p1'");
 await f.restart().tick();const v=await view(f);assert.equal(v.activeMatches.length,0);assert.equal(v.completedMatches[0].status,'CANCELLED');assert.equal(v.queue[0].participantId,'p2');
});
test('cancelling the tournament cancels open ladder sets and prevents starting a new ladder',async t=>{
 const f=await fixture(t);await pair(f);const tournament=await f.repo.getTournament('t1');await f.repo.saveTournament({...tournament,status:'CANCELLED'});
 await f.restart().tick();const v=await view(f);assert.equal(v.session.status,'COMPLETED');assert.equal(v.activeMatches.length,0);assert.equal(v.queue.length,0);
 await assert.rejects(f.service.startLadder('t1','admin'),/cancelado/);
});

test('reopening a ladder result requires fresh ready confirmation from both players',async t=>{
 const f=await fixture(t),m=await pair(f);await play(f,m);
 await f.service.reportDetailedResult('t1',m.id,games,{bestOfOverride:3,reporterParticipantId:'p1'});
 const completed=(await view(f)).completedMatches.find(row=>row.id===m.id);
 await f.service.control('t1',{action:'REOPEN_MATCH',actor:'admin',matchId:m.id,expectedRevision:completed.details.revision,reason:'Corregir el set'});
 let reopened=(await view(f)).activeMatches.find(row=>row.id===m.id);
 assert.equal(reopened.status,'READY_CHECK');assert.equal(reopened.participantOneReadyAt,undefined);assert.equal(reopened.participantTwoReadyAt,undefined);assert.equal(reopened.startedAt,undefined);
 await f.service.readyUp('t1',m.id,'p1');reopened=(await view(f)).activeMatches.find(row=>row.id===m.id);
 assert.equal(reopened.status,'READY_CHECK');assert.equal(reopened.participantTwoReadyAt,undefined);
 await f.service.readyUp('t1',m.id,'p2');assert.equal((await view(f)).activeMatches.find(row=>row.id===m.id).status,'PLAYING');
});

test('resuming persisted suspended sets clears stale readiness and expiry detects absences',async t=>{
 const f=await fixture(t),m=await pair(f);await play(f,m);
 // A set reopened by an older backend can already contain stale confirmations.
 await f.db.query("update ladder_matches set status='SUSPENDED' where id=$1",[m.id]);
 await f.restart().tick();const resumed=(await view(f)).activeMatches.find(row=>row.id===m.id);
 assert.equal(resumed.status,'READY_CHECK');assert.equal(resumed.participantOneReadyAt,undefined);assert.equal(resumed.participantTwoReadyAt,undefined);
 await f.db.query("update ladder_matches set ready_deadline_at=now()-interval '1 minute' where id=$1",[m.id]);
 await f.restart().tick();const final=await view(f),expired=final.completedMatches.find(row=>row.id===m.id);
 assert.equal(expired.status,'EXPIRED');assert.deepEqual(new Set(expired.details.absenceParticipantIds),new Set(['p1','p2']));assert.equal(final.queue.length,0);
});

test('archive waits for ladder closure, preserves standings and rejects stale player and manager writes',async t=>{
 const f=await fixture(t),m=await pair(f);await play(f,m);
 await f.service.reportDetailedResult('t1',m.id,games,{reporterParticipantId:'p1',bestOfOverride:3});
 await f.repo.saveTournament({...await f.repo.getTournament('t1'),status:'COMPLETED'});
 await assert.rejects(f.bracket.setArchived('t1',true),/ladder/);
 await f.service.finalizeLadder('t1','test');const original=await view(f);
 await f.bracket.setArchived('t1',true);assert.deepEqual((await view(f)).standings,original.standings);
 for(const call of [()=>f.service.startLadder('t1','test'),()=>f.service.joinQueue('t1',f.participants[0]),
  ()=>f.service.control('t1',{action:'REOPEN_MATCH',actor:'test',matchId:m.id,reason:'Stale panel'}),
  ()=>f.service.readyUp('t1',m.id,'p1'),()=>f.service.reportDetailedResult('t1',m.id,games,{reporterParticipantId:'p1'})]){
   await assert.rejects(call(),/archivad/i);
 }
 await f.restart().tick();assert.deepEqual((await view(f)).standings,original.standings);
 await f.bracket.setArchived('t1',false);await f.service.startLadder('t1','test');assert.equal((await view(f)).session.status,'ACTIVE');
});
