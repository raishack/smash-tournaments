import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import { TournamentsPostgresRepository } from '../dist/modules/tournaments/tournaments.postgres-repository.js';
import { TournamentsService } from '../dist/modules/tournaments/tournaments.service.js';
import { NoopStartggClient } from '../dist/modules/tournaments/startgg.client.js';
import { createTournamentRouter } from '../dist/modules/tournaments/tournaments.routes.js';
import { matchRevision, operationRequest, safeDiagnostic } from '../dist/modules/tournaments/tournament-operations.js';

// PGlite runs the PostgreSQL engine in process. Its one connection is leased
// for whole transactions, like a pg Pool with max=1. Multi-session advisory
// locking is also asserted in the SQL trace; it needs server-level testing.
async function fixture(t, mirrored = false) {
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
    status: 'PLAYING', bestOf: 3, advancersRequired: 1, participants: participants.slice(i*2,i*2+2).map((p,j) => ({ id: `slot-${i}-${j}`, participantId: p.id, displayName: p.displayName, slot: j+1, score: 0 })),
    createdAt: now, updatedAt: now, externalRef: mirrored ? { provider: 'START_GG', setId: String(501+i), phaseId: 'phase', phaseGroupId: 'group', identifier: `A${i+1}`, localSyncVersion: 0 } : undefined }));
  await repo.replaceOverview(tournament, participants, matches);
  trace.length = 0;
  return { db, repo, trace, service: new TournamentsService(repo), fail(pattern) { failPattern = pattern; } };
}

test('PostgreSQL: legacy bye repair and tournament closure are atomic and audited once', async t => {
  const { repo, service, fail } = await fixture(t);
  const matches = await repo.listMatches('t1');
  const bye = { ...matches[0], status: 'PENDING', participants: [matches[0].participants[0]] };
  const final = { ...matches[1], roundNumber: 2, status: 'COMPLETED', winnerParticipantId: matches[1].participants[0].participantId };
  await repo.replaceMatches('t1', [bye, final]);
  const before = await repo.listMatches('t1');
  fail('insert into tournaments');
  await assert.rejects(service.getTournamentOverview('t1'), /simulated write failure/);
  fail(undefined);
  assert.deepEqual(await repo.listMatches('t1'), before, 'Match repair must roll back with status write');
  assert.equal((await repo.getTournament('t1')).status, 'IN_PROGRESS');
  const after = await service.getTournamentOverview('t1');
  assert.equal(after.tournament.status, 'COMPLETED');
  assert.equal(after.matches.find(m => m.id === bye.id).winnerParticipantId, bye.participants[0].participantId);
  assert.deepEqual((await repo.listMatches('t1')).find(m => m.id === final.id), before.find(m => m.id === final.id));
  await service.getTournamentOverview('t1');
  const activities = await repo.listActivity('t1');
  assert.equal(activities.length, 1);
  assert.equal(activities[0].action, 'repairLocalAutomaticAdvances');
});

test('PostgreSQL: repeated operations are applied once and stale devices receive a conflict', async t => {
  const { repo, service, trace } = await fixture(t);
  const visible = (await service.getTournamentOverview('t1')).matches[0];
  const request = { id: 'operation-one', expectedRevision: visible.operationRevision, platform: 'Android', appVersion: 'test' };
  const run = () => operationRequest.run(request, () => service.recordGameWin('t1', 'm1', { participantId: 'p1' }));
  const first = await run(); const repeated = await run();
  assert.deepEqual(repeated, JSON.parse(JSON.stringify(first)));
  assert.equal((await repo.listMatches('t1'))[0].participants[0].score, 1);
  await assert.rejects(operationRequest.run({ ...request, id: 'operation-two' }, () => service.recordGameWin('t1', 'm1', { participantId: 'p2' })), /[Aa]nother device/);
  await assert.rejects(operationRequest.run(request, () => service.recordGameWin('t1', 'm1', { participantId: 'p2' })), /different data/);
  assert.equal((await repo.listActivity('t1')).length, 1);
  assert.ok(trace.some(q => q.sql.includes('pg_advisory_xact_lock')));
});

test('PostgreSQL: simultaneous devices keep both independent results and only one conflicting result', async t => {
  const { repo, service } = await fixture(t);
  const other = new TournamentsService(repo);
  const initial = (await service.getTournamentOverview('t1')).matches;
  const run = (svc, match, winner, id) => operationRequest.run({ id, expectedRevision: initial.find(m => m.id === match).operationRevision }, () => svc.recordGameWin('t1', match, { participantId: winner }));
  await Promise.all([run(service, 'm1', 'p1', 'device-one'), run(other, 'm2', 'p3', 'device-two')]);
  const current = await repo.listMatches('t1');
  assert.deepEqual(current.map(m => m.participants[0].score), [1,1,0]);
  const revision = matchRevision(current[2]);
  const results = await Promise.allSettled(['p5','p6'].map((winner,i) => operationRequest.run({ id: `race-device-${i}`, expectedRevision: revision }, () => service.recordGameWin('t1', 'm3', { participantId: winner }))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.statusCode, 409);
});

test('PostgreSQL: unchanged matches and participant rows are not rewritten', async t => {
  const { db, repo, service, trace } = await fixture(t);
  const before = await db.query("select id,xmin::text as revision from matches order by id");
  const participantsBefore = await db.query("select id from match_participants where match_id='m2' order by id");
  await service.recordGameWin('t1', 'm1', { participantId: 'p1' });
  const after = await db.query("select id,xmin::text as revision from matches order by id");
  assert.notEqual(after.rows[0].revision, before.rows[0].revision);
  assert.deepEqual(after.rows.slice(1), before.rows.slice(1));
  assert.deepEqual((await db.query("select id from match_participants where match_id='m2' order by id")).rows, participantsBefore.rows);
  assert.equal(trace.filter(q => q.sql.includes('insert into matches')).length, 1);
  const matches = await repo.listMatches('t1');
  await repo.withTournamentTransaction('t1', () => repo.replaceMatches('t1', matches.filter(m => m.id !== 'm3')));
  assert.deepEqual((await repo.listMatches('t1')).map(m => m.id), ['m1','m2']);
});

test('PostgreSQL: match, operation receipt, history and pending sync roll back together', async t => {
  const f = await fixture(t, true);
  f.service.scheduleMirroredStartggAction = () => { throw new Error('must not launch before commit'); };
  f.fail('insert into tournament_activity');
  await assert.rejects(operationRequest.run({ id: 'rollback-request' }, () => f.service.reportDetailedResult('t1', 'm1', { games: [{ winnerParticipantId: 'p1' }, { winnerParticipantId: 'p1' }] })), /write failure/);
  f.fail(undefined);
  assert.equal((await f.repo.listMatches('t1'))[0].status, 'PLAYING');
  assert.equal((await f.repo.listSyncJobs('t1')).length, 0);
  assert.equal((await f.repo.listActivity('t1')).length, 0);
  assert.equal(await f.repo.getOperation('t1', 'rollback-request'), undefined);
});

class StartggFixture extends NoopStartggClient {
  reports = 0; resets = 0; loseResponse = false;
  remote = { state: 1, disqualified: false, games: [] };
  isConfigured() { return true; }
  async getSetState() { return structuredClone(this.remote); }
  async reportMatchResult(setId, winner, games, dq) {
    this.reports++;
    this.remote = { state: 3, winnerEntrantId: winner, disqualified: dq, games: (games ?? []).map(g => ({ winnerId: g.winnerId, selections: g.selections ?? [] })) };
    if (this.loseResponse) { this.loseResponse = false; throw new Error('simulated lost response'); }
    return { setId, updatedSetIds: [] };
  }
  async resetSet(setId) { this.resets++; this.remote = { state: 1, disqualified: false, games: [] }; return { setId, updatedSetIds: [] }; }
}
function syncService(repo, client) {
  const service = new TournamentsService(repo, undefined, client);
  service.delay = async () => {};
  service.refreshMirroredDownstreamProgressAfterGroupCompletion = async () => {};
  return service;
}
const games = [{ winnerParticipantId: 'p1' }, { winnerParticipantId: 'p1' }];

test('durable sync resumes after restart and a lost response does not send the result twice', async t => {
  const { repo } = await fixture(t, true);
  const client = new StartggFixture(); client.loseResponse = true;
  const original = syncService(repo, client);
  original.scheduleMirroredStartggAction = () => {}; // Process stops after commit.
  await original.reportDetailedResult('t1', 'm1', { games });
  assert.equal((await repo.listSyncJobs('t1'))[0].state, 'PENDING');
  const restarted = syncService(repo, client);
  await restarted.resumePendingSyncs();
  await restarted.awaitStartggActionQueue('t1');
  assert.equal(client.reports, 1);
  assert.equal(client.resets, 0);
  assert.equal((await repo.listSyncJobs('t1'))[0].state, 'SYNCED');
  assert.equal((await restarted.getTournamentOverview('t1')).matches[0].syncStatus.state, 'SYNCED');
});

test('remote conflicts stay visible and retry verifies the result before sending', async t => {
  const { repo } = await fixture(t, true);
  const client = new StartggFixture(); client.remote = { state: 3, winnerEntrantId: '102', disqualified: false, games: [] };
  const service = syncService(repo, client);
  await service.reportDetailedResult('t1', 'm1', { games });
  await service.awaitStartggActionQueue('t1');
  const failed = (await service.getTournamentOverview('t1')).matches[0].syncStatus;
  assert.equal(failed.state, 'FAILED'); assert.equal(failed.canRetry, true);
  assert.equal(client.reports, 0); assert.equal(client.resets, 0);
  client.remote = { state: 3, winnerEntrantId: '101', disqualified: false, games: [1,2].map(() => ({ winnerId: '101', selections: [] })) };
  await service.retrySync('t1', 'm1'); await service.awaitStartggActionQueue('t1');
  assert.equal((await repo.listSyncJobs('t1'))[0].state, 'SYNCED');
  assert.equal(client.reports, 0);
});

test('HTTP contract exposes revision conflicts, readable history and diagnostic export', async t => {
  const { service } = await fixture(t);
  const app = express(); app.use(express.json()); app.use('/api/tournaments', createTournamentRouter(service));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/tournaments/t1`;
  const overview = await (await fetch(base)).json();
  const headers = { 'Content-Type': 'application/json', 'X-Operation-Id': 'http-report-1', 'X-Match-Revision': overview.matches[0].operationRevision, 'X-Client-Platform': 'iOS', 'X-App-Version': 'test' };
  const first = await fetch(`${base}/matches/m1/game-win`, { method: 'POST', headers, body: JSON.stringify({ participantId: 'p1' }) });
  assert.equal(first.status, 200);
  assert.match(first.headers.get('x-match-revision'), /^[a-f0-9]{64}$/);
  const stale = await fetch(`${base}/matches/m1/game-win`, { method: 'POST', headers: { ...headers, 'X-Operation-Id': 'http-report-2' }, body: JSON.stringify({ participantId: 'p2' }) });
  assert.equal(stale.status, 409);
  const staleForm = await fetch(`${base}/matches/m1/result-detailed`, { method: 'POST',
    headers: { ...headers, 'X-Operation-Id': 'http-report-3', 'X-Match-Revision': first.headers.get('x-match-revision') },
    body: JSON.stringify({ expectedRevision: overview.matches[0].operationRevision, games }) });
  assert.equal(staleForm.status, 409, 'an open form must keep its revision even when polling refreshed the client cache');
  const activity = await (await fetch(`${base}/activity`)).json();
  assert.equal(activity.entries[0].summary, 'Game win added');
  assert.match(activity.entries[0].detail, /Before:.*After:/s);
  assert.match(activity.diagnosticText, /iOS test/);
});

test('diagnostic redaction removes credentials and URLs', () => {
  const message = safeDiagnostic('Authorization: Bearer secret-token api_key=hidden password="pass" {"token":"json-secret"} https://host/path?token=secret');
  for (const secret of ['secret-token','hidden','pass"','json-secret','host/path']) assert.equal(message.includes(secret), false, message);
});

test('import progress persists across service instances and stops updating finished jobs', async t => {
  const { repo, service } = await fixture(t);
  await repo.withTournamentTransaction('t1', async () => {
    const tournament = await repo.getTournament('t1');
    tournament.settings.importJob = { state: 'RUNNING', eventUrl: 'https://www.start.gg/tournament/test/event/singles', syncResults: true, preserveTournamentTitle: true, updatedAt: new Date().toISOString() };
    await repo.saveTournament(tournament);
  });
  const progress = { stage: 'PARTICIPANTS', message: 'Descargando participantes', completed: 12, total: 25 };
  await service.persistImportProgress('t1', progress);
  const restarted = new TournamentsService(repo);
  assert.deepEqual((await restarted.getTournamentOverview('t1')).tournament.settings.importJob.progress, progress);
  const tournament = await repo.getTournament('t1');
  tournament.settings.importJob.state = 'COMPLETED';
  await repo.saveTournament(tournament);
  await restarted.persistImportProgress('t1', { stage: 'WAITING', message: 'stale update' });
  assert.deepEqual((await repo.getTournament('t1')).settings.importJob.progress, progress);
});

test('recovery discards superseded results and verifies an already reset remote set', async t => {
  const { repo } = await fixture(t, true);
  const client = new StartggFixture();
  const original = syncService(repo, client);
  original.scheduleMirroredStartggAction = () => {};
  await original.reportDetailedResult('t1', 'm1', { games });
  await original.resetMatch('t1', 'm1');
  const restarted = syncService(repo, client);
  await restarted.resumePendingSyncs(); await restarted.awaitStartggActionQueue('t1');
  const jobs = await repo.listSyncJobs('t1');
  assert.equal(jobs.find(j => j.action === 'set-completion').state, 'SUPERSEDED');
  assert.equal(jobs.find(j => j.action === 'set-reset').state, 'SYNCED');
  assert.equal(client.reports, 0); assert.equal(client.resets, 0);
});

test('resetting one imported set preserves unrelated matches and their pending result sync',async t=>{
 const {repo}=await fixture(t,true),client=new StartggFixture(),original=syncService(repo,client);
 original.scheduleMirroredStartggAction=()=>{};
 await original.reportDetailedResult('t1','m2',{games:[{winnerParticipantId:'p3'},{winnerParticipantId:'p3'}]});
 const untouched=(await repo.listMatches('t1')).filter(m=>m.id!=='m1');
 await original.resetMatch('t1','m1');
 assert.deepEqual((await repo.listMatches('t1')).filter(m=>m.id!=='m1'),untouched);
 const restarted=syncService(repo,client);await restarted.resumePendingSyncs();await restarted.awaitStartggActionQueue('t1');
 assert.equal(client.reports,1);assert.equal((await repo.listSyncJobs('t1')).find(j=>j.matchId==='m2').state,'SYNCED');
});

test('PostgreSQL: streams persist and simultaneous devices cannot reserve the same stream', async t => {
  const { repo, service, trace } = await fixture(t);
  // Calls reserve matches that have not started playing yet.
  await repo.replaceMatches('t1',(await repo.listMatches('t1')).map(m=>({...m,status:'PENDING'})));
  await service.updateSetups('t1', 3, 2);
  assert.equal((await repo.getTournament('t1')).settings.streamCount, 2);
  const other = new TournamentsService(repo);
  const results = await Promise.allSettled([
    service.callMatch('t1', 'm1', { calledByUserId: 'one', stationLabel: 'Stream 1' }),
    other.callMatch('t1', 'm2', { calledByUserId: 'two', stationLabel: 'stream1' }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /already in use/);
  assert.equal((await repo.listMatches('t1')).filter(m => m.call?.stationLabel === 'Stream 1').length, 1);
  assert.ok(trace.some(q => q.sql.includes('pg_advisory_xact_lock')));
  await assert.rejects(other.updateSetups('t1', 3, 0), /stream.*in use/);
  assert.equal((await repo.getTournament('t1')).settings.streamCount, 2);
  await service.callMatch('t1', 'm3', { calledByUserId: 'one', stationLabel: 'Setup 1' });
  const stored = await repo.listMatches('t1');
  assert.equal(stored.find(m => m.id === 'm3').call.stationLabel, 'Setup 1');
  stored[0].externalRef = { provider: 'START_GG', setId: '123', stream: { id: '9', name: 'Channel', source: 'TWITCH' } };
  await repo.replaceMatches('t1', stored);
  assert.deepEqual((await repo.listMatches('t1'))[0].externalRef.stream, stored[0].externalRef.stream);
});

test('PostgreSQL: late call/start/cancel requests leave a resolved match and its audit unchanged',async t=>{
  const {repo,service}=await fixture(t);
  await service.recordGameWin('t1','m1',{participantId:'p1'});
  await service.recordGameWin('t1','m1',{participantId:'p1'});
  const before=await repo.listMatches('t1'),activity=await repo.listActivity('t1');
  const other=new TournamentsService(repo);
  const attempts=await Promise.allSettled([
    service.callMatch('t1','m1',{calledByUserId:'old-client',stationLabel:'Setup 1'}),
    other.startMatch('t1','m1',{startedByUserId:'old-client'}),
    other.cancelMatchCall('t1','m1'),
  ]);
  assert(attempts.every(result=>result.status==='rejected'));
  assert.deepEqual(await repo.listMatches('t1'),before);assert.deepEqual(await repo.listActivity('t1'),activity);
  assert.equal(before.find(m=>m.id==='m1').winnerParticipantId,'p1');
});
