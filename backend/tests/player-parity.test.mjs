import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerService } from '../dist/modules/player/player.service.js';
import { LadderService } from '../dist/modules/ladder/ladder.service.js';
import { withBracketLabels } from '../dist/modules/tournaments/bracket-labels.js';
import { playerReportDetailedResultSchema, playerLadderDetailedReportSchema } from '../dist/modules/player/player.schemas.js';
const tournament = { id: 't', title: 'Teams', gameTitle: 'Super Smash Bros. Ultimate', status: 'IN_PROGRESS', importSource: { provider: 'START_GG', entrantSize: 2 }, settings: { format: 'DOUBLE_ELIMINATION', callTimeoutMinutes: 7 } };
const match = { id: 'm', tournamentId: 't', bracketStage: 'LOSERS', roundNumber: 3, matchNumber: 8, status: 'PLAYING', bestOf: 5, advancersRequired: 1, participants: [{ participantId: 'a', displayName: 'Team A', score: 0, slot: 1 }, { participantId: 'b', displayName: 'Team B', score: 0, slot: 2 }], externalRef: { provider: 'START_GG', identifier: 'H2', fullRoundText: 'Losers Quarter-Final' } };
const player = new PlayerService({}, {}, {}, {}, {}, undefined);
const selections = [{ participantId: 'a', characterName: 'Mario / Mario' }, { participantId: 'b', characterName: 'Luigi / Peach' }];

test('player bracket and management expose the same start.gg identifier and round', () => {
 const labelled = withBracketLabels([match])[0];
 const board = player.mapPlayerBracketMatchView(tournament, labelled);
 const mine = player.mapPlayerMatchView(tournament, labelled, 'a');
 assert.equal(board.displayIdentifier, 'H2');
 assert.equal(board.fullRoundText, 'Losers Quarter-Final');
 assert.equal(board.label, 'H2 · Losers Quarter-Final');
 assert.equal(mine.roundLabel, board.label);
 assert.equal(mine.entrantSize, 2);
 assert.equal(mine.canReportCharacters, true);
});
test('future opponent placeholders never become playable matches', () => {
 for (const id of ['winner_of_m', 'loser_of_startgg_8', 'advance_2_of_m', 'drop_1_of_m', '']) {
  const future = { ...match, participants: [match.participants[0], { ...match.participants[1], participantId: id }] };
  assert.equal(player.hasRealOpponent(future), false, id);
  assert.equal(player.mapPlayerMatchView(tournament, future, 'a'), undefined, id);
 }
});
test('players receive local dependency labels instead of opaque placeholder ids', () => {
 const [source, target] = withBracketLabels([{ ...match, externalRef: undefined }, { ...match, id: 'n', roundNumber: 4, externalRef: undefined, participants: [{ ...match.participants[0], participantId: 'loser_of_m' }] }]);
 assert.equal(player.mapPlayerBracketMatchView(tournament, target).participants[0].displayName, 'Loser of ' + source.displayIdentifier);
});
test('player schemas preserve Bo1 overrides and a character for every team member', () => {
 const body = { bestOfOverride: 1, games: [{ winnerParticipantId: 'a', selections }] };
 assert.equal(playerReportDetailedResultSchema.parse(body).bestOfOverride, 1);
 assert.equal(playerLadderDetailedReportSchema.parse(body).bestOfOverride, 1);
 assert.equal(player.supportsCharacterReporting({ ...tournament, gameTitle: 'Rivals of Aether II' }), true);
});
function ladderFixture() {
 let saved;
 const repo = { runInTransaction: async fn => fn({}), appendActivity: async () => {}, saveMatch: async value => { saved = value; return value; } };
 const service = new LadderService(repo, {}, {});
 service.requireEligibleTournament = async () => tournament;
 service.requireActiveSession = async () => ({ id: 's' });
 service.refreshTournamentSession = async () => [];
 service.requireEditableMatch = async () => ({ ...structuredClone(match), ladderSessionId: 's' });
 service.notifyLadderMatchesFound = async () => {};
 service.readOverview = async () => ({ completedMatches: saved ? [saved] : [] });
 return { service, saved: () => saved };
}
test('ladder permits duplicated characters within teams and the selected Bo1', async () => {
 const { service, saved } = ladderFixture();
 await service.reportDetailedResult('t','m', [{ winnerParticipantId: 'a', selections }], { bestOfOverride: 1, reporterParticipantId: 'a' });
 assert.equal(saved().bestOf, 1);
 assert.equal(saved().winnerParticipantId, 'a');
 assert.deepEqual(saved().characterSelections.map(s => s.characterName), ['Mario', 'Mario', 'Luigi', 'Peach']);
});
test('ladder rejects a report from an unrelated player inside its transaction', async () => {
 const { service, saved } = ladderFixture();
 await assert.rejects(service.reportDetailedResult('t','m', [{ winnerParticipantId: 'a', selections }], { bestOfOverride: 1, reporterParticipantId: 'outsider' }), /does not belong/);
 assert.equal(saved(), undefined);
});
test('ladder rejects incomplete teams and games after a deciding win', async () => {
 const { service } = ladderFixture();
 await assert.rejects(service.reportDetailedResult('t','m', [{ winnerParticipantId: 'a', selections: [{ participantId: 'a', characterName: 'Mario' }, selections[1]] }], { bestOfOverride: 1 }), /all team members/);
 await assert.rejects(service.reportDetailedResult('t','m', [{ winnerParticipantId: 'a', selections }, { winnerParticipantId: 'b', selections }], { bestOfOverride: 1 }), /after the set is closed/);
});

test('Players excludes archived tournaments from lists, direct access and binding refresh',async()=>{
 const archived={...tournament,id:'archived',status:'ARCHIVED'},active={...tournament,id:'active'};
 const service=new PlayerService({upsertTournamentBinding:async()=>{}}, {listTournaments:async()=>[archived,active],getTournament:async()=>archived}, {}, {}, {}, undefined);
 service.requireSession=async()=>({user:{id:'user'}});
 const built=[];service.buildTournamentViewForSession=async(_session,t)=>{built.push(t.id);return {tournamentId:t.id};};
 const listed=await service.listMyTournaments('session');assert.deepEqual(built,['active']);assert.equal(listed.tournaments.length,1);
 await assert.rejects(service.getMyTournament('session','archived'));
 const bound=[];service.findPlayerParticipantForTournament=async(_session,t)=>{bound.push(t.id);return undefined;};
 await service.refreshParticipantBindings({account:{id:'user'}});assert.deepEqual(bound,['active']);
});
