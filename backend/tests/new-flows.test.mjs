import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {fortniteFixture,report} from './fixtures/fortnite-fixture.mjs';
import {RegistrationService} from '../dist/modules/registration/registration.service.js';
import {TeamsService} from '../dist/modules/teams/teams.service.js';
import {createTop8Routers} from '../dist/modules/top8/top8.routes.js';
import {createRegistrationAdminRouters} from '../dist/modules/registration/registration-admin.routes.js';

test('Fortnite VIP is external: 100 participants plus VIP, full kill cap, no VIP entry or ranking',async t=>{
  const f=await fortniteFixture(t,{count:100,size:100,games:1});let v=await f.action({action:'GENERATE'});
  const g=v.state.rounds[0].groups[0],input=report(g);input.vipName='Invitado';input.rows[0].kills=100;input.rows[0].vipKill=true;
  v=await f.action(input);assert.equal(v.participants.length,100);assert.equal(v.summary.rounds[0].groups[0].standings.length,100);assert.equal(v.summary.rounds[0].groups[0].standings[0].points,115);
  const invalid={...input,revision:v.state.rounds[0].groups[0].games[0].revision,rows:input.rows.map(r=>({...r,vipKill:false}))};await assert.rejects(f.action(invalid),/[Kk]ills/);
  v=await f.action({action:'ADVANCE',revision:v.state.revision});assert.equal(v.tournament.status,'COMPLETED');
});
test('Fortnite respects check-in/DQ, tracks DNS and allows audited annul and reopen only before next round starts',async t=>{
  const f=await fortniteFixture(t,{count:12,size:5,games:1});await f.repo.saveTournament({...f.tournament,settings:{...f.tournament.settings,checkInRequired:true}});
  await f.repo.replaceParticipants(f.tournament.id,f.participants.map((p,i)=>({...p,checkedIn:i!==1,status:i===0?'DISQUALIFIED':'ACTIVE'})));
  let v=await f.action({action:'GENERATE'});assert.equal(v.state.rounds[0].groups.flatMap(g=>g.slots).length,10);
  for(const group of v.state.rounds[0].groups){const input=report(group);input.rows.at(-1).absent=true;v=await f.action(input);}
  assert.equal(v.summary.rounds[0].groups[0].standings.at(-1).excluded,'DNS');
  v=await f.action({action:'ADVANCE',revision:v.state.revision,acceptTies:true});assert.equal(v.state.rounds.length,2);
  v=await f.action({action:'REOPEN',revision:v.state.revision,reason:'Correct result'});assert.equal(v.state.rounds.length,1);assert.equal(v.state.rounds[0].closed,false);
  let g=v.state.rounds[0].groups[0];v=await f.action({action:'ANNUL',revision:g.games[0].revision,groupId:g.id,gameNumber:1,reason:'Repetir por caída'});assert(v.summary.rounds[0].groups[0].standings.every(r=>r.points===0));
  g=v.state.rounds[0].groups[0];v=await f.action(report(g));v=await f.action({action:'ADVANCE',revision:v.state.revision,acceptTies:true});g=v.state.rounds[1].groups[0];
  v=await f.action({action:'START',revision:g.games[0].revision,groupId:g.id,gameNumber:1,vipName:'Invitado'});
  await assert.rejects(f.action({action:'REOPEN',revision:v.state.revision,reason:'Ya empezó'}),/before starting/);
  assert((await f.repo.listActivity(f.tournament.id)).some(a=>a.action==='fortniteANNUL'&&a.before.state&&a.after.reason));
});
test('Fortnite withdrawals/DQ do not qualify and cut ties require explicit acknowledgement',async t=>{
  const f=await fortniteFixture(t,{count:11,size:5,games:1});let v=await f.action({action:'GENERATE'});
  const g=v.state.rounds[0].groups[0],id=g.slots[0].participantId;
  v=await f.action({action:'EXCLUDE',revision:v.state.revision,participantId:id,status:'DQ',reason:'Regla incumplida'});
  for(const group of v.state.rounds[0].groups)v=await f.action(report(group));
  assert.equal(v.summary.rounds[0].groups[0].standings.find(r=>r.participantId===id).qualifies,false);
  v=await f.action({action:'ADVANCE',revision:v.state.revision,acceptTies:true});assert(!v.state.rounds[1].groups.flatMap(g=>g.slots).some(s=>s.participantId===id));
  assert.equal((await f.repo.listParticipants(f.tournament.id)).find(p=>p.id===id).status,'DISQUALIFIED');
});

test('Fortnite exact tie at the qualifying boundary cannot be closed without acknowledgement',async t=>{
  const f=await fortniteFixture(t,{count:11,size:5,games:2});let v=await f.action({action:'GENERATE'});
  for(const original of v.state.rounds[0].groups)for(let n=1;n<=2;n++){
    const group=v.state.rounds[0].groups.find(g=>g.id===original.id),input=report(group,n);
    if(n===2){input.rows[0].placement=2;input.rows[1].placement=1;}
    v=await f.action(input);
  }
  assert(v.summary.rounds[0].groups.some(g=>g.standings.some(r=>r.cutTie)));
  await assert.rejects(f.action({action:'ADVANCE',revision:v.state.revision}),/tie/);
  v=await f.action({action:'ADVANCE',revision:v.state.revision,acceptTies:true});assert.equal(v.state.rounds.length,2);
});

async function registrationFixture(t,settings={},capacity=2){
  const f=await fortniteFixture(t,{count:capacity,size:5,games:1});await f.repo.replaceParticipants(f.tournament.id,[]);
  f.tournament={...f.tournament,settings:{...f.tournament.settings,bracketMode:'STANDARD',registrationWaitlist:true,...settings}};await f.repo.saveTournament(f.tournament);
  const messages=[],mailer={configured:true,async send(email,title,url,notice){messages.push({email,title,url,notice});}};
  const registration=new RegistrationService(f.repo,f.tournaments,mailer,'https://your-domain.example'),teams=new TeamsService(f.repo,f.tournaments);
  let seq=0;
  async function signup(name,extra={}){const email='p'+(++seq)+'@example.test';await registration.request(f.tournament.id,{nickname:name,email,...extra},'127.0.0.1');return {email,token:new URLSearchParams(new URL(messages.at(-1).url).hash.slice(1)).get('token')};}
  return {...f,messages,registration,teams,signup};
}

test('Registration status reflects organiser removal for individuals and team members',async t=>{
  const f=await registrationFixture(t),entry=await f.signup('Removed player');
  await f.registration.confirm(entry.token);
  const record=await f.repo.registrationByEmail(f.tournament.id,entry.email);
  await f.tournaments.deleteParticipant(f.tournament.id,record.participantId);
  const status=await f.registration.status(entry.token);
  assert.equal(status.removed,true);assert.equal(status.confirmed,false);assert.equal(status.canCancel,false);
  await f.repo.saveTournament({...await f.repo.getTournament(f.tournament.id),settings:{...f.tournament.settings,teamSize:2,reserveCount:1,allowSoloRegistration:true}});
  const solo=await f.signup('Removed solo',{mode:'SOLO'});await f.registration.confirm(solo.token);
  const member=(await f.teams.overview(f.tournament.id)).unassigned[0];
  await f.teams.action(f.tournament.id,{action:'REMOVE_MEMBER',id:member.id,revision:member.revision});
  const teamStatus=await f.registration.status(solo.token);
  assert.equal(teamStatus.removed,true);assert.equal(teamStatus.confirmed,false);assert.equal(teamStatus.canCancel,false);
});

test('Expired registration quotas use the same seconds as real signup and recovery requests',async t=>{
  const f=await registrationFixture(t),now=Date.now();
  await f.repo.consumeRegistrationLimit('old-audit',Math.floor(now/1000)-2*86400);
  await f.repo.consumeRegistrationLimit('current-audit',Math.floor(now/3600000)*3600);
  await f.signup('Quota player');
  await f.repo.cleanExpiredRegistrations();
  const rows=(await f.db.query('select key from registration_request_limits')).rows.map(r=>r.key);
  assert(!rows.includes('old-audit'));assert(rows.includes('current-audit'));
  assert.equal(rows.length,4,'the three real signup quotas survive housekeeping');
});

test('Scheduled registration closing is reflected in app responses before the maintenance worker runs',async t=>{
  const f=await registrationFixture(t);
  await f.repo.saveTournament({...f.tournament,settings:{...f.tournament.settings,registrationClosesAt:new Date(Date.now()-1000).toISOString()}});
  assert.equal((await f.registration.publicInfo(f.tournament.id)).open,false);
  assert.equal((await f.tournaments.getTournamentOverview(f.tournament.id)).tournament.settings.registrationEnabled,false);
  assert.equal((await f.repo.getTournament(f.tournament.id)).settings.registrationEnabled,true);
});

test('Waiting promotion errors do not prevent queued registration notices from being delivered',async t=>{
  const f=await registrationFixture(t),id=f.tournament.id;
  await f.repo.enqueueRegistrationMail(id,'audit-mail','audit@example.test','Aviso','https://your-domain.example/register/','Aviso de prueba');
  const original=f.repo.withTournamentTransaction.bind(f.repo);
  f.repo.withTournamentTransaction=async()=>{throw Error('Simulated tournament failure');};
  await f.registration.maintenance();
  f.repo.withTournamentTransaction=original;
  assert(f.messages.some(m=>m.email==='audit@example.test'));
});
test('Registration waiting list, cancellation and promotion are persistent and emails are queued outside mutations',async t=>{
  const f=await registrationFixture(t,{},2),id=f.tournament.id;
  const a=await f.signup('First'),b=await f.signup('Second'),c=await f.signup('Third');
  await f.registration.confirm(a.token);await f.registration.confirm(b.token);assert.equal((await f.registration.confirm(c.token)).waiting,true);
  assert.equal((await f.repo.listParticipants(id)).length,2);assert.equal((await f.registration.status(c.token)).waiting,true);
  await f.registration.cancel(a.token);assert.equal((await f.registration.status(a.token)).cancelled,true);
  await f.registration.maintenance();assert.equal((await f.registration.status(c.token)).waiting,false);assert.equal((await f.repo.listParticipants(id)).length,2);assert(f.messages.some(m=>m.notice?.includes('You already have a place')));
  await f.registration.maintenance();assert.equal((await f.repo.listParticipants(id)).length,2);
});
test('Registration recovery works after closing without disclosing emails; deadlines close admissions even before worker runs',async t=>{
  const f=await registrationFixture(t),a=await f.signup('First');await f.registration.confirm(a.token);
  const record=await f.repo.registrationByEmail(f.tournament.id,a.email);await f.repo.saveRegistration({...record,sentAt:new Date(Date.now()-120000).toISOString()});
  await f.registration.updateOptions(f.tournament.id,{registrationClosesAt:new Date(Date.now()-1000).toISOString()});
  assert.equal((await f.registration.publicInfo(f.tournament.id)).open,false);await assert.rejects(f.signup('Late'),/closed/);
  await f.registration.recover(f.tournament.id,a.email,'127.0.0.1');await f.registration.maintenance();
  const token=new URLSearchParams(new URL(f.messages.at(-1).url).hash.slice(1)).get('token');assert.equal((await f.registration.status(token)).confirmed,true);await assert.rejects(f.registration.status(a.token),/expired/);
  assert.equal((await f.repo.getTournament(f.tournament.id)).settings.registrationEnabled,false);
  assert(!JSON.stringify(await f.registration.publicInfo(f.tournament.id)).includes(a.email));
});

test('Waiting players keep priority over a new confirmation when a place becomes free',async t=>{
  const f=await registrationFixture(t,{},2),a=await f.signup('First'),b=await f.signup('Second'),c=await f.signup('Waiting'),d=await f.signup('Newcomer');
  await f.registration.confirm(a.token);await f.registration.confirm(b.token);await f.registration.confirm(c.token);
  await f.registration.cancel(a.token);assert.equal((await f.registration.confirm(d.token)).waiting,true);
  assert.equal((await f.registration.status(c.token)).waiting,false);
});
test('Teams: captain/code rotation, substitution after bracket, metadata and assignment mail',async t=>{
  const f=await registrationFixture(t,{teamSize:2,reserveCount:1,allowSoloRegistration:true},4),id=f.tournament.id;
  const captain=await f.signup('Captain',{mode:'TEAM_CREATE',teamName:'Blue'});const receipt=await f.registration.confirm(captain.token);
  const mate=await f.signup('Mate',{mode:'TEAM_JOIN',teamCode:receipt.teamCode});await f.registration.confirm(mate.token);
  const solo=await f.signup('Solo',{mode:'SOLO',gameId:'Solo#123',preferredRole:'Soporte'});await f.registration.confirm(solo.token);
  let roster=await f.teams.overview(id),m=roster.unassigned[0],team=roster.teams[0];assert.equal(m.meta.gameId,'Solo#123');
  roster=await f.teams.action(id,{action:'MOVE_MEMBER',id:m.id,revision:m.revision,teamId:team.id,role:'RESERVE'});
  await f.registration.maintenance();assert(f.messages.some(m=>m.notice?.includes('Blue')));
  await f.teams.action(id,{action:'ROTATE_CODE',teamId:team.id,code:team.code});assert.equal(await f.repo.findTeamByCode(id,team.code),undefined);
  await f.repo.saveTournament({...await f.repo.getTournament(id),status:'IN_PROGRESS'});
  team=(await f.teams.overview(id)).teams[0];const starter=team.members.find(m=>m.role==='PLAYER'),reserve=team.members.find(m=>m.role==='RESERVE');
  const input={action:'SUBSTITUTE',starterId:starter.id,reserveId:reserve.id,starterRevision:starter.revision,reserveRevision:reserve.revision};
  roster=await f.teams.action(id,input);assert.equal(roster.teams[0].members.find(m=>m.id===reserve.id).role,'PLAYER');await assert.rejects(f.teams.action(id,input),/changed/);
  assert.equal(roster.teams[0].members.filter(m=>m.role==='PLAYER').length,2);
});

test('Top projects: server persistence, optimistic conflict protection, actual Top 5 and scoped access',async t=>{
  const f=await fortniteFixture(t,{count:5,size:5,games:1});let v=await f.action({action:'GENERATE'});v=await f.action(report(v.state.rounds[0].groups[0]));await f.action({action:'ADVANCE',revision:v.state.revision});
  const routes=createTop8Routers(f.tournaments,{isConfigured:()=>false},'https://your-domain.example',f.repo),app=express();app.use(express.json());app.use((req,res,next)=>{if(['Bearer test-registration-admin','Bearer admin-fixture'].includes(req.header('Authorization')))res.locals.managementUser={id:'fixture',role:'MANAGER'};next();});app.use('/api/top8',routes.publicRouter);app.use('/api/tournaments/:tournamentId/top8-session',routes.protectedRouter);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
  const post=(path,body,token)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  const ticket=await(await post('/api/tournaments/'+f.tournament.id+'/top8-session',{})).json();const data=await(await post('/api/top8/session',{token:new URLSearchParams(new URL(ticket.url).hash.slice(1)).get('session')})).json();assert.equal(data.topCount,5);assert.match(data.warnings[0],/Top 5/);
  assert.equal((await fetch(base+'/api/top8/project')).status,401);
  const design={title:'Top 5',subtitle:'',footer:'',layout:'grid',ratio:'wide',font:'sans-serif',game:'custom',nameSize:38,shade:30,backgroundColor:'#111111',cardColor:'#222222',textColor:'#ffffff',accentColor:'#ffcc00',background:'',logo:'',players:[]};
  assert.equal((await post('/api/top8/project',{revision:0,design},data.accessToken)).status,200);
  assert.equal((await post('/api/top8/project',{revision:0,design},data.accessToken)).status,409);
  const saved=await(await fetch(base+'/api/top8/project',{headers:{Authorization:'Bearer '+data.accessToken}})).json();assert.equal(saved.revision,1);assert.equal(saved.project.design.title,'Top 5');assert(!JSON.stringify(saved).includes(data.accessToken));
});

test('Registration admin tickets require admin credentials and all subsequent actions require the scoped bearer',async t=>{
  const f=await registrationFixture(t),old=process.env.ADMIN_DELETE_KEY;process.env.ADMIN_DELETE_KEY='admin-fixture';t.after(()=>{if(old===undefined)delete process.env.ADMIN_DELETE_KEY;else process.env.ADMIN_DELETE_KEY=old;});
  const routes=createRegistrationAdminRouters(f.repo,f.registration,f.teams,'https://your-domain.example'),app=express();app.use(express.json());app.use((req,res,next)=>{if(['Bearer test-registration-admin','Bearer admin-fixture'].includes(req.header('Authorization')))res.locals.managementUser={id:'fixture',role:'MANAGER'};next();});app.use('/api/registration-admin',routes.publicRouter);app.use('/api/tournaments/:tournamentId/registration-admin',routes.protectedRouter);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
  const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),path='/api/tournaments/'+f.tournament.id+'/registration-admin/session';
  assert.equal((await post(path,{})).status,403);const ticket=await(await post(path,{}, {Authorization:'Bearer admin-fixture'})).json();const token=new URLSearchParams(new URL(ticket.url).hash.slice(1)).get('session');
  const access=await(await post('/api/registration-admin/session',{token})).json();assert.equal((await post('/api/registration-admin/session',{token})).status,410);
  assert.equal((await post('/api/registration-admin/options',{registrationEnabled:false})).status,401);
  const headers={Authorization:'Bearer '+access.token};assert.equal((await post('/api/registration-admin/options',{registrationEnabled:false},headers)).status,200);
  assert.equal((await post('/api/registration-admin/options',{tournamentId:'other',registrationEnabled:false},headers)).status,400);
  assert.equal((await f.repo.getTournament(f.tournament.id)).settings.registrationEnabled,false);
});

test('Registration admin shows deadline closure immediately and blocks reopening after start',async t=>{
  const f=await registrationFixture(t),old=process.env.ADMIN_DELETE_KEY;process.env.ADMIN_DELETE_KEY='admin-fixture';t.after(()=>{if(old===undefined)delete process.env.ADMIN_DELETE_KEY;else process.env.ADMIN_DELETE_KEY=old;});
  await f.repo.saveTournament({...f.tournament,settings:{...f.tournament.settings,registrationClosesAt:new Date(Date.now()-1000).toISOString()}});
  const routes=createRegistrationAdminRouters(f.repo,f.registration,f.teams,'https://your-domain.example'),app=express();app.use(express.json());app.use((req,res,next)=>{if(['Bearer test-registration-admin','Bearer admin-fixture'].includes(req.header('Authorization')))res.locals.managementUser={id:'fixture',role:'MANAGER'};next();});app.use('/admin',routes.publicRouter);app.use('/t/:tournamentId',routes.protectedRouter);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
  const ticket=await(await fetch(base+'/t/'+f.tournament.id+'/session',{method:'POST',headers:{Authorization:'Bearer admin-fixture'}})).json();
  const token=new URLSearchParams(new URL(ticket.url).hash.slice(1)).get('session');
  const session=await(await fetch(base+'/admin/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})})).json();
  const view=()=>fetch(base+'/admin/view',{headers:{Authorization:'Bearer '+session.token}}).then(r=>r.json());
  assert.equal((await view()).settings.registrationEnabled,false);assert.equal((await view()).canOpen,true);
  await f.repo.saveTournament({...f.tournament,status:'IN_PROGRESS'});
  assert.equal((await view()).canOpen,false);
});
