import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const output = path.resolve('build/registration-review'); await fs.mkdir(output, { recursive: true });
const info = { title: 'Torneo <b>Tournament Platform</b>', gameTitle: 'Tekken 8', platform: 'PC', startsAt: '2026-10-01T16:00:00Z', availablePlaces: 12, maxParticipants: 32, open: true };
let fail = false; let confirmation;let confirmed=false; const posts = []; const errors = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      if(url.pathname.endsWith('/confirm'))confirmed=true;
      posts.push({ path: url.pathname, body: JSON.parse(body), key: req.headers['x-app-key'] });
    }
    const data = fail ? { message: 'No se ha podido enviar el correo. Vuelve a intentarlo.' }
      : url.pathname.endsWith('/request') ? { message: 'Revisa tu correo para confirmar.' }
      : url.pathname.endsWith('/status') ? {confirmed,...(confirmed?(confirmation||{nickname:'<img src=x onerror=alert(1)>',title:info.title}):{})} : url.pathname.endsWith('/confirm') ? confirmation || { nickname: '<img src=x onerror=alert(1)>', title: info.title } : info;
    res.writeHead(fail ? 503 : 200, { 'Content-Type': 'application/json' }).end(JSON.stringify(data)); return;
  }
  try {
    const file = path.resolve('display-web', '.' + (url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    if (!file.startsWith(path.resolve('display-web') + path.sep)) throw Error('path');
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/register/?tournamentId=local`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.locator('#registration').waitFor();
  assert.equal(await page.locator('#tournament-title').textContent(), info.title);
  assert.equal(await page.locator('#tournament-title b').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, 'registration-mobile.png'), fullPage: true });
  await page.locator('#nickname').fill('Player Uno'); await page.locator('#email').fill('uno@example.test');
  fail = true; await page.locator('#registration button').click();
  await page.waitForFunction(() => document.querySelector('#message').textContent.includes('enviar el correo'));
  assert.equal(await page.locator('#nickname').inputValue(), 'Player Uno');
  assert.equal(await page.locator('#email').inputValue(), 'uno@example.test');
  fail = false; await page.locator('#registration button').click();
  await page.waitForFunction(() => document.querySelector('#message').textContent.includes('Revisa'));
  assert(posts.every(p => p.key === undefined));
  const before = posts.length;
  await page.goto(base + '#token=' + 'a'.repeat(64)); await page.locator('#verification').waitFor();
  assert.equal(posts.slice(before).filter(p=>p.path.endsWith('/confirm')).length, 0, 'opening a mail link must never confirm automatically');
  await page.locator('#confirm').click(); await page.locator('#success').waitFor();
  assert.equal(posts.at(-1).path, '/api/public-registration/status');
  assert.equal(await page.locator('#success img').count(), 0);
  assert.equal(new URL(page.url()).hash, '');
  await page.screenshot({ path: path.join(output, 'registration-confirmed.png'), fullPage: true });
  info.open = false; await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#availability').textContent.includes('cerradas'));
  assert.equal(await page.locator('#registration').isVisible(), false);
  info.open = true; info.availablePlaces = 0; await page.reload();
  await page.waitForFunction(() => document.querySelector('#availability').textContent.includes('completo'));
  assert.equal(await page.locator('#registration').isVisible(), false);
  info.availablePlaces = 12; await page.setViewportSize({ width: 1440, height: 1000 }); await page.reload();
  await page.locator('#registration').waitFor();
  await page.screenshot({ path: path.join(output, 'registration-desktop.png'), fullPage: true });
  Object.assign(info,{teamSize:5,reserveCount:2,allowSoloRegistration:true});
  await page.setViewportSize({width:390,height:844}); await page.reload();
  await page.locator('#team-fields').waitFor();
  await page.locator('#team-name').fill('Community Team');
  await page.locator('#nickname').fill('Captain'); await page.locator('#email').fill('captain@example.test');
  await page.locator('#registration button').click();
  await page.waitForFunction(() => document.querySelector('#message').textContent.includes('Revisa'));
  assert.equal(posts.at(-1).body.mode,'TEAM_CREATE'); assert.equal(posts.at(-1).body.teamName,'Community Team');
  assert.equal(posts.at(-1).body.teamCode,undefined);
  await page.screenshot({path:path.join(output,'teams-captain-mobile.png'),fullPage:true});
  await page.locator('#registration-mode').selectOption('TEAM_JOIN');
  assert.equal(await page.locator('#team-name').isVisible(),false);
  await page.locator('#team-code').fill('ABCD1234ABCD1234'); await page.locator('#team-role').selectOption('RESERVE');
  const beforeJoin = posts.length; await page.locator('#registration button').click();
  await page.waitForFunction(() => !document.querySelector('#registration button').disabled);
  assert.equal(posts.length,beforeJoin+1); assert.equal(posts.at(-1).body.role,'RESERVE');
  assert.equal(posts.at(-1).body.teamName,undefined);
  await page.locator('#registration-mode').selectOption('SOLO');
  assert.equal(await page.locator('#team-code').isVisible(),false);
  assert((await page.locator('#team-help').textContent()).includes('no garantiza'));
  await page.locator('#registration button').click();
  await page.waitForFunction(() => !document.querySelector('#registration button').disabled);
  assert.equal(posts.at(-1).body.mode,'SOLO'); assert.equal(posts.at(-1).body.teamCode,undefined);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  await page.screenshot({path:path.join(output,'teams-solo-mobile.png'),fullPage:true});
  info.availablePlaces = 0; info.allowSoloRegistration = false; info.reserveCount = 0;
  await page.reload(); await page.locator('#team-fields').waitFor();
  assert.equal(await page.locator('#registration').isVisible(),true);
  assert.equal(await page.locator('#registration-mode').inputValue(),'TEAM_JOIN');
  assert.equal(await page.locator('#solo-option').isDisabled(),true);
  assert.equal(await page.locator('#reserve-option').isDisabled(),true);
  confirmation = {kind:'TEAM_MEMBER',nickname:'Captain',title:info.title,teamName:'Community Team',role:'PLAYER',teamCode:'ABCD1234ABCD1234',waitingForTeam:false};
  confirmed=false;await page.goto(base+'#token='+'b'.repeat(64)); await page.locator('#confirm').click();
  await page.locator('#team-invite').waitFor(); assert.equal(await page.locator('#invite-code').textContent(),confirmation.teamCode);
  await page.screenshot({path:path.join(output,'teams-code-mobile.png'),fullPage:true});
  confirmation = {kind:'TEAM_MEMBER',nickname:'Solo Player',title:info.title,role:'PLAYER',waitingForTeam:true};
  confirmed=false;await page.goto(base+'#token='+'c'.repeat(64)); await page.locator('#confirm').click(); await page.locator('#success').waitFor();
  assert.equal(await page.locator('#team-invite').isVisible(),false);
  assert((await page.locator('#success-hint').textContent()).includes('lista sin equipo'));
  assert.deepEqual(errors, []);
  Object.assign(info,{teamSize:1,bracketMode:'FORTNITE',fortniteLobbySize:20,fortniteGamesPerRound:3,availablePlaces:12});
  await page.goto(base);await page.locator('#format-rules').waitFor();assert((await page.locator('#format-rules').textContent()).includes('3 partidas por ronda'));
  assert.equal(await page.locator('#team-fields').isVisible(),false);
  console.log('PASS registration: individual/team mobile and desktop, captain/join/reserve/solo, full teams, private codes, safe text, confirmation, closed/full states.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
