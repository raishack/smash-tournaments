import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const output=path.resolve('build/bracket-search-review');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
const ios=['ios-manage-main/GestorTorneosMainIOS','ios-manage/GestorTorneosSmashIOS','ios-manage/TournamentManagerIOS'].find(p=>fs.existsSync(p));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function cluster(id,title){return `<div class="bracket-cluster"><div class="cluster-title">${title}</div><div class="bracket-scroll"><div class="bracket-scale-wrap"><div class="bracket-canvas" data-section-id="${id}" data-round-count="3"><svg class="connector-layer"></svg>${[0,1,2].map(r=>`<div class="round-column" data-round-index="${r}"><div class="round-title">${title} ${r+1}</div>${Array.from({length:8>>r},(_,i)=>{
const name=i===0&&r===2?'Equipo Álex <script>':'Jugador '+i;
return `<article class="match-card" data-match-id="${id}-${r}-${i}" data-match-index="${i}" data-round-index="${r}" data-connection-group="${id}" data-search-names="${esc(name)}"><div class="match-header"><span>${id}-${r}-${i}</span></div><div class="entrant-row"><div class="entrant-main"><div class="entrant-name">${esc(name)}</div></div><div class="entrant-score">0</div></div></article>`;
}).join('')}</div>`).join('')}</div></div></div></div>`;}
const content=['pools','final'].map(phase=>`<section id="${phase}" class="bracket-section"><h2 class="section-title">${phase}</h2>${cluster(phase+'-winners','Winners')}${cluster(phase+'-losers','Losers')}</section>`).join('');
const buttons=['pools','final'].map(p=>`<button class="section-tab" data-target="${p}">${p}</button>`).join('');
try {for(const [platform,file,key]of [['android','android/shared-bracket/src/main/kotlin/com/gestortorneos/bracket/ModernBracketBoard.kt','Experimental'],['ios',ios+'/TournamentDetailViews.swift','Modern'],['ios-player','ios-player/TournamentPlayerIOS/AppViews.swift','Modern']]) {
 for(const [theme,scale]of [['dark',1],['light',1.3]]) {
  const source=fs.readFileSync(file,'utf8'),start=source.toLowerCase().indexOf('<!doctype html>');
  let html=source.slice(start,source.indexOf('</html>',start)+7).replace(/\$\{\s*'\$'\s*\}/g,'$');
  for(const [token,value]of [['sectionButtons',buttons],['sectionHtml',content],['sectionsHTML',content],['sectionsHtml',content],['sectionHTML',content],['emptyState',''],['appearanceClass','theme-'+theme],['readingScale',String(scale)],['modernBracketSearchScript',fs.readFileSync('scripts/modern-bracket-search.js','utf8')]]) {
   html=html.replaceAll('$'+token,value).replaceAll('\\('+token+')',value);
  }
  if(platform.startsWith('ios'))html=html.replaceAll('\\\\','\\');
  const page=await browser.newPage({viewport:{width:700,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(html);await page.locator('.bracket-search input').fill('  equipo alex ');
  await page.waitForFunction(()=>document.querySelector('.search-current')?.dataset.matchId==='pools-winners-2-0');
  assert.equal(await page.locator('.search-hit').count(),4);
  await page.getByRole('button',{name:'Siguiente',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.search-current')?.dataset.matchId==='pools-losers-2-0');
  await page.waitForFunction(()=>document.querySelector('#pools .unified-viewport').scrollTop>0);
  await page.getByRole('button',{name:'Siguiente',exact:true}).click();
  assert.equal(await page.locator('.bracket-section.active').getAttribute('id'),'final');
  await page.locator('.bracket-search input').press('Shift+Enter');
  assert.equal(await page.locator('.bracket-section.active').getAttribute('id'),'pools');
  await page.waitForTimeout(100);
  const snapshot=await page.evaluate(key=>{
   const v=document.querySelector('.bracket-section.active .unified-viewport');v.scrollLeft=25;v.scrollTop=35;
   return JSON.parse(window['__gtt'+key+'BracketCaptureState']());
  },key);
  await page.setContent(html);
  await page.evaluate(({key,snapshot})=>window['__gtt'+key+'BracketRestoreState'](snapshot),{key,snapshot});
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.bracket-search input').inputValue(),'  equipo alex ');
  assert.equal(await page.locator('.search-current').getAttribute('data-match-id'),'pools-losers-2-0');
  assert.equal(await page.evaluate(()=>document.querySelector('#pools .unified-viewport').scrollTop),35);
  await page.setViewportSize({width:1300,height:900});await page.waitForTimeout(80);
  assert.equal(await page.locator('.search-hit').count(),4);
  await page.screenshot({path:path.join(output,`${platform}-${theme}.png`)});
  await page.locator('.bracket-search input').fill('missing');
  assert.match(await page.locator('.bracket-search output').textContent(),/Sin coincidencias/);
  await page.getByRole('button',{name:'Siguiente',exact:true}).isDisabled().then(assert.ok);
  await page.locator('.bracket-search input').fill('<script>');assert.equal(await page.locator('.search-hit').count(),4);
  await page.locator('.bracket-search input').press('Escape');assert.equal(await page.locator('.search-hit').count(),0);
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${platform} ${theme}: accents, teams, phases, losers, next/previous, restore, resize, empty and literal HTML search`);
 }
}}finally{await browser.close();}
