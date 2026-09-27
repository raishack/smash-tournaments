import test from 'node:test';
import assert from 'node:assert/strict';
import { TournamentsService } from '../dist/modules/tournaments/tournaments.service.js';
import { StartggClient } from '../dist/modules/tournaments/startgg.client.js';
import { withBracketLabels } from '../dist/modules/tournaments/bracket-labels.js';
import { renderBracketSvg } from '../dist/modules/tournaments/bracket-svg.js';
import { createStartggImportSchema, updateSetupsSchema } from '../dist/modules/tournaments/tournament.schemas.js';

const tournament = () => ({ id: 'streams-test', title: 'Stream tournament', description: 'Stream test', gameTitle: 'Super Smash Bros. Ultimate',
  platform: 'Switch', maxParticipants: 32, status: 'IN_PROGRESS', settings: { format: 'DOUBLE_ELIMINATION', bestOf: 3,
    setupCount: 3, streamCount: 2, callTimeoutMinutes: 10, seedingMethod: 'MANUAL' } });
const match = (id, extra = {}) => ({ id, tournamentId: 'streams-test', bracketStage: 'WINNERS', roundNumber: 1,
  matchNumber: 1, bestOf: 3, advancersRequired: 1, status: 'PENDING', participants: [1, 2].map(slot => ({
    participantId: `${id}-p${slot}`, displayName: `Player ${slot}`, slot, score: 0 })), ...extra });
function repository(initial = tournament(), matches = [match('m1'), match('m2'), match('m3')]) {
  return { tournament: structuredClone(initial), matches: structuredClone(matches), writes: 0,
    async getTournament() { return structuredClone(this.tournament); },
    async saveTournament(value) { this.tournament = structuredClone(value); },
    async listMatches() { return structuredClone(this.matches); },
    async replaceMatches(_id, values) { this.writes++; this.matches = structuredClone(values); },
    async listParticipants() { return []; },
    async replaceParticipants() {},
  };
}
const call = stationLabel => ({ calledByUserId: 'test-organizer', stationLabel });

test('resource schemas accept 0/1/2 streams and older import clients default to no stream', () => {
  for (const streamCount of [0, 1, 2]) assert.equal(updateSetupsSchema.parse({ setupCount: 3, streamCount }).streamCount, streamCount);
  for (const streamCount of [-1, 3, 1.5, '2']) assert.equal(updateSetupsSchema.safeParse({ setupCount: 3, streamCount }).success, false);
  const input = { eventUrl: 'https://start.gg/tournament/test/event/singles' };
  assert.equal(createStartggImportSchema.parse(input).streamCount, 0);
  assert.equal(createStartggImportSchema.parse({ ...input, streamCount: 2 }).streamCount, 2);
});

test('local creation persists stream settings; old setup and tournament updates preserve them', async () => {
  const repo = repository(); const service = new TournamentsService(repo);
  const created = await service.createTournament({ ...tournament(), ownerId: 'owner', startsAt: new Date().toISOString(), isPublic: true });
  assert.equal(created.settings.streamCount, 2);
  await service.updateSetups(created.id, 5);
  assert.equal(repo.tournament.settings.streamCount, 2);
  const { streamCount, ...legacySettings } = repo.tournament.settings;
  await service.updateTournament(created.id, { ...repo.tournament, settings: legacySettings });
  assert.equal(repo.tournament.settings.streamCount, 2);
});

test('Setup 1 and Stream 1 can be used independently, while an occupied stream rejects another match', async () => {
  const repo = repository(); const service = new TournamentsService(repo);
  assert.equal((await service.callMatch('streams-test', 'm1', call('Setup 1'))).call.stationLabel, 'Setup 1');
  assert.equal((await service.callMatch('streams-test', 'm2', call(' stream01 '))).call.stationLabel, 'Stream 1');
  await assert.rejects(service.callMatch('streams-test', 'm3', call('STREAM 1')), /already in use/);
  assert.equal(repo.matches[2].status, 'PENDING');
  await service.cancelMatchCall('streams-test', 'm2');
  assert.equal((await service.callMatch('streams-test', 'm3', call('Stream 1'))).call.stationLabel, 'Stream 1');
});

test('disabled, unconfigured and malformed streams are never interpreted as normal setups', async () => {
  const repo = repository(); const service = new TournamentsService(repo);
  for (const label of ['Stream 0', 'Stream 3', 'Stream -1', 'Stream x1']) {
    await assert.rejects(service.callMatch('streams-test', 'm1', call(label)), /not available/);
  }
  await service.updateSetups('streams-test', 3, 0);
  await assert.rejects(service.callMatch('streams-test', 'm1', call('Stream 1')), /not available/);
  assert.equal(repo.writes, 0);
});

test('active streams cannot be removed, including pending result review; normal setups remain independent', async () => {
  for (const status of ['CALLED', 'CHECKED_IN', 'PLAYING', 'RESULT_REPORTED', 'UNDER_REVIEW']) {
    const repo = repository(tournament(), [match('m1', { status, call: { stationLabel: 'Stream 2' } })]);
    const service = new TournamentsService(repo);
    await assert.rejects(service.updateSetups('streams-test', 3, 1), /stream.*uso/);
    assert.equal(repo.tournament.settings.streamCount, 2);
    assert.equal((await service.updateSetups('streams-test', 1, 2)).settings.setupCount, 1);
    repo.matches[0].status = 'COMPLETED';
    assert.equal((await service.updateSetups('streams-test', 1, 0)).settings.streamCount, 0);
    assert.equal(repo.writes, 0);
  }
});

test('imported stream marks neither enable streams nor dictate the destination of a call', async () => {
  const initial = tournament(); initial.settings.streamCount = 0;
  initial.importSource = { provider: 'START_GG', entrantSize: 1, syncResults: false };
  const externalRef = { provider: 'START_GG', setId: '42', identifier: 'A1', stream: { id: '9', name: 'Channel <two>' } };
  const repo = repository(initial, [match('m1', { externalRef })]); const service = new TournamentsService(repo);
  const called = await service.callMatch(initial.id, 'm1', call('Setup 2'));
  assert.equal(called.call.stationLabel, 'Setup 2');
  assert.equal(repo.tournament.settings.streamCount, 0);
  const [labelled] = withBracketLabels([called], initial.settings.format);
  assert.equal(labelled.startggStreamLabel, 'Stream start.gg: Channel <two>');
  assert.equal(labelled.displayIdentifier, 'A1');
  assert.match(labelled.displayLabel, /Stream start.gg/);
  const svg = renderBracketSvg(initial, [called]);
  assert.match(svg, /A1 · Stream gg/);
  assert.doesNotMatch(svg, /Channel <two>/);
  const { streamCount, ...legacySettings } = repo.tournament.settings;
  await service.updateSetups(initial.id, 3, 2);
  await service.updateTournament(initial.id, { ...repo.tournament, settings: legacySettings });
  assert.equal(repo.tournament.settings.streamCount, 2);
});

test('reimports refresh or remove the informational stream mark while preserving the local destination', () => {
  const service = new TournamentsService(repository());
  const previous = match('m1', { status: 'CALLED', call: { stationLabel: 'Stream 2' },
    externalRef: { provider: 'START_GG', setId: '42', stream: { id: '9', name: 'Old channel' } } });
  for (const stream of [{ id: '10', name: 'New channel' }, undefined]) {
    const imported = match('m1', { externalRef: { provider: 'START_GG', setId: '42', stream } });
    const merged = service.mergeMirroredLocalProgress(imported, previous);
    assert.deepEqual(merged.externalRef.stream, stream);
    assert.equal(merged.call.stationLabel, 'Stream 2');
    assert.equal(Boolean(withBracketLabels([merged])[0].startggStreamLabel), Boolean(stream));
  }
});

const source = { phaseId: 'phase1', phaseName: 'Bracket', phaseOrder: 1, phaseType: 'BRACKET',
  isPoolPhase: false, bracketType: 'DOUBLE_ELIMINATION', seedCount: 2 };
const set = (id, stream) => ({ id, state: 1, round: 1, identifier: 'A' + id, totalGames: 3,
  fullRoundText: 'Winners Round 1', stream, slots: [1, 2].map(id => ({ entrant: { id, name: `Player ${id}` } })) });

test('start.gg set metadata and queued streams both survive a complete import without extra per-match requests', async () => {
  const client = new StartggClient('test');
  client.fetchEventBasics = async () => ({ event: { id: 1, name: 'Singles', numEntrants: 2, phases: [],
    tournament: { name: 'Tournament', streamQueue: [{ stream: { id: 11, streamName: 'Queued channel', streamSource: 'TWITCH' },
      sets: [{ id: 2 }, { id: 'different-event' }] }] } } });
  client.collectPhaseSeedSources = () => [source];
  client.fetchPhaseSeeds = async () => [];
  let requests = 0;
  client.fetchMirroredSets = async () => { requests++; return client.toMirroredMatches([
    set(1, { id: 10, streamName: 'long-channel', shortName: 'Assigned channel', streamSource: 'TWITCH' }), set(2, null), set(3, null),
  ], source, 1); };
  const snapshot = await client.importEventSnapshot('https://start.gg/tournament/test/event/singles', { includeGameDetails: false });
  assert.equal(requests, 1);
  assert.equal(snapshot.matches[0].stream.name, 'Assigned channel');
  assert.deepEqual(snapshot.matches[1].stream, { id: '11', name: 'Queued channel', source: 'TWITCH' });
  assert.equal(snapshot.matches[2].stream, undefined);
});

test('stream queries keep set pagination and retry only a rate-limited page', async t => {
  const client = new StartggClient('test'); client.waitForRequestSlot = async () => {};
  const pages = []; let limited = false;
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    const { query, variables } = JSON.parse(request.body);
    assert.match(query, /stream\s*\{\s*id streamName shortName streamSource/);
    assert.equal(variables.perPage, 75);
    pages.push(variables.page);
    if (variables.page === 2 && !limited) { limited = true; return new Response('', { status: 429 }); }
    return Response.json({ data: { phase: { sets: { pageInfo: { totalPages: 3 }, nodes: [set(variables.page, { id: 9, streamName: 'Channel' })] } } } });
  });
  const sets = await client.fetchPhaseSets('phase1');
  assert.deepEqual(pages, [1, 2, 2, 3]);
  assert.equal(sets.length, 3);
  assert(sets.every(s => s.stream.streamName === 'Channel'));
});

test('background start.gg creation saves stream choice before the import job launches', async () => {
  const repo = repository(tournament(), []); const service = new TournamentsService(repo);
  let launched;
  service.launchBackgroundImport = (id, input) => { launched = { id, input, stored: structuredClone(repo.tournament) }; };
  const overview = await service.createStartggImport(createStartggImportSchema.parse({
    eventUrl: 'https://start.gg/tournament/test/event/singles', setupCount: 5, streamCount: 2,
  }));
  assert.equal(overview.tournament.settings.streamCount, 2);
  assert.equal(launched.stored.settings.streamCount, 2);
  assert.equal(launched.stored.settings.importJob.state, 'RUNNING');
  assert.equal(launched.id, overview.tournament.id);
});

test('player bracket keeps the start.gg mark separate from the assigned station', async () => {
  const { PlayerService } = await import('../dist/modules/player/player.service.js');
  const service = new PlayerService();
  const marked = match('m1', { call: { stationLabel: 'Stream 2' },
    externalRef: { provider: 'START_GG', setId: '42', stream: { id: '10', name: 'Remote channel' } } });
  const view = service.mapPlayerBracketMatchView(tournament(), withBracketLabels([marked])[0]);
  assert.equal(view.startggStreamLabel, 'Stream start.gg: Remote channel');
  assert.equal(view.stationLabel, 'Stream 2');
  marked.call.stationLabel = 'Setup 1';
  const normal = service.mapPlayerBracketMatchView(tournament(), withBracketLabels([marked])[0]);
  assert.equal(normal.stationLabel, 'Setup 1');
  assert.equal(normal.startggStreamLabel, view.startggStreamLabel);
});
