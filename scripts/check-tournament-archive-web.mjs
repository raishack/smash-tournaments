// Run from a variant root after npm run build:backend. Uses an isolated in-memory database.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve('package.json'));
const express=require('express');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {pathToFileURL}=await import('node:url');
const local=file=>import(pathToFileURL(path.resolve(file)).href);
const {fortniteFixture,report}=await local('backend/tests/fixtures/fortnite-fixture.mjs');
const {createTournamentRouter}=await local('backend/dist/modules/tournaments/tournaments.routes.js');
const {createFortniteRouters}=await local('backend/dist/modules/fortnite/fortnite.routes.js');
const {createTop8Routers}=await local('backend/dist/modules/top8/top8.routes.js');
const {RegistrationService}=await local('backend/dist/modules/registration/registration.service.js');
const {TeamsService}=await local('backend/dist/modules/teams/teams.service.js');
const {createRegistrationAdminRouters}=await local('backend/dist/modules/registration/registration-admin.routes.js');
const {ArchivedTournamentError}=await local('backend/dist/modules/tournaments/tournament-archive.js');
const cleanup=[],f=await fortniteFixture({after:fn=>cleanup.push(fn)},{count:5,size:5,games:1}),id=f.tournament.id;
let v=await f.action({action:'GENERATE'});v=await f.action(report(v.state.rounds[0].groups[0]));await f.action({action:'ADVANCE',revision:v.state.revision,acceptTies:true});
const header={Authorization:'Bearer fixture-manager','Content-Type':'application/json'};
const accounts={userFor:async token=>token==='fixture-manager'?{id:'test',role:'MANAGER'}:null};
const app=express();app.use(express.json({limit:'80mb'}));
app.use(async(req,res,next)=>{res.locals.managementUser=await accounts.userFor(req.header('Authorization')?.replace(/^Bearer /,''));next();});
const panels=createFortniteRouters(f.service,'https://example.test',accounts),top=createTop8Routers(f.tournaments,{isConfigured:()=>false},'https://example.test',f.repo,accounts);
const registration=new RegistrationService(f.repo,f.tournaments,{configured:true,async send(){}},'https://example.test');
const admin=createRegistrationAdminRouters(f.repo,registration,new TeamsService(f.repo,f.tournaments),'https://example.test',accounts);
app.use('/api/fortnite',panels.publicRouter);app.use('/api/tournaments/:tournamentId/fortnite',panels.protectedRouter);
app.use('/api/top8',top.publicRouter);app.use('/api/tournaments/:tournamentId/top8-session',top.protectedRouter);
app.use('/api/registration-admin',admin.publicRouter);app.use('/api/tournaments/:tournamentId/registration-admin',admin.protectedRouter);
app.use('/api/tournaments',createTournamentRouter(f.tournaments));
const manage=await fs.access('display-web/manage/manage.js').then(()=>true,()=>false);
if(manage){const {createManageRouter}=await local('backend/dist/modules/manage/manage.routes.js');app.use('/api/manage',createManageRouter(f.tournaments,undefined,{accounts}));}
app.get('/api/display-admin/public-config',(_req,res)=>res.json({bracketRenderMode:'modern',themes:[],sponsors:[]}));
app.get('/config.js',(_req,res)=>res.type('js').send("window.GTDisplayConfig={backendUrl:location.origin,appClientKey:'fixture',pollIntervalMs:200,rotationIntervalMs:500,sponsorMax:0,idleImageUrl:'/idle-placeholder.svg',themeManifestUrl:'/themes/themes.json'};"));
app.use(express.static(path.resolve('display-web')));
app.use((error,_req,res,_next)=>res.status(error instanceof ArchivedTournamentError?409:500).json({message:error.message}));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
const output=path.resolve(process.env.ARCHIVE_WEB_OUTPUT||'build/archive-web');await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});const errors=[];
const post=async(url,body)=>{const res=await fetch(base+url,{method:'POST',headers:header,body:JSON.stringify(body??{})});assert.equal(res.status,200,await res.clone().text());return res.json();};
const pageFor=async()=>{const p=await browser.newPage({viewport:{width:390,height:844}});p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p;};
const ticket=async suffix=>{const {url}=await post('/api/tournaments/'+id+'/'+suffix);const u=new URL(url);return base+u.pathname+u.search+u.hash;};
try{
 const display=await pageFor();await display.goto(base);await display.locator('.scene-fortnite').waitFor();
 const editor=await pageFor();await editor.goto(await ticket('top8-session'));await editor.locator('#editor').waitFor();
 await editor.getByText('Save and restore',{exact:true}).click();await editor.locator('#cloud-save').click();await editor.waitForFunction(()=>document.getElementById('status').textContent.includes('Design saved on the server'));
 const project=await f.repo.getTopProject(id);
 const registrationPage=await pageFor();await registrationPage.goto(await ticket('registration-admin/session'));await registrationPage.locator('#panel').waitFor();
 let manager;
 if(manage){manager=await pageFor();await manager.addInitScript(()=>localStorage.setItem('gt_manage_admin_token','fixture-manager'));await manager.goto(base+'/manage/');await manager.getByRole('button',{name:'Archive tournament',exact:true}).click();await manager.getByText('Archived · read-only. This tournament is hidden from the display.',{exact:true}).waitFor();}
 else await post('/api/tournaments/'+id+'/archive',{archived:true});
 await display.locator('.idle-screen').waitFor();assert.equal(await display.locator('.scene-fortnite').count(),0);
 await editor.locator('#title').fill('This change must be rejected');await editor.locator('#cloud-save').click();await editor.waitForFunction(()=>document.getElementById('status').textContent.includes('archived'));assert.deepEqual(await f.repo.getTopProject(id),project);
 await registrationPage.locator('#refresh').click();await registrationPage.getByText('Tournament archived · read-only',{exact:true}).waitFor();for(const control of ['save','toggle','deadline','waitlist'])assert.equal(await registrationPage.locator('#'+control).isDisabled(),true);
 const scores=await pageFor();await scores.goto(await ticket('fortnite/session'));await scores.locator('#panel').waitFor();assert.match(await scores.locator('#progress').innerText(),/archived.*read-only/);assert.equal(await scores.locator('#reopen').isVisible(),false);assert.equal(await scores.locator('#confirm').isDisabled(),true);await scores.screenshot({path:path.join(output,'fortnite-readonly.png'),fullPage:true});
 if(manager){
  await manager.getByRole('button',{name:'Back to list',exact:true}).click();assert.equal(await manager.locator('[data-open-tournament]').count(),0);
  await manager.getByRole('button',{name:'Archived',exact:true}).click();assert.equal(await manager.locator('[data-open-tournament]').count(),1);await manager.screenshot({path:path.join(output,'archive-list-mobile.png'),fullPage:true});
  await manager.locator('[data-open-tournament]').click();assert.equal(await manager.locator('[data-display-toggle]').count(),0);assert.equal(await manager.locator('[data-ladder-action]').count(),0);
  assert.equal(await manager.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await manager.screenshot({path:path.join(output,'archive-detail-mobile.png'),fullPage:true});
  await manager.setViewportSize({width:1440,height:1000});await manager.screenshot({path:path.join(output,'archive-detail-desktop.png'),fullPage:true});
  await manager.getByRole('button',{name:'Unarchive tournament',exact:true}).click();await manager.getByRole('button',{name:'Archive tournament',exact:true}).waitFor();
  // A resumed imported set must use its reported Bo1 instead of the original Bo5.
  const resumed=await f.tournaments.getTournamentOverview(id);
  resumed.tournament={...resumed.tournament,status:'IN_PROGRESS',gameTitle:'Test game',importSource:{provider:'START_GG'},settings:{...resumed.tournament.settings,bracketMode:'STANDARD'}};
  resumed.matches=[{id:'bo-check',bracketStage:'WINNERS',roundNumber:1,matchNumber:1,status:'PLAYING',bestOf:5,reportedBestOf:1,participants:f.participants.slice(0,2).map((p,i)=>({participantId:p.id,displayName:p.displayName,slot:i+1,score:0}))}];
  await manager.route('**/api/manage/tournaments/'+id,route=>route.fulfill({json:resumed}));
  await manager.reload();await manager.getByText('PLAYING · Bo1',{exact:true}).waitFor();
  await manager.locator('[data-quick-report]').click();assert.equal(await manager.locator('[data-score-option]').count(),2);
  assert.equal(await manager.locator('.game-row').count(),1);
 }else await post('/api/tournaments/'+id+'/archive',{archived:false});
 assert.equal((await f.repo.getTournament(id)).status,'COMPLETED');assert.equal((await f.repo.getTournament(id)).settings.displayEnabled,false);
 assert.deepEqual(errors,[]);console.log('PASS archive browser: display removal, stale Top8 save rejected, registration and Fortnite readonly, restore keeps display off'+(manage?', management lists/archive/restore on mobile and desktop':''));
}finally{await browser.close();await new Promise(r=>server.close(r));for(const fn of cleanup)await fn();}
