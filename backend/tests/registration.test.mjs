import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import { TournamentsPostgresRepository } from '../dist/modules/tournaments/tournaments.postgres-repository.js';
import { TournamentsService } from '../dist/modules/tournaments/tournaments.service.js';
import { RegistrationService } from '../dist/modules/registration/registration.service.js';
import { createRegistrationRouter, createRegistrationOptionsRouter } from '../dist/modules/registration/registration.routes.js';

test('registration: confirmed links use the current name after an organiser correction', async t => {
  const f = await fixture(t);
  await f.service.updateOptions('local', { registrationEnabled: true });
  await f.request('Original nickname');
  const token = f.token(); await f.service.confirm(token);
  const participant = (await f.repo.listParticipants('local'))[0];
  await f.tournaments.updateParticipant('local', participant.id, { displayName: 'Corrected nickname' });
  assert.equal((await f.service.status(token)).nickname, 'Corrected nickname');
  assert.equal((await f.service.confirm(token)).nickname, 'Corrected nickname');
  assert.equal((await f.repo.listParticipants('local')).length, 1);
  await f.tournaments.deleteParticipant('local', participant.id);
  assert.equal((await f.service.status(token)).removed, true);
  await assert.rejects(f.service.confirm(token), /retirado/);
});

async function fixture(t) {
  const db = await PGlite.create(); t.after(() => db.close());
  await db.exec(await readFile(new URL('../../infra/postgres/init/001_schema.sql', import.meta.url), 'utf8'));
  let tail = Promise.resolve();
  const pool = {
    async connect() {
      const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous;
      return { release, query: async (sql, args = []) => args.length ? db.query(sql, args) : (await db.exec(sql)).at(-1) ?? { rows: [] } };
    },
    async query(sql, args) { const c = await this.connect(); try { return await c.query(sql, args); } finally { c.release(); } },
  };
  const repo = new TournamentsPostgresRepository(pool); await repo.ensureSchema(); await repo.ensureSchema();
  const now = new Date().toISOString();
  const tournament = { id: 'local', ownerId: 'test', title: 'Local <torneo>', gameTitle: 'Tekken 8', description: '', platform: 'PC',
    status: 'DRAFT', startsAt: now, maxParticipants: 8, isPublic: false,
    settings: { format: 'SINGLE_ELIMINATION', bestOf: 3, setupCount: 2 }, createdAt: now, updatedAt: now };
  await repo.saveTournament(tournament);
  const mailer = { configured: true, messages: [], fail: false, async send(email, title, url) { if (this.fail) throw Error('private SMTP error'); this.messages.push({ email, title, url }); } };
  const tournaments = new TournamentsService(repo);
  const service = new RegistrationService(repo, tournaments, mailer, 'https://your-domain.example');
  const request = (nickname = 'Player', email = 'player@example.test') => service.request('local', { nickname, email }, '127.0.0.1');
  const token = (index = mailer.messages.length - 1) => new URLSearchParams(new URL(mailer.messages[index].url).hash.slice(1)).get('token');
  return { db, repo, tournaments, tournament, mailer, service, request, token };
}

test('registration: confirmation is explicit, atomic, idempotent and never exposes email', async t => {
  const f = await fixture(t);
  await f.service.updateOptions('local', { registrationEnabled: true, displayEnabled: false });
  await f.request('Player', 'PLAYER@example.test');
  assert.equal((await f.repo.listParticipants('local')).length, 0);
  const record = await f.repo.registrationByEmail('local', 'player@example.test');
  assert.equal(record.tokenHash, createHash('sha256').update(f.token()).digest('hex'));
  assert.notEqual(record.tokenHash, f.token());
  assert.equal(new URL(f.mailer.messages[0].url).searchParams.has('token'), false);
  await Promise.all([f.service.confirm(f.token()), f.service.confirm(f.token())]);
  assert.equal((await f.repo.listParticipants('local')).length, 1);
  await f.request('Other', 'player@example.test');
  assert.equal(f.mailer.messages.length, 1);
  assert.equal((await f.repo.getTournament('local')).settings.displayEnabled, false);
  for (const data of [await f.service.publicInfo('local'), await f.tournaments.getTournamentOverview('local'), await f.repo.listActivity('local')]) {
    assert(!JSON.stringify(data).includes('player@example.test'));
    assert(!JSON.stringify(data).includes(f.token()));
  }
});

test('registration: concurrent confirmations cannot exceed capacity or repeat nicknames', async t => {
  const f = await fixture(t); await f.repo.saveTournament({ ...f.tournament, maxParticipants: 1 });
  await f.service.updateOptions('local', { registrationEnabled: true });
  await f.request('One', 'one@example.test'); await f.request('Two', 'two@example.test');
  const results = await Promise.allSettled([f.service.confirm(f.token(0)), f.service.confirm(f.token(1))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await f.repo.listParticipants('local')).length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  await f.repo.saveTournament({ ...await f.repo.getTournament('local'), maxParticipants: 8 });
  await assert.rejects(f.request('Ｏｎｅ', 'another@example.test'), /nick ya/);
});

test('registration: resend invalidates old links, expired links fail and SMTP failure creates no participant', async t => {
  const f = await fixture(t); await f.service.updateOptions('local', { registrationEnabled: true });
  await f.request(); const old = f.token(); await f.request(); assert.equal(f.mailer.messages.length, 1);
  await f.db.exec("update tournament_registrations set sent_at=now()-interval '2 minutes'");
  await f.request(); await assert.rejects(f.service.confirm(old), /caducado/);
  await f.db.exec("update tournament_registrations set expires_at=now()-interval '1 second'");
  await assert.rejects(f.service.confirm(f.token()), /caducado/);
  f.mailer.fail = true;
  await assert.rejects(f.request('Fail', 'fail@example.test'), /enviar el correo/);
  assert.equal((await f.repo.listParticipants('local')).length, 0);
  f.mailer.fail = false; await f.request('Fail', 'fail@example.test');
  await f.service.confirm(f.token()); assert.equal((await f.repo.listParticipants('local')).length, 1);
});

test('registration: closing and generating bracket invalidate pending confirmation; options survive legacy edits', async t => {
  const f = await fixture(t); await f.service.updateOptions('local', { registrationEnabled: true, displayEnabled: false });
  await f.request(); await f.service.updateOptions('local', { registrationEnabled: false });
  await assert.rejects(f.service.confirm(f.token()), /cerradas/);
  await f.service.updateOptions('local', { registrationEnabled: true });
  await f.tournaments.addParticipant('local', { displayName: 'Local One' });
  await f.tournaments.addParticipant('local', { displayName: 'Local Two' });
  await f.tournaments.updateTournament('local', { ...f.tournament, title: 'Edited', settings: f.tournament.settings });
  assert.equal((await f.repo.getTournament('local')).settings.registrationEnabled, true);
  assert.equal((await f.repo.getTournament('local')).settings.displayEnabled, false);
  await f.tournaments.generateBracket('local');
  assert.equal((await f.repo.getTournament('local')).settings.registrationEnabled, false);
  await assert.rejects(f.service.confirm(f.token()), /cerradas/);
  await assert.rejects(f.service.updateOptions('local', { registrationEnabled: true }), /antes de generar/);
  await f.service.updateOptions('local', { displayEnabled: true });
});

test('registration: missing SMTP blocks opening only; start.gg supports display visibility but not local registration', async t => {
  const f = await fixture(t); f.mailer.configured = false;
  await f.service.updateOptions('local', { displayEnabled: false });
  await assert.rejects(f.service.updateOptions('local', { registrationEnabled: true }), /configurar/);
  await f.repo.saveTournament({ ...f.tournament, importSource: { provider: 'START_GG', eventId: '1' } });
  await assert.rejects(f.service.publicInfo('local'), /no disponible/);
  assert.equal((await f.service.updateOptions('local', { displayEnabled: false })).settings.displayEnabled, false);
  await assert.rejects(f.service.updateOptions('local', { registrationEnabled: true }), /no disponible/);
});

test('registration: failed confirmation rolls back the participant, quotas persist and cleanup removes expired requests', async t => {
  const f = await fixture(t); await f.service.updateOptions('local', { registrationEnabled: true });
  await f.request();
  const save = f.repo.saveRegistration.bind(f.repo);
  f.repo.saveRegistration = async record => { if (record.confirmedAt) throw Error('simulated database failure'); return save(record); };
  await assert.rejects(f.service.confirm(f.token()), /database failure/);
  assert.equal((await f.repo.listParticipants('local')).length, 0);
  assert.equal((await f.repo.registrationByEmail('local', 'player@example.test')).confirmedAt, null);
  f.repo.saveRegistration = save;
  await f.service.confirm(f.token());
  for (let i = 0; i < 4; i++) await f.request();
  const restarted = new RegistrationService(f.repo, f.tournaments, f.mailer, 'https://your-domain.example');
  await assert.rejects(restarted.request('local', { nickname: 'Player', email: 'player@example.test' }, '127.0.0.1'), e => e.status === 429);
  await f.request('Expired', 'expired@example.test');
  await f.db.exec("update tournament_registrations set expires_at=now()-interval '2 days' where confirmed_at is null");
  await f.repo.cleanExpiredRegistrations();
  assert.equal(await f.repo.registrationByEmail('local', 'expired@example.test'), undefined);
  assert((await f.repo.registrationByEmail('local', 'player@example.test')).confirmedAt);
  await f.repo.deleteTournament('local');
  assert.equal((await f.db.query('select count(*)::int as count from tournament_registrations')).rows[0].count, 0);
});

test('registration: HTTP public routes require no app key; options require administrator and reject extra fields', async t => {
  const f = await fixture(t); const previous = process.env.ADMIN_DELETE_KEY;
  process.env.ADMIN_DELETE_KEY = 'test-registration-admin';
  t.after(() => { if (previous === undefined) delete process.env.ADMIN_DELETE_KEY; else process.env.ADMIN_DELETE_KEY = previous; });
  const app = express(); app.use(express.json());app.use((req,res,next)=>{if(['Bearer test-registration-admin','Bearer admin-fixture'].includes(req.header('Authorization')))res.locals.managementUser={id:'fixture',role:'MANAGER'};next();});
  app.use('/api/public-registration', createRegistrationRouter(f.service));
  app.use('/api/tournaments/:tournamentId/public-options', createRegistrationOptionsRouter(f.service));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, admin = false) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer test-registration-admin' } : {}) }, body: JSON.stringify(body) });
  const path = '/api/tournaments/local/public-options';
  assert.equal((await post(path, { displayEnabled: false })).status, 403);
  assert.equal((await post(path, { registrationUrl: 'https://evil.test' }, true)).status, 400);
  assert.equal((await post(path, { registrationEnabled: true }, true)).status, 200);
  const info = await fetch(base + '/api/public-registration/local');
  assert.equal(info.status, 200); assert.equal(info.headers.get('cache-control'), 'no-store');
  assert.equal((await post('/api/public-registration/local/request', { nickname: 'Player', email: 'player@example.test' })).status, 202);
  assert.equal((await f.repo.listParticipants('local')).length, 0);
  assert.equal((await post('/api/public-registration/confirm', { token: f.token() })).status, 200);
  assert.equal((await post('/api/public-registration/confirm', { token: 'invalid' })).status, 400);
});
