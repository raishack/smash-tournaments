import test from 'node:test';
import assert from 'node:assert/strict';
import { TournamentsService } from '../dist/modules/tournaments/tournaments.service.js';
import { CompositeTournamentNotifier, NoopTournamentNotifier } from '../dist/modules/tournaments/tournament-notifier.js';
import { withBracketLabels } from '../dist/modules/tournaments/bracket-labels.js';
import { createStartggImportSchema } from '../dist/modules/tournaments/tournament.schemas.js';
import { TournamentsPostgresRepository } from '../dist/modules/tournaments/tournaments.postgres-repository.js';

const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const tournament = () => ({ id: 't1', title: 'Test tournament', gameTitle: 'Super Smash Bros. Ultimate', status: 'IN_PROGRESS',
  settings: { format: 'DOUBLE_ELIMINATION', bestOf: 3, setupCount: 3 },
  importSource: { provider: 'START_GG', entrantSize: 2 } });
const match = (id = 'm1', changes = {}) => ({ id, tournamentId: 't1', bracketStage: 'WINNERS', roundNumber: 1, matchNumber: 1,
  bestOf: 3, status: 'PENDING', participants: [{ participantId: 'p1', displayName: 'Team 1', score: 0, slot: 1 },
    { participantId: 'p2', displayName: 'Team 2', score: 0, slot: 2 }], ...changes });
function repository(initial = tournament(), matches = [], participants = []) {
  const tournaments = new Map([[initial.id, structuredClone(initial)]]);
  return { tournaments, matches, participants, matchWrites: 0,
    async getTournament(id) { return structuredClone(tournaments.get(id)); },
    async listTournaments() { return structuredClone([...tournaments.values()]); },
    async saveTournament(value) { tournaments.set(value.id, structuredClone(value)); },
    async listMatches() { return structuredClone(this.matches); },
    async listParticipants() { return structuredClone(this.participants); },
    async replaceMatches(_id, values) { this.matchWrites++; this.matches = structuredClone(values); },
    async replaceParticipants(_id, values) { this.participants = structuredClone(values); },
  };
}

test('local quick reporting accepts a ready set and corrections without requiring characters', async () => {
  const local = { ...tournament(), importSource: undefined };
  const repo = repository(local, [match()]);
  const service = new TournamentsService(repo);
  const games = winner => [{ winnerParticipantId: winner }, { winnerParticipantId: winner }];
  await service.reportDetailedResult('t1', 'm1', { games: games('p1') });
  assert.equal(repo.matches[0].status, 'COMPLETED');
  assert.equal(repo.matches[0].winnerParticipantId, 'p1');
  assert.deepEqual(repo.matches[0].participants.map(p => p.score), [2, 0]);
  await service.reportDetailedResult('t1', 'm1', { games: games('p2') });
  assert.equal(repo.matches[0].winnerParticipantId, 'p2');
  assert.deepEqual(repo.matches[0].participants.map(p => p.score), [0, 2]);
});

test('game wins work for a PLAYING set without a local start timestamp', async () => {
  const repo = repository({ ...tournament(), importSource: undefined }, [match('m1', { status: 'PLAYING' })]);
  const service = new TournamentsService(repo);
  await service.recordGameWin('t1', 'm1', { participantId: 'p2' });
  assert.equal(repo.matches[0].status, 'PLAYING');
  assert.deepEqual(repo.matches[0].gameResults, ['p2']);
  await service.recordGameWin('t1', 'm1', { participantId: 'p2' });
  assert.equal(repo.matches[0].status, 'COMPLETED');
  assert.equal(repo.matches[0].winnerParticipantId, 'p2');
});

test('Mario Kart with two racers and one qualifier still uses the qualifier operation', async () => {
  const local = { ...tournament(), importSource: undefined,
    settings: { ...tournament().settings, bracketMode: 'MKART', mkartAdvanceCount: 1, mkartLosersAdvanceCount: 1 } };
  const repo = repository(local, [match('m1', { bestOf: 1, advancersRequired: 1, status: 'PLAYING' })]);
  const service = new TournamentsService(repo);
  await service.selectMarioKartAdvancer('t1', 'm1', { participantId: 'p2' });
  assert.equal(repo.matches[0].status, 'COMPLETED');
  assert.deepEqual(repo.matches[0].advancingParticipantIds, ['p2']);
  assert.equal(repo.matches[0].winnerParticipantId, 'p2');
});

test('local DQ resolves either slot and marks only the absent player disqualified', async () => {
  for (const [outcome, absent, winner] of [['SLOT_1_ABSENT', 'p1', 'p2'], ['SLOT_2_ABSENT', 'p2', 'p1']]) {
    const participants = ['p1', 'p2'].map(id => ({ id, tournamentId: 't1', displayName: id, status: 'ACTIVE' }));
    const repo = repository({ ...tournament(), importSource: undefined }, [match()], participants);
    await new TournamentsService(repo).resolveAbsence('t1', 'm1', { outcome });
    assert.equal(repo.matches[0].status, 'WALKOVER');
    assert.equal(repo.matches[0].winnerParticipantId, winner);
    assert.equal(repo.participants.find(p => p.id === absent).status, 'DISQUALIFIED');
    assert.equal(repo.participants.find(p => p.id === winner).status, 'ACTIVE');
  }
});

test('local absence of both players resolves without awarding a winner', async () => {
  const repo = repository({ ...tournament(), importSource: undefined }, [match()]);
  await new TournamentsService(repo).resolveAbsence('t1', 'm1', { outcome: 'NONE_PRESENT' });
  assert.equal(repo.matches[0].status, 'WALKOVER');
  assert.equal(repo.matches[0].winnerParticipantId, undefined);
  assert.deepEqual(repo.matches[0].advancingParticipantIds, []);
});

test('notifications return before delivery and keep channel order', async () => {
  const gate = deferred(); const events = [];
  class SlowNotifier extends NoopTournamentNotifier {
    async notifyMatchCalled() { events.push('call-start'); await gate.promise; events.push('call-end'); }
    async notifyMatchResolved() { events.push('result'); }
  }
  const notifier = new CompositeTournamentNotifier([new SlowNotifier()]);
  await notifier.notifyMatchCalled(tournament(), match());
  await notifier.notifyMatchResolved(tournament(), match());
  assert.deepEqual(events, ['call-start']);
  gate.resolve(); await notifier.drain();
  assert.deepEqual(events, ['call-start', 'call-end', 'result']);
});

test('a failed notification does not poison later events or other channels', async () => {
  const events = [];
  class FailedNotifier extends NoopTournamentNotifier {
    async notifyMatchCalled() { throw new Error('simulated delivery failure'); }
    async notifyMatchResolved() { events.push('recovered'); }
  }
  class HealthyNotifier extends NoopTournamentNotifier {
    async notifyMatchCalled() { events.push('healthy'); }
  }
  const notifier = new CompositeTournamentNotifier([new FailedNotifier(), new HealthyNotifier()]);
  await notifier.notifyMatchCalled(tournament(), match());
  await notifier.notifyMatchResolved(tournament(), match());
  await notifier.drain();
  assert.deepEqual(events.sort(), ['healthy', 'recovered']);
});

test('setups can change during play without rewriting matches; occupied setups cannot be removed', async () => {
  const repo = repository(tournament(), [match('m1', { status: 'PLAYING', call: { stationLabel: 'Setup 3' } })]);
  const service = new TournamentsService(repo);
  assert.equal((await service.updateSetups('t1', 5)).settings.setupCount, 5);
  await assert.rejects(service.updateSetups('t1', 2), /still in use/);
  repo.matches[0].status = 'COMPLETED';
  assert.equal((await service.updateSetups('t1', 1)).settings.setupCount, 1);
  assert.equal(repo.matchWrites, 0);
});

test('team selections keep every member including identical characters', () => {
  const service = new TournamentsService(repository());
  const selections = service.normalizeDetailedGameSelections(tournament(), match(), [
    { participantId: 'p1', characterName: 'Mario / Mario' },
    { participantId: 'p2', characterName: 'Luigi / Peach' },
  ]);
  assert.equal(selections.length, 4);
  assert.deepEqual(selections.map(s => s.characterName), ['Mario', 'Mario', 'Luigi', 'Peach']);
  const gameData = service.toStartggGameData({ ...match(), gameResults: ['p1'], gameCharacterSelections: [{ gameNum: 1, selections }] },
    [{ id: 'p1', externalRef: { provider: 'START_GG', entrantId: '101' } }, { id: 'p2', externalRef: { provider: 'START_GG', entrantId: '102' } }]);
  assert.deepEqual(gameData[0].selections.map(s => s.entrantId), ['101', '101', '102', '102']);
  assert.throws(() => service.normalizeDetailedGameSelections(tournament(), match(), [
    { participantId: 'p1', characterName: 'Mario' }, { participantId: 'p2', characterName: 'Peach / Luigi' },
  ]), /Selecciona los 2/);
});

test('Rivals reports validate against Rivals characters', () => {
  const service = new TournamentsService(repository());
  const rivals = { ...tournament(), gameTitle: 'Rivals of Aether II', importSource: { provider: 'START_GG', entrantSize: 1 } };
  const selections = service.normalizeDetailedGameSelections(rivals, match(), [
    { participantId: 'p1', characterName: 'Zetterburn' }, { participantId: 'p2', characterName: 'Ranno' },
  ]);
  assert.equal(selections[0].characterId, 2499);
  assert.throws(() => service.normalizeDetailedGameSelections(rivals, match(), [
    { participantId: 'p1', characterName: 'Mario' }, { participantId: 'p2', characterName: 'Ranno' },
  ]), /Unknown character/);
});

test('bracket labels preserve imported identifiers and link loser placeholders without changing IDs', () => {
  const original = [match('source', { externalRef: { phaseId: 'phase', phaseGroupId: 'group', identifier: 'A7', fullRoundText: 'Winners Semi-Final' } }),
    match('target', { bracketStage: 'LOSERS', participants: [{ participantId: 'loser_of_source', displayName: 'old placeholder' }] })];
  const result = withBracketLabels(original);
  assert.equal(result[0].displayLabel, 'A7 · Winners Semi-Final');
  assert.equal(result[1].participants[0].displayName, 'Perdedor de A7');
  assert.equal(result[1].participants[0].participantId, 'loser_of_source');
  assert.equal(original[1].participants[0].displayName, 'old placeholder');
  assert.equal(withBracketLabels([match()], 'ROUND_ROBIN')[0].roundLabel, 'Round 1');
});

test('background imports persist before returning, survive a new service, and record errors for retry', async () => {
  const repo = repository({ ...tournament(), status: 'DRAFT', importSource: undefined }, []);
  const gate = deferred();
  const service = new TournamentsService(repo);
  service.importFromStartgg = async () => { await gate.promise; throw new Error('start.gg is unavailable'); };
  const input = { eventUrl: 'https://www.start.gg/tournament/example/event/singles', syncResults: true, preserveTournamentTitle: false };
  const initial = await service.startBackgroundImport('t1', input);
  assert.equal(initial.tournament.settings.importJob.state, 'RUNNING');
  await tick(); gate.resolve(); await tick();
  assert.equal(repo.tournaments.get('t1').settings.importJob.state, 'FAILED');
  assert.equal(repo.tournaments.get('t1').settings.importJob.error, 'start.gg is unavailable');
  const current = repo.tournaments.get('t1'); current.settings.importJob.state = 'RUNNING';
  const restarted = new TournamentsService(repo); let resumed = 0;
  restarted.importFromStartgg = async () => { resumed++; };
  await restarted.resumeBackgroundImports(); await tick(); await tick();
  assert.equal(resumed, 1);
  assert.equal(repo.tournaments.get('t1').settings.importJob.state, 'COMPLETED');
});

test('creation validates event URLs and setup limits before creating a placeholder', () => {
  assert.equal(createStartggImportSchema.safeParse({ eventUrl: 'https://www.start.gg/tournament/demo/event/singles' }).success, true);
  assert.equal(createStartggImportSchema.safeParse({ eventUrl: 'https://example.com/event/singles' }).success, false);
  assert.equal(createStartggImportSchema.safeParse({ eventUrl: 'https://www.start.gg/tournament/demo/event/singles', setupCount: 0 }).success, false);
});

test('a new import is recoverable from its first database write', async () => {
  const repo = repository();
  const writes = [];
  const save = repo.saveTournament.bind(repo);
  repo.saveTournament = async value => { writes.push(structuredClone(value)); await save(value); };
  const service = new TournamentsService(repo);
  // Simulate a process stopping before its scheduled worker can begin.
  service.launchBackgroundImport = () => {};
  const detail = await service.createStartggImport({
    eventUrl: 'https://www.start.gg/tournament/example/event/teams', syncResults: true,
    preserveTournamentTitle: false, setupCount: 4, callTimeoutMinutes: 10, playerMatchReportingEnabled: true,
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].settings.importJob.state, 'RUNNING');
  assert.equal(writes[0].settings.setupCount, 4);
  const resumed = [];
  const restarted = new TournamentsService(repo);
  restarted.launchBackgroundImport = (id, job) => resumed.push({ id, job });
  await restarted.resumeBackgroundImports();
  assert.equal(resumed[0].id, detail.tournament.id);
  assert.equal(resumed[0].job.eventUrl, writes[0].settings.importJob.eventUrl);
});

test('all result entry points reject writes during import even without the management router', async () => {
  const current = tournament();
  current.settings.importJob = { state: 'RUNNING' };
  const repo = repository(current, [match()]);
  const service = new TournamentsService(repo);
  const operations = [
    () => service.reportDetailedResult('t1', 'm1', { games: [] }),
    () => service.reportResult('t1', 'm1', { winnerParticipantId: 'p1', scores: [] }),
    () => service.recordGameWin('t1', 'm1', { participantId: 'p1' }),
    () => service.resolveAbsence('t1', 'm1', { outcome: 'SLOT_1_ABSENT' }),
    () => service.updateMatchCharacters('t1', 'm1', { selections: [] }),
    () => service.resetMatch('t1', 'm1'),
  ];
  for (const operation of operations) await assert.rejects(operation(), /termine la importacion/);
  assert.equal(repo.matchWrites, 0);
});

test('an imported snapshot uses one transaction and rolls back on storage failure', async () => {
  const commands = []; let released = 0; let fail = false;
  const client = { async query(sql) {
    commands.push(sql.trim());
    if (fail && sql.includes('insert into matches')) throw new Error('simulated storage failure');
    return { rows: [] };
  }, release() { released++; } };
  const repo = new TournamentsPostgresRepository({ async connect() { return client; } });
  await repo.replaceOverview(tournament(), [], [match()]);
  assert.equal(commands.filter(sql => sql === 'begin').length, 1);
  assert.equal(commands.filter(sql => sql === 'commit').length, 1);
  assert.equal(released, 1);
  commands.length = 0; fail = true;
  await assert.rejects(repo.replaceOverview(tournament(), [], [match()]), /storage failure/);
  assert.equal(commands.at(-1), 'rollback');
  assert.equal(commands.includes('commit'), false);
  assert.equal(released, 2);
});
