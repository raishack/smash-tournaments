export function displayFixture(size = 16, id = 'screen-test') {
  const tournament = { id, title: 'Community example tournament', gameTitle: 'Super Smash Bros. Ultimate', status: 'IN_PROGRESS',
    settings: { format: 'DOUBLE_ELIMINATION', bestOf: 3, setupCount: 4, callTimeoutMinutes: 10, playAreaName: 'Zona principal' },
    importSource: { provider: 'START_GG', entrantSize: 2, eventId: 'demo' } };
  const participants = Array.from({ length: size }, (_, i) => ({ id: `p${i}`, displayName: `Team ${i + 1} · Player Álvarez / Player Fernández` }));
  const matches = [];
  let number = 0;
  function add(stage, count, round, previous = []) {
    const result = [];
    for (let i = 0; i < count; i++) {
      const matchId = `${id}-${stage}-${round}-${i}`;
      const entrants = [0, 1].map((slot) => {
        const source = previous[i * 2 + slot];
        const entrant = participants[(i * 2 + slot) % size];
        return { id: `${matchId}-${slot}`, slot: slot + 1, participantId: source ? `winner_of_${source.id}` : entrant.id,
          displayName: source ? `Winner of ${source.displayIdentifier}` : entrant.displayName, score: 0 };
      });
      const match = { id: matchId, tournamentId: id, bracketStage: stage, roundNumber: round, matchNumber: ++number,
        displayIdentifier: `${stage === 'LOSERS' ? 'L' : 'W'}${round}-${i + 1}`, roundLabel: `${stage === 'LOSERS' ? 'Losers' : 'Winners'} Round ${round}`,
        status: 'PENDING', bestOf: 3, advancersRequired: 1, participants: entrants,
        externalRef: { provider: 'START_GG', setId: matchId, phaseId: 'phase-1', phaseGroupId: 'group-1', phaseName: 'Top bracket', phaseGroupName: 'Pool A', phaseOrder: 1 },
        characterSelections: entrants.flatMap(p => ['Mario', 'Luigi'].map((characterName, index) => ({ participantId: p.participantId, characterName, characterId: index + 1 }))) };
      matches.push(match); result.push(match);
    }
    return result;
  }
  let previous = [];
  for (let round = 1, count = size / 2; count >= 1; round++, count /= 2) previous = add('WINNERS', count, round, previous);
  previous = [];
  for (let round = 1, count = size / 4; count >= 1; round++, count /= 2) previous = add('LOSERS', count, round, previous);
  return { tournament, participants, matches };
}
