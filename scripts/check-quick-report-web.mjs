// Run from a variant root after building its backend. No external services are used.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import {createRequire} from 'node:module';
import {fortniteFixture} from '../backend/tests/fixtures/fortnite-fixture.mjs';
import {createManageRouter} from '../backend/dist/modules/manage/manage.routes.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const cleanup=[],f=await fortniteFixture({after:fn=>cleanup.push(fn)},{count:2,size:5,games:1}),id=f.tournament.id,now=new Date().toISOString();
await f.repo.saveTournament({...f.tournament,title:'Prueba de reporte',gameTitle:'Tekken 8',status:'IN_PROGRESS',importSource:{provider:'START_GG',syncResults:false},settings:{...f.tournament.settings,bracketMode:'STANDARD',bestOf:5}});
await f.repo.replaceMatches(id,[{id:'set-1',tournamentId:id,bracketStage:'WINNERS',roundNumber:1,matchNumber:1,bestOf:5,reportedBestOf:1,status:'PLAYING',advancersRequired:1,
 participants:f.participants.map((p,i)=>({id:'slot-'+i,participantId:p.id,displayName:p.displayName,slot:i+1,score:0})),createdAt:now,updatedAt:now}]);
const app=express();app.use(express.json());
app.use('/api/manage',createManageRouter(f.tournaments,undefined,{accounts:{userFor:async token=>token==='fixture'?{id:'user',role:'MANAGER'}:null}}));
app.get('/config.js',(_req,res)=>res.type('js').send('window.GTDisplayConfig={backendUrl:location.origin};'));
app.use(express.static(path.resolve('display-web')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
const output=path.resolve(process.env.REVIEW_WEB_OUTPUT||'build/quick-report-review');await fs.mkdir(output,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('gt_manage_admin_token','fixture'));await page.goto(base+'/manage/');
 await page.getByText('PLAYING · Bo1',{exact:true}).waitFor();await page.locator('[data-quick-report]').click();
 await page.locator('[data-score-option]').last().click();
 const endpoint='**/api/manage/tournaments/'+id+'/matches/set-1/result-detailed';
 await page.route(endpoint,route=>route.fulfill({status:503,json:{message:'Fallo temporal de prueba'}}),{times:1});
 await page.locator('[data-submit-quick-report]').click();await page.getByText('Fallo temporal de prueba',{exact:true}).first().waitFor();
 assert.equal(await page.locator('[data-submit-quick-report]').count(),1,'A failed request must keep the editor open');
 assert.equal(await page.locator('[data-score-option].selected').getAttribute('data-score-option'),f.participants[1].id+':1-0');
 assert.equal(await page.locator('.modal .game-row').count(),1);
 await page.screenshot({path:path.join(output,'retry-mobile.png'),fullPage:true});
 let release,seen;const held=new Promise(r=>release=r),received=new Promise(r=>seen=r);let writes=0;
 await page.route(endpoint,async route=>{writes++;seen();await held;await route.continue();},{times:1});
 await page.locator('[data-submit-quick-report]').click();await received;
 assert.equal(await page.locator('[data-submit-quick-report]').isDisabled(),true);
 assert.equal(await page.locator('[data-game-winner]').first().isDisabled(),true);
 release();await page.locator('[data-submit-quick-report]').waitFor({state:'detached'});
 assert.equal(writes,1);const saved=(await f.repo.listMatches(id))[0];assert.equal(saved.winnerParticipantId,f.participants[1].id);assert.equal(saved.reportedBestOf,1);
 assert.deepEqual(saved.participants.map(p=>p.score),[0,1]);assert.deepEqual(errors,[]);
 console.log('PASS quick report: Bo1 correction persisted, failed save keeps draft, retry submits once, no page errors');
}finally{await browser.close();await new Promise(r=>server.close(r));for(const fn of cleanup)await fn();}
