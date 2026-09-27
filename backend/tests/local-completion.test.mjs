import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { TournamentsService } from '../dist/modules/tournaments/tournaments.service.js';
import { createTop8Routers } from '../dist/modules/top8/top8.routes.js';

function fixture() {
  const tournament = { id: 'local', title: 'Local 13', gameTitle: '2XKO', status: 'DRAFT',
    settings: { format: 'DOUBLE_ELIMINATION', bracketMode: 'STANDARD', bestOf: 1, seedingMethod: 'MANUAL' } };
  const repo = { tournament, matches: [], writes: 0, activities: [],
    participants: Array.from({ length: 13 }, (_, i) => ({ id: `p${i + 1}`, displayName: `Player ${i + 1}`, seed: i + 1, status: 'ACTIVE' })),
    async getTournament() { return structuredClone(this.tournament); },
    async listParticipants() { return structuredClone(this.participants); },
    async listMatches() { return structuredClone(this.matches); },
    async replaceMatches(_, matches) { this.writes++; this.matches = structuredClone(matches); },
    async saveTournament(value) { this.tournament = structuredClone(value); },
    async appendActivity(value) { this.activities.push(value); },
  };
  return { repo, service: new TournamentsService(repo) };
}
const done = m => ['COMPLETED', 'WALKOVER'].includes(m.status);
const ready = m => !done(m) && m.participants.length === 2 && m.participants.every(p => /^p\d+$/.test(p.participantId));
async function play(f, losersWinsFinal = false) {
  for (let i = 0; i < 80; i++) {
    const m = f.repo.matches.find(m => ready(m) && !(m.bracketStage === 'FINALS' && m.roundNumber === 2));
    if (!m) return;
    const index = losersWinsFinal && m.bracketStage === 'FINALS' ? 1 : 0;
    await f.service.recordGameWin('local', m.id, { participantId: m.participants[index].participantId });
  }
  assert.fail('Bracket failed to terminate');
}
async function generated() {
  const f = fixture();
  await f.service.generateBracket('local');
  await f.service.startTournament('local');
  return f;
}

test('resetting a local match preserves unrelated automatic passes', async () => {
  const f = await generated();
  const byes = f.repo.matches.filter(m => m.participants.length === 1 && done(m));
  assert(byes.length >= 3);
  const first = f.repo.matches.find(ready);
  await f.service.recordGameWin('local', first.id, { participantId: first.participants[0].participantId });
  await f.service.resetMatch('local', first.id);
  for (const bye of byes.filter(m => m.bracketStage === 'WINNERS')) {
    assert.deepEqual(f.repo.matches.find(m => m.id === bye.id), bye);
  }
  await play(f);
  assert.equal(f.repo.tournament.status, 'COMPLETED');
});

test('legacy pending passes recover safely and unlock the Top editor without altering played results', async t => {
  const f = await generated();
  await play(f);
  const played = structuredClone(f.repo.matches.filter(m => m.participants.length > 1));
  for (const m of f.repo.matches.filter(m => m.participants.length === 1)) {
    m.status = 'PENDING'; m.winnerParticipantId = undefined; m.advancingParticipantIds = [];
    m.participants.forEach(p => p.score = 0);
  }
  f.repo.tournament.status = 'IN_PROGRESS';
  const router = createTop8Routers(f.service, { isConfigured: () => false }, 'https://your-domain.example');
  const app = express(); app.use(express.json());
  app.use('/tournaments/:tournamentId/top', router.protectedRouter); app.use('/top', router.publicRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await post('/tournaments/local/top', {});
  assert.equal(response.status, 200);
  const url = new URL((await response.json()).url);
  const data = await (await post('/top/session', { token: new URLSearchParams(url.hash.slice(1)).get('session') })).json();
  assert.deepEqual(data.players.map(p => p.placement), [1, 2, 3, 4, 5, 5, 7, 7]);
  assert.equal(f.repo.tournament.status, 'COMPLETED');
  assert.deepEqual(f.repo.matches.filter(m => m.participants.length > 1), played);
  const writes = f.repo.writes;
  await f.service.getTournamentOverview('local');
  assert.equal(f.repo.writes, writes, 'Repair must be idempotent');
});

test('pending games and an activated grand final reset still prevent completion', async () => {
  const f = await generated();
  assert.equal((await f.service.getTournamentOverview('local')).tournament.status, 'IN_PROGRESS');
  await play(f, true);
  assert.equal((await f.service.getTournamentOverview('local')).tournament.status, 'IN_PROGRESS');
  const reset = f.repo.matches.find(m => m.bracketStage === 'FINALS' && m.roundNumber === 2);
  await f.service.recordGameWin('local', reset.id, { participantId: reset.participants[0].participantId });
  assert.equal(f.repo.tournament.status, 'COMPLETED');
  await f.service.resetMatch('local', reset.id);
  assert.equal(f.repo.tournament.status, 'IN_PROGRESS');
});

test('legacy repair leaves imported, Fortnite, unresolved and active single-entry matches alone', async () => {
  for (const mode of ['imported', 'fortnite', 'placeholder', 'called']) {
    const f = await generated();
    await play(f);
    const bye = f.repo.matches.find(m => m.participants.length === 1);
    bye.status = 'PENDING'; bye.winnerParticipantId = undefined; bye.advancingParticipantIds = [];
    bye.participants[0].score = 0; f.repo.tournament.status = 'IN_PROGRESS';
    if (mode === 'imported') f.repo.tournament.importSource = { provider: 'START_GG' };
    if (mode === 'fortnite') { f.repo.tournament.settings.bracketMode = 'FORTNITE'; f.repo.getFortniteState = async () => undefined; }
    if (mode === 'placeholder') bye.participants[0].participantId = 'winner_of_unresolved';
    if (mode === 'called') { bye.status = 'CALLED'; bye.call = { calledAt: new Date().toISOString() }; }
    const before = structuredClone(f.repo.matches);
    assert.equal((await f.service.getTournamentOverview('local')).tournament.status, 'IN_PROGRESS', mode);
    assert.deepEqual(f.repo.matches, before, mode);
  }
});

test('correcting or resetting the grand final clears an already played reset', async () => {
  const f = await generated();
  await play(f, true);
  const final = f.repo.matches.find(m => m.bracketStage === 'FINALS' && m.roundNumber === 1);
  const reset = f.repo.matches.find(m => m.bracketStage === 'FINALS' && m.roundNumber === 2);
  await f.service.recordGameWin('local', reset.id, { participantId: reset.participants[0].participantId });
  await f.service.reportDetailedResult('local', final.id, { games: [{ winnerParticipantId: final.participants[0].participantId }] });
  const updated = f.repo.matches.find(m => m.id === reset.id);
  assert.equal(updated.status, 'PENDING');
  assert.equal(updated.winnerParticipantId, undefined);
  assert.deepEqual(updated.gameResults, []);
  assert.equal(f.repo.tournament.status, 'COMPLETED');
  await f.service.resetMatch('local', final.id);
  assert.equal(f.repo.tournament.status, 'IN_PROGRESS');
  assert(f.repo.matches.find(m => m.id === reset.id).participants.every(p => /^(winner|loser)_of_/.test(p.participantId)));
});
