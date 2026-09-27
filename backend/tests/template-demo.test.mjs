import test from 'node:test';
import assert from 'node:assert/strict';
import {fortniteFixture} from './fixtures/fortnite-fixture.mjs';

test('Optional demo creates a playable bracket in an empty installation and is idempotent', async t=>{
  const f=await fortniteFixture(t,{count:2,size:5,games:1});
  await f.repo.deleteTournament(f.tournament.id);
  await f.tournaments.seedDemoData();
  const tournaments=await f.repo.listTournaments();
  assert.equal(tournaments.length,1);
  const demo=tournaments[0];
  assert.equal(demo.settings.checkInRequired,false);
  assert.equal((await f.repo.listParticipants(demo.id)).length,4);
  assert.equal((await f.repo.listMatches(demo.id)).length,3);
  await f.tournaments.seedDemoData();
  assert.equal(await f.repo.countTournaments(),1);
});
