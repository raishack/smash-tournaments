import test from 'node:test';
import assert from 'node:assert/strict';
import { StartggClient } from '../dist/modules/tournaments/startgg.client.js';

function clientWithoutWaiting() {
  const client = new StartggClient('test-token');
  // Exercise real HTTP/page handling without spending minutes in backoff.
  client.waitForRequestSlot = async () => {};
  return client;
}

test('a large seed import retries only the rate-limited page, preserving pagination', async t => {
  const client = clientWithoutWaiting();
  const pages = [];
  const progress = [];
  let limited = false;
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(url, 'https://api.start.gg/gql/alpha');
    assert.ok(request.signal instanceof AbortSignal);
    const { variables: { page, perPage } } = JSON.parse(request.body);
    pages.push(page);
    assert.equal(perPage, 100);
    if (page === 13 && !limited) {
      limited = true;
      return new Response('', { status: 429, headers: { 'Retry-After': '60' } });
    }
    return Response.json({ data: { phase: { seeds: { pageInfo: { totalPages: 25 },
      nodes: Array.from({ length: 100 }, (_, index) => {
        const id = (page - 1) * 100 + index + 1;
        return { seedNum: id, entrant: { id, name: `Player ${id}` } };
      }) } } } });
  });
  const participants = await client.importProgress.run({ notify: async value => progress.push(value) }, () => client.fetchPhaseSeeds('phase1'));
  assert.equal(participants.length, 2500);
  assert.equal(new Set(participants.map(p => p.externalRef.entrantId)).size, 2500);
  assert.deepEqual(pages, [...Array.from({ length: 13 }, (_, i) => i + 1), ...Array.from({ length: 13 }, (_, i) => i + 13)]);
  assert.ok(client.requestsBlockedUntil > Date.now() + 59000);
  assert.ok(progress.some(item => item.stage === 'WAITING'));
  assert.deepEqual(progress.filter(item => item.stage === 'PARTICIPANTS').map(item => item.completed), Array.from({ length: 25 }, (_, i) => i+1));
  assert.equal(progress.at(-1).total, 25);
});

test('initial queries recover from GraphQL rate limits, network timeouts and server errors', async t => {
  const client = clientWithoutWaiting();
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    if (attempts === 1) return Response.json({ errors: [{ message: 'Rate limit exceeded' }] });
    if (attempts === 2) throw new DOMException('The operation timed out', 'TimeoutError');
    if (attempts === 3) return new Response('', { status: 503 });
    return Response.json({ data: { event: { id: 1 } } });
  });
  assert.deepEqual(await client.graphql('query { event { id } }'), { event: { id: 1 } });
  assert.equal(attempts, 4);
});

test('read retries stop and authorization/validation failures fail immediately', async t => {
  const client = clientWithoutWaiting();
  let attempts = 0;
  let status = 503;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    return new Response('', { status });
  });
  await assert.rejects(client.graphql('query { event { id } }'), /503/);
  assert.equal(attempts, 5);
  status = 401; attempts = 0;
  await assert.rejects(client.graphql('query { event { id } }'), /401/);
  assert.equal(attempts, 1);
});

test('result mutations have a deadline and are never automatically replayed by the client', async t => {
  const client = clientWithoutWaiting();
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    attempts++;
    assert.ok(request.signal instanceof AbortSignal);
    throw new DOMException('The operation timed out', 'TimeoutError');
  });
  await assert.rejects(client.graphqlWithActionRecords('mutation { reportBracketSet { id } }'), /timed out/);
  assert.equal(attempts, 1);
});

test('game details remain in batches of twenty and retry only the failed batch', async t => {
  const client = clientWithoutWaiting();
  const batches = [];
  let failed = false;
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    const { variables } = JSON.parse(request.body);
    const ids = Object.values(variables);
    batches.push(ids);
    assert.ok(ids.length <= 20);
    if (ids[0] === '21' && !failed) {
      failed = true;
      return new Response('', { status: 502 });
    }
    return Response.json({ data: Object.fromEntries(ids.map((id, i) => [`set${i}`, { id, games: [{ winnerId: 'p1' }] }])) });
  });
  const sets = Array.from({ length: 61 }, (_, i) => ({ id: String(i + 1), state: 3 }));
  const hydrated = await client.hydrateSetGames(sets);
  assert.equal(hydrated.length, 61);
  assert.ok(hydrated.every(set => set.games.length === 1));
  assert.deepEqual(batches.map(ids => ids[0]), ['1', '21', '21', '41', '61']);
});

test('concurrent request slots respect spacing and an extended shared cooldown', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const client = new StartggClient('test-token');
  await client.waitForRequestSlot();
  const started = [];
  const next = client.waitForRequestSlot().then(() => started.push(Date.now()));
  await Promise.resolve();
  client.requestsBlockedUntil = 5000;
  t.mock.timers.tick(800);
  await Promise.resolve();
  assert.deepEqual(started, []);
  t.mock.timers.tick(3200);
  await next;
  assert.deepEqual(started, [5000]);
  const last = client.waitForRequestSlot().then(() => started.push(Date.now()));
  await Promise.resolve();
  t.mock.timers.tick(799);
  await Promise.resolve();
  assert.equal(started.length, 1);
  t.mock.timers.tick(1);
  await last;
  assert.deepEqual(started, [5000, 5800]);
});
