import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createTop8Routers } from '../dist/modules/top8/top8.routes.js';
import { createFortniteRouters } from '../dist/modules/fortnite/fortnite.routes.js';
import { createRegistrationAdminRouters } from '../dist/modules/registration/registration-admin.routes.js';

const tournament={id:'local',title:'Test',gameTitle:'Local',status:'COMPLETED',startsAt:'2026-09-25',settings:{format:'SINGLE_ELIMINATION'}};
for(const panel of ['top8','fortnite','registration'])test(`${panel}: a ticket can only be exchanged once, including concurrent requests`,async t=>{
  let validations=0,release;
  const bothValidating=new Promise(resolve=>{release=resolve;});
  // Hold authentication until both requests have read the same one-use ticket.
  const accounts={async userFor(){validations++;if(validations===2)release();await bothValidating;return {id:'manager',role:'MANAGER'};}};
  let routers,issuePath='/session';
  if(panel==='top8'){
    routers=createTop8Routers({getTournamentOverview:async()=>({tournament,participants:[],matches:[]})},{isConfigured:()=>false},'https://example.test',undefined,accounts);
    issuePath='/';
  }else if(panel==='fortnite')routers=createFortniteRouters({overview:async()=>({})},'https://example.test',accounts);
  else routers=createRegistrationAdminRouters({getTournament:async()=>tournament,listRegistrations:async()=>[]},{publicInfo:async()=>({open:false,canOpen:false})},{},'https://example.test',accounts);
  const app=express();app.use(express.json());
  app.use('/t/:tournamentId',(_req,res,next)=>{res.locals.managementUser={id:'manager',role:'MANAGER'};next();},routers.protectedRouter);
  app.use('/panel',routers.publicRouter);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const issued=await fetch(base+'/t/local'+issuePath,{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(64)}});
  assert.equal(issued.status,200);
  const token=new URLSearchParams(new URL((await issued.json()).url).hash.slice(1)).get('session');
  const exchange=()=>fetch(base+'/panel/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
  const responses=await Promise.all([exchange(),exchange()]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,410]);
});
