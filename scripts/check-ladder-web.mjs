import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {displayFixture} from '../backend/tests/fixtures/display-fixtures.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fixture=displayFixture(32);fixture.tournament.importSource={provider:'START_GG',entrantSize:1};
fixture.participants=Array.from({length:32},(_,i)=>({id:'p'+i,displayName:`Jugador ${i+1} · Nombre de prueba largo`,status:'ACTIVE',checkedIn:true}));
fixture.ladder={session:{status:'ACTIVE',options:{revision:'revision-session',settings:{mode:'COMPETITIVE',bestOf:3,readySeconds:300,rematchWaitSeconds:180,minimumSets:3,requireConfirmation:true,setupNumbers:[3,4]}}},
 queue:fixture.participants.slice(20).map(p=>({participantId:p.id,displayName:p.displayName,waitingReason:'Esperando setup libre'})),
 activeMatches:Array.from({length:10},(_,i)=>({id:'l'+i,status:i===0?'DISPUTED':'PLAYING',bestOf:3,stationLabel:'Setup '+(i+1),participants:fixture.participants.slice(i*2,i*2+2).map((p,j)=>({participantId:p.id,displayName:p.displayName,score:j})),details:{revision:'r'+i}})),completedMatches:[],
 standings:fixture.participants.map((p,i)=>({...p,participantId:p.id,wins:10-i%7,losses:i%3,rating:1400-i*12,eligible:i<25,winRate:75})),activity:[]};
const posts=[],errors=[];
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;posts.push(JSON.parse(body));res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(fixture.ladder));}
  const data=url.pathname.endsWith('public-config')?{bracketRenderMode:'modern',themes:[],sponsors:[],displaySettings:{includeLadder:true}}
   :url.pathname.endsWith('/smash-characters')?[]:url.pathname.endsWith('/tournaments')?[fixture.tournament]:fixture;
  res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));
 }
 if(url.pathname==='/config.js'){res.setHeader('Content-Type','text/javascript');return res.end(`window.GTDisplayConfig={backendUrl:location.origin,appClientKey:'test',pollIntervalMs:1000,sponsorMax:0,themeManifestUrl:'./themes/themes.json'};`);}
 try {const filename=path.resolve('display-web','.'+(url.pathname==='/'?'/index.html':url.pathname==='/manage/'?'/manage/index.html':url.pathname));if(!filename.startsWith(path.resolve('display-web')+path.sep))throw Error();res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(filename)]||'application/octet-stream');res.end(await fs.readFile(filename));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
await fs.mkdir('build/ladder-review',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('main-display-screen-v1',JSON.stringify({view:'ladder',paused:true,showResults:false,showCalls:false}));localStorage.setItem('gt_manage_admin_token','fixture-token');});
 for(const [width,height] of [[1920,1080],[3840,2160],[7680,4320],[1080,1920]]){
  await page.setViewportSize({width,height});await page.goto(base);await page.locator('.scene-ladder').waitFor();
  const bounds=await page.locator('.ladder-display-list').evaluate(e=>({bottom:e.getBoundingClientRect().bottom,height:innerHeight,font:parseFloat(getComputedStyle(e.firstElementChild).fontSize),width:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert(bounds.bottom<=bounds.height,JSON.stringify(bounds));assert(bounds.width<=bounds.viewport,JSON.stringify(bounds));assert(bounds.font>=24,JSON.stringify(bounds));
  await page.screenshot({path:`build/ladder-review/ladder-${width}x${height}.png`});
 }
 const coverage=await page.evaluate(detail=>{const pages=window.GTLadderDisplay.scenes(detail,1080);return {sets:pages.filter(p=>p.kind==='matches').flatMap(p=>p.rows).length,standings:pages.filter(p=>p.kind==='standings').flatMap(p=>p.rows).length,queue:pages.filter(p=>p.kind==='queue').flatMap(p=>p.rows).length};},fixture);
 assert.deepEqual(coverage,{sets:10,standings:32,queue:12});
 const empty=await page.evaluate(detail=>window.GTLadderDisplay.scenes({...detail,ladder:{...detail.ladder,queue:[],activeMatches:[],completedMatches:[],standings:[]}},1080).length,fixture);assert.equal(empty,1);
 await page.locator('details.screen-controls').evaluate(e=>e.open=true);await page.locator('[data-field="view"]').selectOption('setups');await page.locator('.setup-grid').waitFor();assert((await page.locator('.setup-grid').innerText()).includes('Ladder'),'Occupied ladder stations must appear in setups');
 await page.setViewportSize({width:1280,height:900});await page.goto(base+'/manage/');await page.locator('#ladder-panel').waitFor();
 await page.locator('[data-ladder-action="PAUSE"]').click();await page.waitForFunction(()=>document.querySelector('#ladder-panel'));
 assert.equal(posts.at(-1).action,'PAUSE');assert.equal(posts.at(-1).expectedRevision,'revision-session');
 await page.getByText('Ajustes de ladder',{exact:true}).click();await page.locator('#ladder-settings [name="bestOf"]').selectOption('1');await page.locator('#ladder-settings button').click();
 await page.waitForTimeout(100);assert.equal(posts.at(-1).settings.bestOf,1);
 const set=page.locator('[data-ladder-match="l0"]');await set.locator('..').locator('summary').click();await set.locator('[name="reason"]').fill('Verificado con ambos');await set.locator('[name="score0"]').fill('2');await set.locator('[data-ladder-action="RESOLVE_RESULT"]').click();
 await page.waitForTimeout(100);assert.equal(posts.at(-1).expectedRevision,'r0');assert.equal(posts.at(-1).winnerParticipantId,'p0');
 await page.screenshot({path:'build/ladder-review/manage-ladder.png',fullPage:true});assert.deepEqual(errors,[]);console.log('Ladder display: 1080p/4K/8K/vertical, full pagination, management settings and result controls passed');
}finally{await browser.close();await new Promise(r=>server.close(r));}
