import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {fortniteFixture} from './fixtures/fortnite-fixture.mjs';
import {RegistrationService} from '../dist/modules/registration/registration.service.js';
import {createRegistrationOptionsRouter} from '../dist/modules/registration/registration.routes.js';
import {createRegistrationAdminRouters} from '../dist/modules/registration/registration-admin.routes.js';
import {TeamsService} from '../dist/modules/teams/teams.service.js';
import {createManageRouter} from '../dist/modules/manage/manage.routes.js';

test('Web management: only a validated session can change public options or obtain a scoped registration ticket',async t=>{
  const f=await fortniteFixture(t,{count:2,size:5,games:1});
  const mailer={configured:true,async send(){throw Error('No email expected');}};
  const registration=new RegistrationService(f.repo,f.tournaments,mailer,'https://example.test');
  const panels=createRegistrationAdminRouters(f.repo,registration,new TeamsService(f.repo,f.tournaments),'https://example.test');
  const app=express();app.use(express.json());
  app.use('/api/manage',createManageRouter(f.tournaments,undefined,{accounts:{async userFor(token){return token==='valid-test-session'?{id:'fixture',role:'MANAGER'}:null;}}},[
    ['/tournaments/:tournamentId/public-options',createRegistrationOptionsRouter(registration)],
    ['/tournaments/:tournamentId/registration-admin',panels.protectedRouter],
  ]));
  app.use('/api/registration-admin',panels.publicRouter);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const url='http://127.0.0.1:'+server.address().port;
  const post=(route,body={},token)=>fetch(url+route,{method:'POST',headers:{'content-type':'application/json','x-management-authorized':'true',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  const base='/api/manage/tournaments/'+f.tournament.id;
  assert.equal((await post(base+'/public-options',{displayEnabled:false})).status,401);
  assert.equal((await post(base+'/registration-admin/session',{},'invalid')).status,401);
  assert.equal((await post(base+'/public-options',{displayEnabled:false},'valid-test-session')).status,200);
  assert.equal((await f.repo.getTournament(f.tournament.id)).settings.displayEnabled,false);
  const ticket=await post(base+'/registration-admin/session',{},'valid-test-session');assert.equal(ticket.status,200);
  const token=new URLSearchParams(new URL((await ticket.json()).url).hash.slice(1)).get('session');
  const exchanged=await post('/api/registration-admin/session',{token});assert.equal(exchanged.status,200);
  assert.equal((await post('/api/registration-admin/session',{token})).status,410);
});
