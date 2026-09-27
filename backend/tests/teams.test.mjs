import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { TournamentsPostgresRepository } from '../dist/modules/tournaments/tournaments.postgres-repository.js';
import { TournamentsService } from '../dist/modules/tournaments/tournaments.service.js';
import { RegistrationService } from '../dist/modules/registration/registration.service.js';
import { TeamsService, teamActionSchema } from '../dist/modules/teams/teams.service.js';

async function fixture(t, settings = {}, maxParticipants = 8) {
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
  const tournament = { id:'local', ownerId:'test', title:'Valorant Tournament Platform', gameTitle:'Valorant', description:'Equipos', platform:'PC',
    status:'DRAFT', startsAt:now, maxParticipants, isPublic:false,
    settings:{ format:'SINGLE_ELIMINATION', bestOf:3, setupCount:2, teamSize:2, reserveCount:1, allowSoloRegistration:true, registrationEnabled:true, ...settings }, createdAt:now, updatedAt:now };
  await repo.saveTournament(tournament);
  const mailer = { configured:true, messages:[], async send(email, title, url) { this.messages.push({email,title,url}); } };
  const tournaments = new TournamentsService(repo);
  const teams = new TeamsService(repo,tournaments);
  const registration = new RegistrationService(repo,tournaments,mailer,'https://your-domain.example');
  let counter = 0;
  const request = async (nickname, data) => {
    await registration.request('local',{ nickname, email:`player${++counter}@example.test`, ...data },'127.0.0.1');
    return new URLSearchParams(new URL(mailer.messages.at(-1).url).hash.slice(1)).get('token');
  };
  const action = input => teams.action('local', input);
  return { db,repo,tournaments,teams,registration,tournament,mailer,request,action };
}

test('teams: email confirmation creates one team, private invitation and individual roster memberships', async t => {
  const f = await fixture(t,{},1);
  const captain = await f.request('Captain',{mode:'TEAM_CREATE',teamName:'Blue'});
  assert.equal((await f.teams.overview('local')).teams.length,0);
  const receipt = await f.registration.confirm(captain);
  assert.equal(receipt.teamName,'Blue'); assert.match(receipt.teamCode,/^[A-F0-9]{16}$/);
  await f.registration.confirm(captain);
  assert.equal((await f.repo.listTeamMembers('local')).length,1);
  const join = await f.request('Second',{mode:'TEAM_JOIN',teamCode:receipt.teamCode.toLowerCase(),role:'PLAYER'});
  assert.equal((await f.registration.confirm(join)).teamCode,undefined);
  const reserve = await f.request('Reserve',{mode:'TEAM_JOIN',teamCode:receipt.teamCode,role:'RESERVE'});
  await f.registration.confirm(reserve);
  await assert.rejects(f.request('Extra',{mode:'TEAM_JOIN',teamCode:receipt.teamCode,role:'RESERVE'}),/reserva/);
  await assert.rejects(f.request('Ｃａｐｔａｉｎ',{mode:'SOLO'}),/nick/);
  const solo = await f.request('Solo Player',{mode:'SOLO'}); assert.equal((await f.registration.confirm(solo)).waitingForTeam,true);
  const info = await f.registration.publicInfo('local'); assert.equal(info.open,true); assert.equal(info.availablePlaces,0);
  assert.equal((await f.repo.listParticipants('local')).length,1);
  for (const data of [info,await f.teams.overview('local'),await f.tournaments.getTournamentOverview('local')]) assert(!JSON.stringify(data).includes('@example.test'));
  assert(!JSON.stringify(info).includes(receipt.teamCode));
  const count = f.mailer.messages.length;
  await f.registration.request('local',{nickname:'Different',email:'player1@example.test',mode:'SOLO'},'127.0.0.1');
  assert.equal(f.mailer.messages.length,count);
});

test('teams: concurrent confirmations never overfill starters or create duplicate team names', async t => {
  const f = await fixture(t);
  const captain = await f.registration.confirm(await f.request('Captain',{mode:'TEAM_CREATE',teamName:'Alpha'}));
  const input = {mode:'TEAM_JOIN',teamCode:captain.teamCode};
  const first = await f.request('First',input), second = await f.request('Second',input);
  const results = await Promise.allSettled([f.registration.confirm(first),f.registration.confirm(second)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length,1);
  const a = await f.request('Another A',{mode:'TEAM_CREATE',teamName:'Beta'});
  const b = await f.request('Another B',{mode:'TEAM_CREATE',teamName:'Ｂｅｔａ'});
  const creates = await Promise.allSettled([f.registration.confirm(a),f.registration.confirm(b)]);
  assert.equal(creates.filter(x => x.status === 'fulfilled').length,1);
  assert.equal((await f.repo.listParticipants('local')).length,2);
});

test('teams: forming a team from solo players is atomic; stale assignments cannot overwrite newer ones', async t => {
  const f = await fixture(t);
  for (const nickname of ['One','Two','Three']) await f.action({action:'ADD_MEMBER',nickname,teamId:null,role:'PLAYER'});
  const pool = (await f.teams.overview('local')).unassigned;
  await assert.rejects(f.action({action:'CREATE_TEAM',name:'Too many',members:pool.map(m => ({id:m.id,role:'PLAYER'}))}),/titulares/);
  assert.equal((await f.repo.listParticipants('local')).length,0);
  assert.equal((await f.teams.overview('local')).unassigned.length,3);
  const roster = await f.action({action:'CREATE_TEAM',name:'Alpha',members:pool.slice(0,2).map(m => ({id:m.id,role:'PLAYER'}))});
  const member = roster.unassigned[0], team = roster.teams[0];
  const move = {action:'MOVE_MEMBER',id:member.id,revision:member.revision,teamId:team.id,role:'RESERVE'};
  await f.action(move);
  await assert.rejects(f.action(move),/Otro dispositivo/);
  await assert.rejects(f.action({action:'CREATE_TEAM',name:'Already assigned',members:[{id:member.id,role:'PLAYER'}]}),/ya ha sido asignado/);
  await f.tournaments.updateParticipant('local',team.id,{displayName:'Renamed'});
  assert.equal((await f.teams.overview('local')).teams[0].members.length,3);
  await f.tournaments.deleteParticipant('local',team.id);
  const after = await f.teams.overview('local');
  assert.equal(after.teams.length,0); assert.equal(after.unassigned.length,3);
  assert(after.unassigned.every(m => m.role === 'PLAYER'));
  assert.equal(await f.repo.findTeamByCode('local',team.code),undefined);
});

test('teams: only complete teams generate a bracket, settings survive legacy edits, reset preserves rosters', async t => {
  const f = await fixture(t);
  await f.action({action:'CREATE_TEAM',name:'Alpha',members:[]});
  await f.action({action:'CREATE_TEAM',name:'Beta',members:[]});
  await assert.rejects(f.tournaments.generateBracket('local'),/titulares|complet/i);
  assert.equal((await f.repo.getTournament('local')).settings.registrationEnabled,true);
  await f.tournaments.updateTournament('local',{...f.tournament,settings:{format:'SINGLE_ELIMINATION',bestOf:3,setupCount:2}});
  assert.equal((await f.repo.getTournament('local')).settings.teamSize,2);
  await assert.rejects(f.tournaments.updateTournament('local',{...f.tournament,settings:{...f.tournament.settings,teamSize:5}}),/plantilla|inscrit|participantes|equipos/i);
  const teams = (await f.teams.overview('local')).teams;
  for (const team of teams) for (let i=0;i<2;i++) await f.action({action:'ADD_MEMBER',nickname:`${team.name} ${i}`,teamId:team.id,role:'PLAYER'});
  const pending = await f.request('Late player',{mode:'SOLO'});
  await f.tournaments.generateBracket('local');
  assert.equal((await f.repo.listParticipants('local')).length,2);
  assert.equal((await f.repo.listMatches('local')).length,1);
  assert.equal((await f.teams.overview('local')).canEdit,false);
  await assert.rejects(f.action({action:'ADD_MEMBER',nickname:'Late',teamId:null,role:'PLAYER'}),/cerradas/);
  await assert.rejects(f.registration.confirm(pending),/cerradas/);
  await f.tournaments.resetTournament('local');
  assert.equal((await f.repo.listTeamMembers('local')).length,4);
  assert.equal((await f.teams.overview('local')).canEdit,true);
});

test('teams: close solo queue, remove memberships, invitation scoping and local/import isolation', async t => {
  const f = await fixture(t);
  const solo = await f.request('Waiting',{mode:'SOLO'});
  await f.action({action:'SOLO_OPTION',enabled:false});
  await assert.rejects(f.registration.confirm(solo),/deshabilitada/);
  await f.action({action:'SOLO_OPTION',enabled:true});
  await f.registration.confirm(solo);
  const member = (await f.teams.overview('local')).unassigned[0];
  await f.action({action:'REMOVE_MEMBER',id:member.id,revision:member.revision});
  await assert.rejects(f.registration.confirm(solo),/retirado/);
  await f.db.exec("update tournament_registrations set sent_at=now()-interval '2 minutes'");
  await f.registration.request('local',{nickname:'Waiting again',email:'player1@example.test',mode:'SOLO'},'127.0.0.1');
  assert.equal(f.mailer.messages.length,2);
  await f.action({action:'CREATE_TEAM',name:'Team',members:[]});
  const code = (await f.teams.overview('local')).teams[0].code;
  assert.equal(await f.repo.findTeamByCode('another-tournament',code),undefined);
  await assert.rejects(f.tournaments.startBackgroundImport('local',{eventUrl:'https://start.gg/test'}),/plantillas locales/);
  await assert.rejects(f.tournaments.importFromStartgg('local',{eventUrl:'https://start.gg/test'}),/plantillas locales/);
  assert.equal(teamActionSchema.parse({action:'ADD_MEMBER',nickname:'Test',role:'PLAYER'}).teamId,null);
  await f.action({action:'ADD_MEMBER',nickname:'Gson omitted null',role:'PLAYER'});
  assert((await f.teams.overview('local')).unassigned.some(m => m.nickname === 'Gson omitted null'));
  await f.repo.deleteTournament('local');
  for (const table of ['tournament_team_members','tournament_team_codes','tournament_registrations']) assert.equal((await f.db.query(`select count(*)::int as count from ${table}`)).rows[0].count,0);
});

test('teams: regrouping former captains gives the new team exactly one captain', async t => {
  const f = await fixture(t);
  for (const name of ['Alpha','Beta']) {
    const receipt = await f.registration.confirm(await f.request(name+' captain',{mode:'TEAM_CREATE',teamName:name}));
    const team = (await f.teams.overview('local')).teams.find(row=>row.name===name);
    assert.equal(team.members.filter(m=>m.meta?.captain).length,1);
    await f.tournaments.deleteParticipant('local',team.id);
    assert.equal(await f.repo.findTeamByCode('local',receipt.teamCode),undefined);
  }
  const pool=(await f.teams.overview('local')).unassigned;
  assert(pool.every(m=>!m.meta?.captain),'unassigned members have no team captain role');
  // Also repair unassigned entries left by earlier application versions.
  for(const member of pool)await f.repo.saveTeamMember({...member,meta:{...member.meta,captain:true}});
  const roster=await f.action({action:'CREATE_TEAM',name:'Combined',members:pool.map(m=>({id:m.id,role:'PLAYER'}))});
  assert.equal(roster.teams[0].members.filter(m=>m.meta?.captain).length,1);
  assert.equal(roster.teams[0].members.length,2);
});
