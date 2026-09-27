import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { displayFixture } from '../backend/tests/fixtures/display-fixtures.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const output = path.resolve('build/display-review');
await fs.mkdir(output, { recursive: true });
let fixture = displayFixture(32);
let extra = displayFixture(4, 'extra');
let failExtra = false;
let hangExtra = false;
let offline = false;
let mode = 'modern';
let adminStatus = 503;
const errors = [];
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    if (hangExtra && url.pathname === '/api/tournaments/extra') return;
    if (url.pathname === '/api/display-admin/state') { response.writeHead(adminStatus, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'Simulated failure' })); return; }
    if (offline || (failExtra && url.pathname === '/api/tournaments/extra')) { response.writeHead(503).end(); return; }
    const data = url.pathname.endsWith('public-config') ? { bracketRenderMode: mode, themes: [], sponsors: [] }
      : url.pathname === '/api/tournaments' ? [fixture.tournament, extra.tournament]
      : url.pathname.endsWith('/extra') ? extra : fixture;
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(data)); return;
  }
  if (url.pathname === '/config.js') {
    response.setHeader('content-type', 'text/javascript');
    response.end(`window.GTDisplayConfig = { backendUrl: location.origin, appClientKey: 'test', pollIntervalMs: 200, requestTimeoutMs: 300, sponsorMax: 0, themeManifestUrl:'./themes/themes.json', idleImageUrl:'./idle-placeholder.svg' };`); return;
  }
  try {
    const file = path.resolve('display-web', '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(path.resolve('display-web') + path.sep)) throw Error('Invalid path');
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' }[path.extname(file)];
    response.setHeader('content-type', type || 'application/octet-stream'); response.end(await fs.readFile(file));
  } catch (_) { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.locator('.modern-match-card').first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.modern-bracket-canvas')].every(canvas => parseFloat(canvas.style.width) > 300));
  assert.equal(await page.locator('.bracket-viewport').count(), 1);
  assert.equal(await page.locator('.modern-bracket-cluster').count(), 1);
  assert.equal(await page.locator('.modern-entrant').first().locator('img').count(), 2);
  const measurements = await page.evaluate(() => {
    const viewport = document.querySelector('.bracket-viewport').getBoundingClientRect();
    const clusters = [...document.querySelectorAll('.modern-bracket-cluster')].map(e => e.getBoundingClientRect().toJSON());
    const name = document.querySelector('.modern-entrant-name');
    return { viewport: viewport.toJSON(), clusters, matches: document.querySelectorAll('.modern-match-card').length, nameFont: getComputedStyle(name).fontSize, overflow: document.querySelector('.bracket-viewport').scrollHeight - document.querySelector('.bracket-viewport').clientHeight };
  });
  console.log('1080p layout', JSON.stringify(measurements));
  assert(measurements.overflow < 5, 'Bracket must fit vertically without hiding names');
  assert(parseFloat(measurements.nameFont) >= 18);
  await page.screenshot({ path: path.join(output, 'display-1080p.png'), animations: 'disabled' });
  assert(await page.locator('.modern-match-card').count() >= 8, 'Separated branch page must show substantially more matches');
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.modern-entrant-name')).fontSize) >= 36);
  await page.screenshot({ path: path.join(output, 'display-4k.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 7680, height: 4320 });
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.modern-entrant-name')).fontSize) >= 72);
  assert.equal(await page.evaluate(() => document.querySelector('.bracket-viewport').scrollWidth > document.querySelector('.bracket-viewport').clientWidth + 2), false);
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.locator('.screen-controls summary').click();
  await page.locator('[data-field="tournamentId"]').selectOption(fixture.tournament.id);
  await page.locator('[data-field="paused"]').check();
  const title = 'Actualización <b>literal</b>';
  fixture.tournament.title = title;
  failExtra = true;
  await page.waitForFunction(title => document.querySelector('.scene-title .name')?.textContent === title, title);
  assert.equal(await page.locator('.scene-title .name b').count(), 0);
  await page.locator('.display-connection').waitFor({ state: 'visible' });
  offline = true;
  await page.waitForFunction(() => document.querySelector('.display-connection').textContent.includes('Offline'));
  assert(await page.locator('.modern-match-card').count());
  offline = false; failExtra = false;
  await page.locator('.display-connection').waitFor({ state: 'hidden' });
  hangExtra = true;
  fixture.tournament.title = 'Actualización con otra consulta bloqueada';
  await page.waitForFunction(() => document.querySelector('.scene-title .name')?.textContent === 'Actualización con otra consulta bloqueada');
  await page.locator('.display-connection').waitFor({ state: 'visible' });
  hangExtra = false;
  const first = fixture.matches[0];
  first.status = 'CALLED'; first.call = { stationLabel: '1', calledAt: new Date().toISOString() };
  await page.locator('.call-toast').waitFor();
  first.status = 'PLAYING';
  await page.locator('.call-toast').waitFor({ state: 'detached' });
  await page.locator('[data-field="view"]').selectOption('setups');
  await page.locator('.setup-card.occupied').first().waitFor();
  assert.match(await page.locator('.setup-card.occupied').first().textContent(), /Playing/);
  await page.screenshot({ path: path.join(output, 'display-setups.png') });
  await page.reload();
  await page.locator('.setup-card.occupied').first().waitFor();
  assert.equal(await page.locator('[data-field="view"]').inputValue(), 'setups');
  assert.equal(await page.locator('[data-field="paused"]').isChecked(), true);
  mode = 'classic';
  const classic = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  classic.on('pageerror', error => errors.push(error.message));
  await classic.goto(base);
  await classic.locator('.match-card').first().waitFor();
  assert.equal(await classic.locator('.match-head span').first().textContent(), first.displayIdentifier);
  assert.equal(await classic.locator('.entrant').first().locator('img').count(), 2);
  await classic.waitForFunction(() => document.querySelector('.bracket-scale').style.width !== '');
  assert.equal(await classic.evaluate(() => document.querySelector('.bracket-viewport').scrollWidth > document.querySelector('.bracket-viewport').clientWidth + 2), false, 'Classic pages must fit horizontally');
  await classic.screenshot({ path: path.join(output, 'display-classic.png'), animations: 'disabled' });
  await classic.locator('.screen-controls summary').click();
  await classic.locator('[data-field="bracketSeconds"]').fill('5');
  await classic.locator('[data-field="bracketSeconds"]').press('Tab');
  first.status = 'COMPLETED'; first.winnerParticipantId = first.participants[0].participantId;
  first.participants[0].score = 2;
  await classic.locator('.result-card').waitFor({ timeout: 12000 });
  assert.equal(await classic.locator('.result-match-name').textContent(), first.displayIdentifier);
  assert.equal(await classic.locator('.result-stage').textContent(), first.roundLabel);
  assert.equal(await classic.locator('.player-character-icon').count(), 4);
  await classic.locator('.screen-controls summary').click();
  await classic.screenshot({ path: path.join(output, 'display-result.png'), animations: 'disabled' });
  await classic.setViewportSize({ width: 3840, height: 2160 });
  await classic.waitForFunction(() => document.querySelector('.result-card')?.getBoundingClientRect().width > 2000, null, { timeout: 5000 }).catch(async error => {
    console.log('Result resize state', await classic.evaluate(() => ({ scale: getComputedStyle(document.documentElement).getPropertyValue('--display-scale'), screen: document.querySelector('.screen')?.className, resultWidth: document.querySelector('.result-card')?.getBoundingClientRect().width, errors: document.querySelector('.display-connection')?.textContent })), errors);
    throw error;
  });
  assert.equal(await classic.locator('.result-match-name').textContent(), first.displayIdentifier);
  await classic.screenshot({ path: path.join(output, 'display-result-4k.png'), animations: 'disabled' });
  const admin = await browser.newPage();
  admin.on('pageerror', error => errors.push(error.message));
  await admin.addInitScript(() => localStorage.setItem('gt_display_admin_token', 'fake-token'));
  await admin.goto(base + '/admin/index.html');
  await admin.locator('#retry-load').waitFor();
  assert.equal(await admin.evaluate(() => localStorage.getItem('gt_display_admin_token')), 'fake-token');
  adminStatus = 401;
  await admin.locator('#retry-load').click();
  await admin.waitForFunction(() => localStorage.getItem('gt_display_admin_token') === null);
  mode = 'modern';
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(base);
  await mobile.waitForFunction(() => document.querySelector('.modern-bracket-canvas')?.style.width);
  assert.equal(await mobile.evaluate(() => document.querySelector('.bracket-viewport').scrollWidth > document.querySelector('.bracket-viewport').clientWidth + 2), false, 'Mobile layout must keep the names within the horizontal viewport');
  await mobile.screenshot({ path: path.join(output, 'display-mobile.png'), animations: 'disabled' });
  fixture.tournament.settings.bracketMode = 'MKART'; fixture.tournament.gameTitle = 'Mario Kart';
  await mobile.waitForFunction(() => document.querySelector('.modern-match-meta')?.textContent.includes('Heat de 2'));
  assert.deepEqual(errors, []);
  console.log('PASS: separated branches, team icons, 1080p/4K/8K/mobile, partial failure/timeout, offline recovery, literal names, canceled calls, setups, saved controls, classic/result labels, MKART and admin session');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
