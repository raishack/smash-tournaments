import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { chromium } from 'playwright';

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'main-bracket-qa-'));
const browser = process.env.CHROME_PATH || chromium.executablePath();
function cluster(id, title) {
  const card = (round, n) => {
    const state = ['CALLED', 'PLAYING', 'COMPLETED', 'WALKOVER'][n % 4];
    const names = round ? ['Ganador de A1', 'Ganador de A2'] : ['Community Team | Equipo de Alejandro y María del Mar', 'Northern Lights | Equipo de Lucía y José Antonio'];
    return `<article class="match-card ${state.toLowerCase()}" data-match-id="${id}-${round}-${n}" data-match-index="${n}" data-round-index="${round}" data-source-match-ids="${round ? `${id}-${round - 1}-${n * 2},${id}-${round - 1}-${n * 2 + 1}` : ''}" data-connection-group="${id}">
      <div class="match-header"><span>${String.fromCharCode(65 + round)}${n + 1}</span><span class="status-pill">${state}</span></div>
      ${names.map((name,i) => `<div class="entrant-row ${n > 1 ? i ? 'loser' : 'winner' : ''}"><div class="entrant-main"><div class="entrant-name">${name}</div></div><div class="entrant-score ${n === 3 && i ? 'dq' : ''}">${n === 3 && i ? 'DQ' : i ? '1' : '2'}</div></div>`).join('')}
      <div class="match-footer">Bo3 · Setup ${n + 1}</div>
    </article>`;
  };
  return `<div class="bracket-cluster"><div class="cluster-title">${title}</div><div class="bracket-scroll"><div class="bracket-scale-wrap"><div class="bracket-canvas" data-section-id="${id}" data-round-count="3"><svg class="connector-layer"></svg>${[0, 1, 2].map(round => `<div class="round-column" data-round-index="${round}"><div class="round-title">${title} Round ${round + 1}</div>${Array.from({ length: 4 >> round }, (_, n) => card(round, n)).join('')}</div>`).join('')}</div></div></div></div>`;
}
const content = `<section id="bracket-final" class="bracket-section">${cluster('winners', 'Winners')}${cluster('losers', 'Losers')}</section>`;
const buttons = '<button class="section-tab" data-target="bracket-final">Bracket final</button>';
for (const [platform, source] of [
  ['ios-player', 'ios-player/TournamentPlayerIOS/AppViews.swift'],
  ['android', 'android/shared-bracket/src/main/kotlin/com/gestortorneos/bracket/ModernBracketBoard.kt'],
  ['ios', 'ios-manage/TournamentManagerIOS/TournamentDetailViews.swift'],
]) {
 for (const [theme, readingScale] of [['dark', 1], ['light', 1], ['dark', 1.3], ['light', 2]]) {
  const variant = `${platform}-${theme}-${readingScale}`;
  const text = fs.readFileSync(source, 'utf8');
  const start = text.toLowerCase().indexOf('<!doctype html>');
  let html = text.slice(start, text.indexOf('</html>', start) + 7)
    .replace(/\$\{\s*'\$'\s*\}/g, '$')
    .replaceAll('$sectionButtons', buttons).replaceAll('$sectionHtml', content).replaceAll('$emptyState', '')
    .replaceAll('\\(sectionButtons)', buttons).replaceAll('\\(sectionsHTML)', content)
    .replaceAll('\\(sectionsHtml)', content).replaceAll('\\(sectionHTML)', content).replaceAll('\\(emptyState)', '')
    .replaceAll('$appearanceClass', 'theme-' + theme).replaceAll('$readingScale', String(readingScale))
    .replaceAll('\\(appearanceClass)', 'theme-' + theme).replaceAll('\\(readingScale)', String(readingScale));
  html = html.replaceAll('$modernBracketSearchScript', fs.readFileSync('scripts/modern-bracket-search.js', 'utf8')).replaceAll('\\(modernBracketSearchScript)', fs.readFileSync('scripts/modern-bracket-search.js', 'utf8'));
  if (platform.startsWith('ios')) html = html.replaceAll('\\\\', '\\');
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1], { filename: platform });
  const key = platform === 'android' ? 'Experimental' : 'Modern';
  html = html.replace('</body>', `<pre id="qa-result">WAITING</pre><script>
    window.addEventListener('error', event => { document.querySelector('#qa-result').textContent = 'FAIL: ' + event.message; });
    setTimeout(() => {
      try {
        const name = document.querySelector('.entrant-name');
        if (Math.abs(parseFloat(getComputedStyle(name).fontSize) - 15 * ${readingScale}) > 0.1) throw Error('Reading scale did not reach bracket names');
        if (getComputedStyle(document.body).colorScheme !== '${theme}') throw Error('Bracket theme does not follow appearance');
        const viewport = document.querySelector('.bracket-scroll');
        for (const column of document.querySelectorAll('.round-column')) {
          const cards = [...column.querySelectorAll('.match-card')].map(c => c.getBoundingClientRect());
          if (cards.some((c, i) => i && c.top < cards[i - 1].bottom)) throw Error('Cards overlap with long names');
        }
        for (const node of document.querySelectorAll('.entrant-name')) {
          const box = node.getBoundingClientRect(), row = node.closest('.entrant-row').getBoundingClientRect();
          if (box.bottom > row.bottom + 1 || node.scrollHeight > node.clientHeight + 1) throw Error('Participant name clipped');
        }
        if ('${theme}' === 'light') {
          const pill = document.querySelector('.match-card.called .status-pill');
          if (getComputedStyle(pill).color !== 'rgb(128, 84, 0)') throw Error('Called status unreadable in light theme');
        }
        const canvases = [...document.querySelectorAll('.bracket-canvas')];
        if (document.querySelectorAll('.bracket-scroll').length !== 1) throw Error('Expected one viewport');
        if (canvases.length !== 2 || !canvases.every(c => c.closest('.bracket-scroll') === viewport)) throw Error('Separated viewports');
        if (canvases[1].getBoundingClientRect().top <= canvases[0].getBoundingClientRect().top) throw Error('Losers must be below winners');
        viewport.scrollLeft = 100; viewport.scrollTop = 80;
        const before = canvases.map(c => c.getBoundingClientRect().left);
        viewport.scrollLeft += 40;
        const delta = canvases.map((c, i) => c.getBoundingClientRect().left - before[i]);
        if (Math.abs(delta[0] - delta[1]) > 1) throw Error('Winners and losers do not move together');
        const capture = JSON.parse(window.__gtt${key}BracketCaptureState());
        const entries = capture.sections || capture.clusters;
        if (!entries?.length) throw Error('Viewport state not captured');
        entries.forEach(entry => entry.zoom = 1.2);
        window.__gtt${key}BracketRestoreState(capture);
        setTimeout(() => {
          try {
            if (canvases.some(c => c.style.transform !== 'scale(1.2)')) throw Error('Zoom not shared/restored: ' + canvases.map(c => c.style.transform).join(', '));
            viewport.scrollLeft = 0;
            const positions = canvases.map(c => c.getBoundingClientRect().left);
            viewport.scrollLeft = 60;
            const movement = canvases.map((c, i) => c.getBoundingClientRect().left - positions[i]);
            if (Math.abs(movement[0]) < 1 || Math.abs(movement[0] - movement[1]) > 1) throw Error('Shared horizontal pan did not move both brackets');
            const touch = (type, distance) => {
              const event = new Event(type, {bubbles: true, cancelable: true});
              Object.defineProperty(event, 'touches', {value: [{clientX: 0, clientY: 0}, {clientX: distance, clientY: 0}]});
              viewport.dispatchEvent(event);
            };
            touch('touchstart', 100); touch('touchmove', 110);
            if (canvases[0].style.transform !== canvases[1].style.transform || canvases[0].style.transform === 'scale(1.2)') throw Error('Pinch zoom did not update both brackets');
            const paths = document.querySelectorAll('.connector-path');
            if (!paths.length || [...paths].some(p => /NaN|undefined/.test(p.getAttribute('d')))) throw Error('Invalid connectors');
            document.querySelector('#qa-result').textContent = 'PASS: shared pan, zoom, restoration and connectors';
          } catch(error) { document.querySelector('#qa-result').textContent = 'FAIL: ' + error.message; }
        }, 300);
      } catch(error) { document.querySelector('#qa-result').textContent = 'FAIL: ' + error.message; }
    }, 300);
  </script></body>`);
  const file = path.join(output, variant + '.html');
  fs.writeFileSync(file, html);
  const profile = path.join(output, variant + '-profile');
  const process = spawn(browser, ['--headless', '--disable-gpu', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1024,900', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for(let i = 0; i < 200 && !fs.existsSync(portFile); i++) await delay(50);
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const target = targets.find(item => item.type === 'page');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 0; const requests = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) { const pending = requests.get(message.id); requests.delete(message.id); message.error ? pending.reject(message.error) : pending.resolve(message.result); }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; requests.set(id, {resolve,reject}); socket.send(JSON.stringify({id,method,params})); });
    await send('Page.enable');
    await send('Page.navigate', {url: pathToFileURL(file).href});
    let outcome;
    for(let attempt = 0; attempt < 30; attempt++) {
      await delay(100);
      const result = await send('Runtime.evaluate', {expression: 'document.querySelector("#qa-result")?.textContent', returnByValue: true});
      outcome = result.result.value;
      if (outcome && outcome !== 'WAITING') break;
    }
    if (outcome?.startsWith('PASS:')) {
      const captureExpression = `({state: JSON.parse(window.__gtt${key}BracketCaptureState()), height: document.querySelector('.bracket-scroll').clientHeight})`;
      const before = (await send('Runtime.evaluate', {expression: captureExpression, returnByValue: true})).result.value;
      await send('Emulation.setDeviceMetricsOverride', {width: 1024, height: 1400, deviceScaleFactor: 1, mobile: false});
      await delay(200);
      const expanded = (await send('Runtime.evaluate', {expression: captureExpression, returnByValue: true})).result.value;
      if (expanded.height < before.height + 200) throw Error(platform + ': fullscreen viewport did not expand');
      const beforeState = before.state.sections || before.state.clusters;
      const expandedState = expanded.state.sections || expanded.state.clusters;
      if (Math.abs(beforeState[0].zoom - expandedState[0].zoom) > 0.001 || Math.abs(beforeState[0].scrollLeft - expandedState[0].scrollLeft) > 1) throw Error(platform + ': expanding lost zoom/pan');
      await send('Emulation.setDeviceMetricsOverride', {width: 1024, height: 900, deviceScaleFactor: 1, mobile: false});
      await delay(200);
      const restored = (await send('Runtime.evaluate', {expression: captureExpression, returnByValue: true})).result.value;
      const restoredState = restored.state.sections || restored.state.clusters;
      if (Math.abs(beforeState[0].zoom - restoredState[0].zoom) > 0.001 || Math.abs(beforeState[0].scrollLeft - restoredState[0].scrollLeft) > 1) throw Error(platform + ': exiting lost zoom/pan');
      outcome += '; fullscreen size and return preserve viewport';
    }
    await send('Runtime.evaluate', {expression: `const state = JSON.parse(window.__gtt${key}BracketCaptureState()); (state.sections || state.clusters).forEach(s => {s.zoom=1; s.scrollLeft=0; s.scrollTop=0;}); window.__gtt${key}BracketRestoreState(state);`});
    await delay(200);
    const screenshot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(output, variant + '.png'), Buffer.from(screenshot.data, 'base64'));
    console.log(variant, outcome || 'No browser result');
    if (!outcome?.startsWith('PASS:')) globalThis.process.exitCode = 1;
  } finally {
    socket?.close();
    process.kill();
  }
 }
}
console.log('QA artifacts:', output);
