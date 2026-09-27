import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';
import { DisplayAdminStore } from '../dist/modules/display-admin/display-admin.store.js';
import { createDisplayAdminRouter } from '../dist/modules/display-admin/display-admin.routes.js';
import { displaySettingsSchema, normalizeDisplayPreferences } from '../dist/modules/display-admin/display-settings.js';
const require = createRequire(import.meta.url);
const client = require('../../display-web/display-settings.js');
const core = require('../../display-web/display-core.js');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gt-display-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new DisplayAdminStore(directory);
  await store.ensureReady();
  return store;
}

test('legacy display state gains safe defaults, shared by server and browser', async t => {
  const store = await fixture(t);
  const old = await store.readState();
  delete old.displaySettings;
  await store.writeState(old);
  assert.deepEqual((await store.getPublicConfig()).displaySettings, client.defaults);
  assert.deepEqual(normalizeDisplayPreferences({ textScale: -20, bracketDensity: 'bad', showCalls: false }), { ...client.defaults, showCalls: false });
  for (const input of [{}, { displaySettings: { textScale: 999 } }, { displaySettings: { showCalls: 'false' } }, { bracketRenderMode: 'bad' }]) assert.equal(displaySettingsSchema.safeParse(input).success, false);
  assert.equal(displaySettingsSchema.safeParse({ bracketRenderMode: 'modern' }).success, true);
  const config = await store.getPublicConfig();
  assert.equal(config.auth, undefined);
  assert.equal(config.username, undefined);
});

test('simultaneous display edits preserve each other and recover after a rejected edit', async t => {
  const store = await fixture(t);
  await Promise.all([
    store.saveDisplaySettings({ displaySettings: { bracketDensity: 'compact', textScale: 110 } }),
    store.saveNotificationSettings({ telegramEnabled: false }),
    store.saveMessageTemplates({ telegramLadderCompleted: 'Clasificación: {{tournament_title}}' }),
    store.saveTheme({ id: 'test', key: 'test', name: 'Prueba', matchers: [], cssVars: {}, assets: {} }),
  ]);
  await assert.rejects(store.selectSound('missing'), /no encontrado/);
  await store.saveBracketRenderMode('modern');
  const state = await store.readState();
  assert.equal(state.displaySettings.textScale, 110);
  assert.equal(state.displaySettings.bracketDensity, 'compact');
  assert.equal(state.notifications.telegramEnabled, false);
  assert.equal(state.bracketRenderMode, 'modern');
  assert.match(state.messageTemplates.telegramLadderCompleted, /Clasificación/);
  assert(state.themes.some(theme => theme.id === 'test'));
  assert.deepEqual((await fs.readdir(store.dataDir)).filter(name => name.endsWith('.tmp')), []);
});

test('HTTP admin persists ladder templates and sparse settings; theme deletion protects the base', async t => {
  const store = await fixture(t);
  const app = express(); app.use(express.json()); app.use('/admin', createDisplayAdminRouter(store));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  await store.accounts.createUser('display-test', 'display-test-password');
  const token = await store.verifyLogin('display-test', 'display-test-password');
  const post = (url, body) => fetch(`http://127.0.0.1:${server.address().port}/admin${url}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('/settings/save', { displaySettings: { bracketRows: 9, showCalls: false } })).status, 200);
  assert.equal((await post('/settings/save', { bracketRenderMode: 'modern' })).status, 200);
  assert.equal((await store.readState()).displaySettings.bracketRows, 9);
  assert.equal((await store.readState()).displaySettings.showCalls, false);
  assert.equal((await post('/settings/save', { displaySettings: { bracketRows: 999 } })).status, 400);
  const messages = { ...(await store.readState()).messageTemplates, telegramLadderCompleted: 'TG ladder', whatsappLadderCompletedCaption: 'WA ladder' };
  assert.equal((await post('/messages/save', messages)).status, 200);
  assert.equal((await store.readState()).messageTemplates.telegramLadderCompleted, 'TG ladder');
  assert.equal((await store.readState()).messageTemplates.whatsappLadderCompletedCaption, 'WA ladder');
  await store.saveTheme({ id: 'delete-me', key: 'test', name: 'Test', matchers: [], cssVars: {}, assets: {} });
  assert.equal((await post('/themes/delete-me/delete', {})).status, 200);
  assert((await store.readState()).themes.some(theme => theme.id === 'theme_base'));
  assert.equal((await post('/themes/theme_base/delete', {})).status, 400);
  assert((await store.readState()).themes.some(theme => theme.id === 'theme_base'));
  const log = t.mock.method(console, 'error', () => {});
  const failure = t.mock.method(store, 'saveDisplaySettings', async () => { throw new Error('simulated storage failure'); });
  const response = await post('/settings/save', { bracketRenderMode: 'classic' });
  assert.equal(response.status, 500, 'An asynchronous storage error must become an HTTP error without terminating the server');
  assert.match((await response.json()).message, /Inténtalo de nuevo/);
  failure.mock.restore(); log.mock.restore();
  assert.equal((await post('/settings/save', { bracketRenderMode: 'modern' })).status, 200);
});

test('branch pages follow explicit edges even when imported matches are not ordered by pairing', () => {
  const match = (id, sources = []) => ({ id, displaySourceIds: sources, participants: [{ displayName: 'Alex' }, { displayName: 'Cris' }] });
  const clusters = [{ id: 'w', label: 'Winners', columns: [
    { title: 'R1', matches: [match('a'), match('b'), match('c'), match('d'), match('e'), match('f')] },
    { title: 'R2', matches: [match('ef', ['e', 'f']), match('ab', ['a', 'b']), match('cd', ['c', 'd'])] },
    { title: 'Final', matches: [match('final', ['ef', 'ab', 'cd'])] },
  ] }];
  const sections = [{ label: 'Pool A', clusters }];
  const pages = core.paginateSections(sections, 1800, 900, 1, { bracketRows: 2 });
  const ids = page => page[0].clusters[0].columns.flatMap(column => column.matches.map(m => m.id));
  assert.deepEqual(ids(pages[0]), ['a', 'b', 'ab', 'final']);
  assert.deepEqual(ids(pages[1]), ['c', 'd', 'cd', 'final']);
  assert.deepEqual(ids(pages[2]), ['e', 'f', 'ef', 'final']);
  assert.deepEqual(core.paginateSections(sections, 1800, 900, 1, { bracketViewport: 'overview', bracketLayout: 'combined' }), [sections]);
});
