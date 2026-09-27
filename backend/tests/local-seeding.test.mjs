import test from 'node:test';
import assert from 'node:assert/strict';
import { TournamentsService } from '../dist/modules/tournaments/tournaments.service.js';

function fixture(count, settings = {}) {
  const repo = {
    tournament: { id: 'seeding', title: 'Local seeding', status: 'DRAFT',
      settings: { format: 'DOUBLE_ELIMINATION', bracketMode: 'STANDARD', bestOf: 1, seedingMethod: 'MANUAL', ...settings } },
    participants: Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, displayName: `Player ${i + 1}`, seed: i + 1, status: 'ACTIVE' })),
    matches: [],
    async getTournament() { return structuredClone(this.tournament); },
    async listParticipants() { return structuredClone(this.participants); },
    async listMatches() { return structuredClone(this.matches); },
    async replaceMatches(_, matches) { this.matches = structuredClone(matches); },
    async saveTournament(tournament) { this.tournament = structuredClone(tournament); },
    async appendActivity() {},
  };
  return { repo, service: new TournamentsService(repo) };
}
const done = match => ['COMPLETED', 'WALKOVER'].includes(match.status);
const ready = match => !done(match) && match.participants.length === 2 && match.participants.every(p => /^p\d+$/.test(p.participantId));
const find = (f, stage, round, number) => f.repo.matches.find(m => m.bracketStage === stage && m.roundNumber === round && m.matchNumber === number);
async function result(f, stage, round, number, winner) {
  const match = find(f, stage, round, number);
  assert(match && ready(match), `Expected ready ${stage} ${round}.${number}`);
  await f.service.recordGameWin('seeding', match.id, { participantId: winner });
}

test('an early winners opponent crosses to the opposite losers branch (8 entrants)', async () => {
  const f = fixture(8);
  await f.service.generateBracket('seeding'); await f.service.startTournament('seeding');
  await result(f, 'WINNERS', 1, 1, 'p1'); // B beats A (seed 8).
  await result(f, 'WINNERS', 1, 2, 'p4');
  await result(f, 'WINNERS', 1, 3, 'p2');
  await result(f, 'WINNERS', 1, 4, 'p3');
  await result(f, 'LOSERS', 1, 1, 'p8');
  await result(f, 'LOSERS', 1, 2, 'p7');
  await result(f, 'WINNERS', 2, 1, 'p4'); // B now drops to losers.
  await result(f, 'WINNERS', 2, 2, 'p2');
  const nextA = f.repo.matches.find(m => ready(m) && m.participants.some(p => p.participantId === 'p8'));
  assert.deepEqual(nextA.participants.map(p => p.participantId).sort(), ['p3', 'p8']);
  const nextB = f.repo.matches.find(m => ready(m) && m.participants.some(p => p.participantId === 'p1'));
  assert.deepEqual(nextB.participants.map(p => p.participantId).sort(), ['p1', 'p7']);
});

test('byes retain their original branch when first-round losers are paired', async () => {
  for (const count of [5, 6, 9, 10, 11, 13, 17, 25, 33]) {
    const f = fixture(count); await f.service.generateBracket('seeding');
    const winners = f.repo.matches.filter(m => m.bracketStage === 'WINNERS' && m.roundNumber === 1);
    for (const match of f.repo.matches.filter(m => m.bracketStage === 'LOSERS' && m.roundNumber === 1)) {
      const sources = match.participants.map(p => winners.findIndex(w => p.participantId === `loser_of_${w.id}`));
      assert(sources.every(i => i >= 0), 'First losers round must refer to first winners round');
      assert(sources.every(i => Math.floor(i / 2) === match.matchNumber - 1), `Compacted bye altered branch in ${count} entrants`);
    }
    assert(f.repo.matches.every(m => m.participants.length > 0), 'No empty match can block completion');
  }
});

test('two-player double elimination still requires a second loss, with a conditional reset', async () => {
  const f = fixture(2); await f.service.generateBracket('seeding'); await f.service.startTournament('seeding');
  await result(f, 'WINNERS', 1, 1, 'p1');
  assert.equal(f.repo.tournament.status, 'IN_PROGRESS');
  await result(f, 'FINALS', 1, 1, 'p2');
  assert.equal(f.repo.tournament.status, 'IN_PROGRESS');
  await result(f, 'FINALS', 2, 1, 'p1');
  assert.equal(f.repo.tournament.status, 'COMPLETED');
});

test('manual seeds separate favourites and award initial byes to the highest seeds', async () => {
  for (const count of [2, 3, 5, 6, 8, 13, 16, 25, 32, 64, 128, 256, 512, 1024, 2048]) {
    const f = fixture(count);
    f.repo.participants.reverse(); // Storage/insertion order is not the seeding.
    await f.service.generateBracket('seeding');
    const first = f.repo.matches.filter(m => m.bracketStage === 'WINNERS' && m.roundNumber === 1);
    const size = 2 ** Math.ceil(Math.log2(count));
    const seen = first.flatMap(m => m.participants.map(p => p.participantId));
    assert.equal(new Set(seen).size, count); assert.equal(seen.length, count);
    const byeSeeds = first.filter(m => m.participants.length === 1)
      .map(m => Number(m.participants[0].participantId.slice(1))).sort((a, b) => a - b);
    assert.deepEqual(byeSeeds, Array.from({ length: size - count }, (_, i) => i + 1));
    for (let top = 2; top <= size / 2; top *= 2) {
      const branches = new Set();
      first.forEach((m, position) => m.participants.forEach(p => {
        if (Number(p.participantId.slice(1)) <= top) branches.add(Math.floor(position / (size / (2 * top))));
      }));
      assert.equal(branches.size, top, `${count} entrants: top ${top} must be in distinct branches`);
    }
  }
});

test('complete tournaments with byes and upsets eliminate every non-champion twice', async () => {
  for (let count = 2; count <= 33; count++) {
    for (const strategy of ['favourite', 'upsets']) {
      const f = fixture(count); await f.service.generateBracket('seeding'); await f.service.startTournament('seeding');
      const losses = new Map(f.repo.participants.map(p => [p.id, 0]));
      let played = 0, champion;
      while (f.repo.tournament.status !== 'COMPLETED' && played < 2 * count) {
        const candidates = f.repo.matches.filter(ready);
        assert(candidates.length, `${count}/${strategy}: bracket stalled`);
        // Exercise different reporting orders, including interleaved winners/losers.
        const match = candidates[strategy === 'upsets' ? candidates.length - 1 : 0];
        const [a, b] = match.participants.map(p => p.participantId);
        assert.notEqual(a, b);
        if (match.bracketStage === 'WINNERS') {
          assert.equal(losses.get(a), 0); assert.equal(losses.get(b), 0);
        } else if (match.bracketStage === 'LOSERS') {
          assert.equal(losses.get(a), 1); assert.equal(losses.get(b), 1);
        }
        const winner = strategy === 'favourite'
          ? [a, b].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)))[0]
          : match.participants[(played + count) % 2].participantId;
        const loser = a === winner ? b : a;
        losses.set(loser, losses.get(loser) + 1);
        assert(losses.get(loser) <= 2, 'Eliminated participant returned to bracket');
        await f.service.recordGameWin('seeding', match.id, { participantId: winner });
        champion = winner; played++;
      }
      assert.equal(f.repo.tournament.status, 'COMPLETED', `${count}/${strategy}`);
      assert([2 * count - 2, 2 * count - 1].includes(played));
      for (const [id, defeats] of losses) assert.equal(defeats, id === champion ? played - (2 * count - 2) : 2);
    }
  }
});

test('regeneration remains blocked for start.gg and reading an existing local bracket does not rewire it', async () => {
  const f = fixture(8);
  // Reproduce the previous, uncrossed topology for this full eight-player bracket.
  f.service.orderLosersForCrossover = round => round;
  await f.service.generateBracket('seeding');
  delete f.service.orderLosersForCrossover;
  const original = structuredClone(f.repo.matches);
  assert(find(f, 'LOSERS', 2, 1).participants.some(p => p.participantId === `loser_of_${find(f, 'WINNERS', 2, 1).id}`));
  await f.service.getTournamentOverview('seeding');
  assert.deepEqual(f.repo.matches, original);
  f.repo.tournament.importSource = { provider: 'START_GG' };
  await assert.rejects(f.service.generateBracket('seeding'), /bracket imported from start.gg/);
  assert.deepEqual(f.repo.matches, original);
});
