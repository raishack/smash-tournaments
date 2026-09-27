import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { ManagementAuthStore } from '../dist/modules/management-auth/management-auth.store.js';
import { createManagementAuthRouter, requireManagement } from '../dist/modules/management-auth/management-auth.routes.js';
import { createTop8Routers } from '../dist/modules/top8/top8.routes.js';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'management-auth-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ManagementAuthStore(directory);
  await store.initialize({ username: 'old-display', passwordHash: createHash('sha256').update('test-password-owner').digest('hex') }, 'raishack');
  const app = express(); app.use(express.json()); app.use('/api/management-auth', createManagementAuthRouter(store));
  app.post('/mutation', requireManagement(store), (_req, res) => res.json({ ok: true }));
  const top = createTop8Routers({ getTournamentOverview: async () => ({ tournament: { id:'test', title:'Test', gameTitle:'Smash', status:'COMPLETED', settings:{format:'SINGLE_ELIMINATION'}, startsAt:'2026-09-25' }, participants:[], matches:[] }) }, {isConfigured:()=>false}, 'https://example.test', undefined, store);
  app.use('/t/:tournamentId/top8', requireManagement(store), top.protectedRouter); app.use('/top8', top.publicRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening',r));
  t.after(() => new Promise(r => server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(route, method='GET', body, token='') => fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  const login=async(username='raishack',password='test-password-owner') => {const r=await request('/api/management-auth/login','POST',{username,password});assert.equal(r.status,200);return r.json();};
  return {store,request,login,directory};
}
test('management: migrates the display password, creates raishack, hashes sessions and preserves them across restarts',async t=>{
  const f=await fixture(t),session=await f.login();assert.equal(session.user.username,'raishack');assert.equal(session.user.role,'SUPER_ADMIN');
  const text=await fs.readFile(f.store.file,'utf8');assert(!text.includes(session.token));assert(!text.includes('test-password-owner'));assert.match(text,/scrypt:/);
  const reopened=new ManagementAuthStore(f.directory);await reopened.initialize(undefined,'other');assert.deepEqual(await reopened.userFor(session.token),session.user);
  const denied=await f.request('/mutation','POST',{});assert.equal(denied.status,401);assert.equal((await f.request('/mutation','POST',{},session.token)).status,200);
  const clock=Date.now;Date.now=()=>clock()+31*86400000;try{assert.equal(await reopened.userFor(session.token),null);}finally{Date.now=clock;}
});
test('management: manager can operate but cannot create, delete or reset accounts; deleted sessions and delegated editors stop working',async t=>{
  const f=await fixture(t),owner=await f.login();
  const created=await f.request('/api/management-auth/users','POST',{username:'staff',password:'staff-test-password'},owner.token);assert.equal(created.status,201);const staff=await created.json();
  const session=await f.login('staff','staff-test-password');assert.equal(session.user.role,'MANAGER');assert.equal((await f.request('/mutation','POST',{},session.token)).status,200);
  for(const [url,method,body] of [['users','GET'],['users','POST',{username:'attacker',password:'invalid-password'}],['users/'+owner.user.id,'DELETE'],['users/'+owner.user.id+'/password','POST',{password:'invalid-password'}]])assert.equal((await f.request('/api/management-auth/'+url,method,body,session.token)).status,403);
  const ticket=await(await f.request('/t/test/top8','POST',{},session.token)).json();const token=new URLSearchParams(new URL(ticket.url).hash.slice(1)).get('session');
  const editor=await(await f.request('/top8/session','POST',{token})).json();assert(editor.accessToken);
  assert.equal((await f.request('/api/management-auth/users/'+staff.id,'DELETE',undefined,owner.token)).status,200);
  assert.equal((await f.request('/mutation','POST',{},session.token)).status,401);assert.equal((await f.request('/top8/data','GET',undefined,editor.accessToken)).status,401);
  assert.equal((await f.request('/api/management-auth/users/'+owner.user.id,'DELETE',undefined,owner.token)).status,409);
});
test('management: logout, password changes, duplicate users and strict roles',async t=>{
  const f=await fixture(t),a=await f.login(),b=await f.login();assert.notEqual(a.token,b.token);
  await f.request('/api/management-auth/logout','POST',{},a.token);assert.equal(await f.store.userFor(a.token),null);assert(await f.store.userFor(b.token));
  assert.equal((await f.request('/api/management-auth/users','POST',{username:'RAISHACK',password:'new-test-password'},b.token)).status,409);
  assert.equal((await f.request('/api/management-auth/users','POST',{username:'staff',password:'new-test-password',role:'SUPER_ADMIN'},b.token)).status,400);
  assert.equal((await f.request('/api/management-auth/password','POST',{currentPassword:'wrong',password:'new-test-password'},b.token)).status,400);
  assert.equal((await f.request('/api/management-auth/me','GET',undefined,b.token)).status,200);
  assert.equal((await f.request('/api/management-auth/password','POST',{currentPassword:'test-password-owner',password:'new-test-password'},b.token)).status,200);
  assert.equal(await f.store.userFor(b.token),null);await f.login('raishack','new-test-password');
});
test('management: login is rate limited and fresh installations have no default admin password',async t=>{
  const f=await fixture(t);
  for(let i=0;i<15;i++)assert.equal((await f.request('/api/management-auth/login','POST',{username:'missing',password:'wrong'})).status,401);
  assert.equal((await f.request('/api/management-auth/login','POST',{username:'raishack',password:'test-password-owner'})).status,429);
  const empty=new ManagementAuthStore(path.join(f.directory,'fresh'));await empty.initialize({username:'admin',passwordHash:createHash('sha256').update('admin').digest('hex')});
  await assert.rejects(()=>empty.login('admin','admin'));assert.equal((await empty.listUsers())[0].role,'SUPER_ADMIN');
  const previous=process.env.MANAGEMENT_BOOTSTRAP_PASSWORD;
  try {
    process.env.MANAGEMENT_BOOTSTRAP_PASSWORD='initial-owner-password';
    await empty.initialize();await empty.login('admin','initial-owner-password');
    process.env.MANAGEMENT_BOOTSTRAP_PASSWORD='different-owner-password';
    await empty.initialize();await empty.login('admin','initial-owner-password');
    await assert.rejects(()=>empty.login('admin','different-owner-password'));
  } finally { if(previous===undefined)delete process.env.MANAGEMENT_BOOTSTRAP_PASSWORD;else process.env.MANAGEMENT_BOOTSTRAP_PASSWORD=previous; }
});
