import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import {createRequire} from 'node:module';
import {fortniteFixture} from '../backend/tests/fixtures/fortnite-fixture.mjs';
import {RegistrationService} from '../backend/dist/modules/registration/registration.service.js';
import {createRegistrationRouter} from '../backend/dist/modules/registration/registration.routes.js';
import {createRegistrationAdminRouters} from '../backend/dist/modules/registration/registration-admin.routes.js';
import {TeamsService} from '../backend/dist/modules/teams/teams.service.js';
import {createTop8Routers} from '../backend/dist/modules/top8/top8.routes.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const cleanup=[],f=await fortniteFixture({after:fn=>cleanup.push(fn)},{count:2,size:5,games:1}),id=f.tournament.id;
await f.repo.replaceParticipants(id,[]);await f.repo.saveTournament({...f.tournament,title:'Tournament Platform · Liga de equipos',gameTitle:'Valorant',settings:{...f.tournament.settings,bracketMode:'STANDARD',teamSize:2,reserveCount:1,allowSoloRegistration:true,registrationWaitlist:true}});
const messages=[],mailer={configured:true,async send(email,title,url,notice){messages.push({email,title,url,notice});}};
const registration=new RegistrationService(f.repo,f.tournaments,mailer,'https://your-domain.example'),teams=new TeamsService(f.repo,f.tournaments);
const oldKey=process.env.ADMIN_DELETE_KEY;process.env.ADMIN_DELETE_KEY='test-only';
const admin=createRegistrationAdminRouters(f.repo,registration,teams,'https://your-domain.example'),top=createTop8Routers(f.tournaments,{isConfigured:()=>false},'https://your-domain.example',f.repo);
const app=express();app.use(express.json({limit:'80mb'}));app.use((req,res,next)=>{if(req.header('Authorization')==='Bearer test-only')res.locals.managementUser={id:'test',role:'MANAGER'};next();});app.use('/api/public-registration',createRegistrationRouter(registration));app.use('/api/registration-admin',admin.publicRouter);app.use('/api/tournaments/:tournamentId/registration-admin',admin.protectedRouter);app.use('/api/top8',top.publicRouter);app.use('/api/tournaments/:tournamentId/top8-session',top.protectedRouter);app.use(express.static(path.resolve('display-web')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,output=path.resolve('build/new-flows-review');await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'/register/?tournamentId='+id);await page.locator('#registration').waitFor();
  await page.locator('#team-name').fill('Community Team');await page.locator('#nickname').fill('Capitán Uno');await page.locator('#email').fill('captain@example.test');await page.locator('#game-id').fill('Captain#Tournament Platform');await page.locator('#preferred-role').fill('Soporte');await page.locator('#registration button').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('correo'));
  const token=new URLSearchParams(new URL(messages.at(-1).url).hash.slice(1)).get('token');await page.goto(base+'/register/?tournamentId='+id+'#token='+token);await page.locator('#confirm').click();await page.locator('#team-invite').waitFor();const code=await page.locator('#invite-code').textContent();
  const signup=async(nick,mode)=>{await registration.request(id,{nickname:nick,email:nick+'@example.test',mode,teamCode:mode==='TEAM_JOIN'?code:undefined},'127.0.0.1');const tok=new URLSearchParams(new URL(messages.at(-1).url).hash.slice(1)).get('token');return registration.confirm(tok);};
  await signup('Mate','TEAM_JOIN');await signup('Solo','SOLO');let roster=await teams.overview(id),solo=roster.unassigned[0];await teams.action(id,{action:'MOVE_MEMBER',id:solo.id,revision:solo.revision,teamId:roster.teams[0].id,role:'RESERVE'});
  const ticket=await(await fetch(base+'/api/tournaments/'+id+'/registration-admin/session',{method:'POST',headers:{Authorization:'Bearer test-only'}})).json();await page.goto(base+'/registration-admin/?tournamentId='+id+new URL(ticket.url).hash);await page.locator('#panel').waitFor();
  await page.locator('#deadline').fill('2027-10-01T12:30');await page.locator('#waitlist').check();await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('message').textContent.includes('Guardado'));
  assert.equal((await f.repo.getTournament(id)).settings.registrationWaitlist,true);
  // Failed saves, refresh and team actions must keep the option draft and expanded team.
  await page.locator('#deadline').fill('2027-11-02T13:45');
  await page.route('**/api/registration-admin/options',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Fallo temporal de prueba'})}),{times:1});
  await page.locator('#save').click();await page.getByText('Fallo temporal de prueba',{exact:true}).waitFor();
  assert.equal(await page.locator('#deadline').inputValue(),'2027-11-02T13:45');
  assert.equal(await page.locator('#options-note').isVisible(),true);
  await page.locator('#rosters summary').click();await page.getByRole('button',{name:'Confirmar asistencia',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#rosters summary').textContent.includes('Asistencia confirmada'));
  assert.equal(await page.locator('#rosters details').evaluate(e=>e.open),true);
  assert.equal(await page.locator('#deadline').inputValue(),'2027-11-02T13:45');
  await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('message').textContent==='Datos actualizados.');
  assert.equal(await page.locator('#deadline').inputValue(),'2027-11-02T13:45');
  await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('options-note').hidden);

  await page.getByRole('button',{name:'Realizar sustitución',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#rosters').textContent.includes('Solo · Titular'));
  assert.equal(await page.locator('#rosters details').evaluate(e=>e.open),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(output,'admin-mobile.png'),fullPage:true});
  await registration.maintenance();assert(messages.some(m=>m.notice?.includes('asignación')));
  // Recovery is available even after closing; it loads status without adding a participant.
  await registration.updateOptions(id,{registrationEnabled:false});const record=await f.repo.registrationByEmail(id,'captain@example.test');await f.repo.saveRegistration({...record,sentAt:new Date(Date.now()-120000).toISOString()});await registration.recover(id,'captain@example.test','127.0.0.1');await registration.maintenance();
  const recovered=new URLSearchParams(new URL(messages.at(-1).url).hash.slice(1)).get('token');await page.goto(base+'/register/?tournamentId='+id+'#token='+recovered);await page.locator('#success').waitFor();assert.equal(await page.locator('#confirm').isVisible(),false);await page.screenshot({path:path.join(output,'registration-status-mobile.png'),fullPage:true});
  // Team poster uses the real roster; cloud projects can be continued in another browser context.
  await f.repo.saveTournament({...await f.repo.getTournament(id),status:'COMPLETED'});
  const topTicket=async()=>new URL((await(await fetch(base+'/api/tournaments/'+id+'/top8-session',{method:'POST'})).json()).url).hash;
  await page.goto(base+'/top8/?tournamentId='+id+await topTicket());await page.locator('#editor').waitFor();assert.equal(await page.locator('#layout').inputValue(),'teams');assert((await page.getByLabel('Plantilla (separar con ·)').inputValue()).includes('Solo'));
  await page.getByLabel('Puesto',{exact:true}).fill('1');await page.locator('#title').fill('Ganadores · diseño compartido');await page.locator('#backgroundColor').fill('#224466');await page.locator('summary').filter({hasText:'Guardar y recuperar'}).click();await page.locator('#cloud-save').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Diseño guardado en el servidor'));
  const page2=await browser.newPage({viewport:{width:1600,height:1100},acceptDownloads:true});page2.on('pageerror',e=>errors.push(e.message));page2.on('dialog',d=>d.accept());await page2.goto(base+'/top8/?tournamentId='+id+await topTicket());await page2.locator('#restore-draft').click();await page2.locator('#editor').waitFor();assert.equal(await page2.locator('#title').inputValue(),'Ganadores · diseño compartido');assert.equal(await page2.locator('#backgroundColor').inputValue(),'#224466');
  await page2.locator('summary').filter({hasText:'Guardar y recuperar'}).click();await page2.locator('#refresh-results').click();await page2.waitForFunction(()=>!document.getElementById('refresh-results').disabled);assert.equal(await page2.locator('#title').inputValue(),'Ganadores · diseño compartido');assert.equal(await page2.locator('#backgroundColor').inputValue(),'#224466');
  // Official placement is intentionally unknown for a fixture with no matches; editor keeps manual correction possible.
  await page2.getByLabel('Puesto',{exact:true}).fill('1');await page2.screenshot({path:path.join(output,'teams-top-desktop.png'),fullPage:true});
  const download=page2.waitForEvent('download');await page2.locator('#export').click();const file=await download;await file.saveAs(path.join(output,'team-top-4k.png'));
  // Reload keeps the saved revision; a concurrent editor must still get a conflict.
  await page2.locator('#cloud-save').click();await page2.waitForFunction(()=>document.getElementById('status').textContent.includes('Diseño guardado en el servidor'));
  await page2.reload();await page2.locator('#editor').waitFor();
  await page2.locator('#title').fill('Recargado sin perder revisión');
  await page2.getByText('Guardar y recuperar',{exact:true}).click();
  await page2.locator('#cloud-save').click();await page2.waitForFunction(()=>document.getElementById('status').textContent.includes('Diseño guardado en el servidor'));
  await page.locator('#cloud-save').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Otro'));
  assert.equal((await f.repo.getTopProject(id)).project.design.title,'Recargado sin perder revisión');
  // Saving an earlier snapshot must not claim edits made in flight were saved too.
  let releaseSave, saveSeen;const heldSave=new Promise(r=>releaseSave=r),seenSave=new Promise(r=>saveSeen=r);
  await page2.route('**/api/top8/project',async route=>{if(route.request().method()!=='POST')return route.continue();const response=await route.fetch();saveSeen();await heldSave;await route.fulfill({response});},{times:1});
  await page2.locator('#title').fill('Versión enviada');await page2.locator('#cloud-save').click();await seenSave;
  await page2.locator('#title').fill('Edición durante el guardado');releaseSave();
  await page2.waitForFunction(()=>document.getElementById('status').textContent.includes('cambios posteriores'));
  assert.equal((await f.repo.getTopProject(id)).project.design.title,'Versión enviada');
  assert.equal(await page2.locator('#title').inputValue(),'Edición durante el guardado');
  await page2.locator('#cloud-save').click();await page2.waitForFunction(()=>document.getElementById('status').textContent.includes('Diseño guardado en el servidor'));
  assert.equal((await f.repo.getTopProject(id)).project.design.title,'Edición durante el guardado');
  // Slow loads and result refreshes must not overwrite edits made after confirmation.
  for(const [endpoint,control] of [['project','cloud-load'],['data','refresh-results']]){
    let releaseLoad,loadSeen;
    const hold=new Promise(resolve=>releaseLoad=resolve),seen=new Promise(resolve=>loadSeen=resolve);
    await page2.route('**/api/top8/'+endpoint,async route=>{
      const response=await route.fetch();loadSeen();await hold;await route.fulfill({response});
    },{times:1});
    await page2.locator('#'+control).click();await seen;
    await page2.getByLabel('Nombre',{exact:true}).fill('Edición mientras carga '+endpoint);
    releaseLoad();await page2.waitForFunction(()=>!document.getElementById('cloud-load').disabled);
    assert.equal(await page2.getByLabel('Nombre',{exact:true}).inputValue(),'Edición mientras carga '+endpoint);
    assert.match(await page2.locator('#status').innerText(),/Has editado el diseño/);
    // Explicit retry without new edits still performs the requested load.
    await page2.locator('#'+control).click();await page2.waitForFunction(()=>!document.getElementById('cloud-load').disabled);
    assert.equal(await page2.getByLabel('Nombre',{exact:true}).inputValue(),'Community Team');
  }
  // A failed cloud draft request must still leave the fresh results editable.
  const fallback=await browser.newPage({viewport:{width:390,height:844}});fallback.on('pageerror',e=>errors.push(e.message));
  await fallback.route('**/api/top8/project',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await fallback.goto(base+'/top8/?tournamentId='+id+await topTicket());await fallback.locator('#editor').waitFor();
  await fallback.waitForFunction(()=>document.getElementById('status').textContent.includes('No se pudo recuperar'));
  assert.equal(await fallback.locator('#title').isEnabled(),true);await fallback.close();
  // A captain removed by the organiser must not see a false confirmation.
  const withdrawn=(await f.repo.listRegistrations(id)).find(r=>r.email==='captain@example.test');
  await f.repo.deleteTeamMember(id,withdrawn.memberId);
  await page.goto(base+'/register/?tournamentId='+id+'#token='+recovered);
  await page.getByText('Inscripción retirada por la organización',{exact:true}).waitFor();
  assert.equal(await page.locator('#confirm').isVisible(),false);assert.equal(await page.locator('#cancel').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('PASS new flows: real backend + mobile registration, recovery, admin deadlines/check-in/substitution, team poster, cross-device cloud save and 4K PNG.');
}finally{await browser.close();await new Promise(r=>server.close(r));for(const fn of cleanup)await fn();if(oldKey===undefined)delete process.env.ADMIN_DELETE_KEY;else process.env.ADMIN_DELETE_KEY=oldKey;}
