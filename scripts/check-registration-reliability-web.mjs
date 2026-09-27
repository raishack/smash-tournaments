// Uses an isolated database and simulated mail, never external services.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import {createRequire} from 'node:module';
import {fortniteFixture} from '../backend/tests/fixtures/fortnite-fixture.mjs';
import {RegistrationService} from '../backend/dist/modules/registration/registration.service.js';
import {createRegistrationRouter} from '../backend/dist/modules/registration/registration.routes.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const cleanup=[],f=await fortniteFixture({after:fn=>cleanup.push(fn)},{count:2}),id=f.tournament.id;
await f.repo.replaceParticipants(id,[]);
await f.repo.saveTournament({...f.tournament,title:'Prueba de inscripción',settings:{...f.tournament.settings,bracketMode:'STANDARD'}});
const messages=[],service=new RegistrationService(f.repo,f.tournaments,{configured:true,async send(_email,_title,url){messages.push(url);}},'https://example.test');
await service.request(id,{nickname:'Original nick',email:'test@example.test'},'127.0.0.1');
const token=new URLSearchParams(new URL(messages[0]).hash.slice(1)).get('token');
const app=express();app.use(express.json());app.use('/api/public-registration',createRegistrationRouter(service));app.use(express.static(path.resolve('display-web')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
const output=path.resolve(process.env.REGISTRATION_REVIEW_OUTPUT||'build/registration-reliability-web');await fs.mkdir(output,{recursive:true});
const checks=[],errors=[];
async function check(name,fn){try{await fn();checks.push({name,ok:true});}catch(e){checks.push({name,ok:false,error:e.message});}console.log(JSON.stringify(checks.at(-1)));}
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 const url=base+'/register/?tournamentId='+id+'#token='+token;
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/status')),page.goto(url)]);await page.locator('#confirm').waitFor();
 await page.route('**/api/public-registration/status',route=>route.fulfill({status:503,json:{message:'Fallo temporal al consultar'}}),{times:1});
 await page.locator('#confirm').click();await page.locator('#message').waitFor();
 await check('successful confirmation remains visible when status refresh fails',async()=>{
  assert.equal((await f.repo.listParticipants(id)).length,1);
  assert.equal(await page.locator('#success').isVisible(),true);
  assert.equal(await page.locator('#confirm').isVisible(),false);
  assert.equal(await page.locator('#retry').isVisible(),true);
  await page.screenshot({path:path.join(output,'saved-with-refresh-error.png'),fullPage:true});
  await page.locator('#retry').click();await page.locator('#cancel').waitFor();
  assert.equal((await f.repo.listParticipants(id)).length,1);
 });
 const p=(await f.repo.listParticipants(id))[0];await f.tournaments.updateParticipant(id,p.id,{displayName:'Corrected nick'});
 await page.goto('about:blank');await page.goto(url);await page.locator('#success').waitFor();
 await check('public page uses the organiser-corrected nickname',async()=>assert.match(await page.locator('#success-text').innerText(),/^Corrected nick/));
 const invalid=await browser.newPage({viewport:{width:390,height:844}});invalid.on('pageerror',e=>errors.push(e.message));
 await invalid.goto(base+'/register/?tournamentId='+id+'#token='+'a'.repeat(64));await invalid.locator('#message').waitFor();
 await check('expired or invalid links cannot offer confirmation',async()=>{
  assert.match(await invalid.locator('#message').innerText(),/caducado/);
  assert.equal(await invalid.locator('#confirm').isVisible(),false);
  await invalid.screenshot({path:path.join(output,'expired-link.png'),fullPage:true});
 });
 const delayed=await browser.newPage({viewport:{width:390,height:844}});
 const pendingUrl=base+'/register/?tournamentId='+id+'#token='+token;
 let release,seen;const held=new Promise(r=>release=r),received=new Promise(r=>seen=r);
 await delayed.route('**/api/public-registration/status',async route=>{seen();await held;await route.continue();},{times:1});
 await delayed.goto(pendingUrl,{waitUntil:'domcontentloaded'});await received;
 try {await check('confirmation stays hidden until token status is checked',async()=>assert.equal(await delayed.locator('#confirm').isVisible(),false));}finally{release();}
 await delayed.locator('#success').waitFor();
 assert.deepEqual(errors,[]);console.log(JSON.stringify(checks,null,2));assert(checks.every(c=>c.ok),'Registration browser checks failed');
}finally{await browser.close();await new Promise(r=>server.close(r));for(const fn of cleanup)await fn();}
