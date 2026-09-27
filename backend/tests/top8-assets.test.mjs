import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import { Top8Assets, createTop8AssetRouter } from '../dist/modules/top8/top8-assets.js';
import { topDesignSchema } from '../dist/modules/top8/top8-project.js';
import { collectionFor, selectionFor, useCollection, artworkIssues, prepareDesign } from '../../display-web/top8/top8-library.js';

const root = new URL('../../display-web/assets/top8-library/', import.meta.url);
const read = async name => JSON.parse(await fs.readFile(new URL(name + '.json', root), 'utf8'));
test('Bundled library covers every game with valid images, credits and several non-icon Smash/Rivals collections', async () => {
  const index = await read('index'), manifest = await read('images');
  assert.equal(index.games.length, 240); assert.equal(index.revision, manifest.revision);
  for (const info of index.games) {
    const game = await read(info.id); assert(game.collections.length, info.id);
    for (const collection of game.collections) {
      assert(collection.source.startsWith('https://github.com/joaorb64/StreamHelperAssets/tree/' + index.revision));
      assert.equal(typeof collection.credits, 'string');
      if (['ssbu', 'roa2'].includes(game.id)) assert.notEqual(collection.kind, 'icon');
      for (const [id, variants] of Object.entries(collection.characters)) {
        assert(game.characters.some(c => c.id === id), `${info.id}/${id}`);
        for (const variant of variants) { assert(manifest.images[variant.image]); assert(variant.width > 0 && variant.height > 0); }
      }
    }
  }
  assert((await read('ssbu')).collections.length >= 3); assert((await read('roa2')).collections.length >= 3);
});

test('Collection switches affect every player, keep duplicate team characters and uploads, and never borrow missing art', async () => {
  const game = await read('roa2');
  const design = { game: 'roa2', collection: 'costume', players: [
    { name: 'Team', characters: ['Kragg', 'Kragg'], skins: ['2', '3'], portrait: '' },
    { name: 'Custom', characters: ['Kragg'], skins: ['2'], portrait: 'data:image/png;base64,abcd' },
    { name: 'Missing', characters: ['not-in-pack'], skins: ['0'], portrait: '' },
  ] };
  useCollection(design, game, 'art'); assert.equal(collectionFor(design, game).id, 'art');
  assert.deepEqual(design.players[0].characters, ['Kragg', 'Kragg']);
  assert.deepEqual(design.players[0].skins, ['0', '0']); assert(design.players[1].portrait);
  assert.equal(selectionFor(design, game, design.players[2], 0), undefined);
  assert.equal(artworkIssues(design, game).length, 1);
  assert(artworkIssues(design, game)[0].includes('Missing'));
  design.players[0].skins[0] = '999'; assert(artworkIssues(design, game).some(w => w.includes('Team')));
});

test('Old projects migrate numeric reported characters to complete artwork while preserving placement and uploaded images', async t => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => new Response(await fs.readFile(new URL(String(url).split('/').at(-1).split('?')[0], root)), { headers: { 'Content-Type': 'application/json' } });
  t.after(() => { globalThis.fetch = oldFetch; });
  const design = { game: 'smash', players: [{ name: 'Winner', placement: 1, characters: ['1302', '1302'], portrait: 'data:image/png;base64,abcd' }] };
  const game = await prepareDesign(design, { catalog: { smash: [{ id: 1302, name: 'Mario', image: '/assets/smash-stock-icons/mario.png' }] } });
  assert.equal(design.collection, 'website'); assert.equal(design.artFit, 'contain');
  assert.deepEqual(design.players[0].characters, ['mario', 'mario']); assert.equal(design.players[0].placement, 1); assert(design.players[0].portrait);
  assert.equal(selectionFor(design, game, design.players[0], 0).width > 500, true);
});

async function fixture(t, request) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'top8-assets-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const png = await sharp({ create: { width: 800, height: 1200, channels: 4, background: '#aabbcc' } }).png().toBuffer();
  const hash = createHash('sha1').update(`blob ${png.length}\0`).update(png).digest('hex');
  const revision = 'a'.repeat(40);
  await fs.writeFile(path.join(dir, 'images.json'), JSON.stringify({ revision, images: { [hash]: { path: 'games/test/full/Hero_0.png', width: 800, height: 1200 } } }));
  let count = 0;
  const store = new Top8Assets(dir, path.join(dir, 'cache'), async (url, options) => {
    count++; assert.equal(url, `https://raw.githubusercontent.com/joaorb64/StreamHelperAssets/${revision}/games/test/full/Hero_0.png`);
    assert.equal(options.redirect, 'error'); return request ? request(count, png) : new Response(png);
  });
  return { store, hash, png, count: () => count };
}
test('Originals are verified once, cached and shared by thumbnail/preview requests; unknown URLs never fetch', async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.store.file(f.hash, 'full'), f.store.file(f.hash, 'thumb'), f.store.file(f.hash, 'preview'), f.store.file(f.hash, 'thumb')]);
  assert.equal(f.count(), 1); assert.deepEqual(await fs.readFile(results[0]), f.png);
  const small = await sharp(await fs.readFile(results[1])).metadata(); assert(small.width <= 320 && small.height <= 320);
  await f.store.file(f.hash, 'full'); assert.equal(f.count(), 1);
  assert.equal(await f.store.lookup('../../private'), undefined);
  await assert.rejects(f.store.file('b'.repeat(40), 'full')); assert.equal(f.count(), 1);
});
test('Corrupt and oversized downloads do not enter the cache and can be retried', async t => {
  const f = await fixture(t, (count, png) => count === 1 ? new Response('not the image') : count === 2 ? new Response(png, { headers: { 'content-length': String(33 * 1024 * 1024) } }) : new Response(png));
  await assert.rejects(f.store.file(f.hash, 'full'), /does not match/);
  await assert.rejects(f.store.file(f.hash, 'full'), /download/);
  const filename = await f.store.file(f.hash, 'full'); assert.deepEqual(await fs.readFile(filename), f.png); assert.equal(f.count(), 3);
});
test('Public image router serves only catalogued images with immutable caching and no auth data', async t => {
  const f = await fixture(t), app = express(); app.use('/assets', createTop8AssetRouter(f.store));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r))); const base = `http://127.0.0.1:${server.address().port}/assets/`;
  assert.equal((await fetch(base + 'b'.repeat(40) + '/full')).status, 404);
  assert.equal((await fetch(base + f.hash + '/original')).status, 404);
  const res = await fetch(base + f.hash + '/thumb'); assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /image\/webp/); assert.match(res.headers.get('cache-control'), /immutable/);
});
test('Saved designs allow game/collection/skins but reject per-player collection overrides and remote uploads', () => {
  const design = { title: 'Top 8', subtitle: '', footer: '', layout: 'grid', ratio: 'wide', font: 'sans-serif', game: 'sf6', collection: 'full', artFit: 'contain', nameSize: 38, shade: 30, backgroundColor: '#000000', cardColor: '#000000', textColor: '#ffffff', accentColor: '#ffffff', background: '', logo: '', players: [{ id: '1', name: 'Player', placement: 1, characters: ['Ryu'], skins: ['0'], extra: '', portrait: '', x: 50, y: 50, zoom: 1 }] };
  assert(topDesignSchema.safeParse(design).success);
  const bad = structuredClone(design); bad.players[0].collection = 'other'; assert(!topDesignSchema.safeParse(bad).success);
  delete bad.players[0].collection; bad.players[0].portrait = 'https://example.test/image.png'; assert(!topDesignSchema.safeParse(bad).success);
});
