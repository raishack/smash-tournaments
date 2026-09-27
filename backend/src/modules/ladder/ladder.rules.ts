import type { LadderMatch, LadderQueueEntry, LadderSettings, LadderStanding } from "./ladder.types.js";

export const defaultLadderSettings: LadderSettings = {
  mode: "CASUAL", bestOf: 5, readySeconds: 300, rematchWaitSeconds: 180,
  minimumSets: 3, requireConfirmation: false, setupNumbers: [],
};
export const openLadderStatuses = ["READY_CHECK", "PLAYING", "SUSPENDED", "AWAITING_CONFIRMATION", "DISPUTED"];
export const occupiesLadderSetup = (match: LadderMatch): boolean => ["READY_CHECK", "PLAYING"].includes(match.status);
export const occupiesBracket = (status: string): boolean => ["CALLED", "CHECKED_IN", "PLAYING", "RESULT_REPORTED", "UNDER_REVIEW"].includes(status);
export const setupNumber = (label?: string): number | undefined => {
  const value = /^(?:setup\s*)?(\d+)$/i.exec(label?.trim() ?? "")?.[1];
  return value ? Number(value) : undefined;
};

export function ladderStandings(matches: LadderMatch[], settings = defaultLadderSettings): LadderStanding[] {
  const stats = new Map<string, LadderStanding>();
  const completed = matches.filter(m => m.status === "COMPLETED").sort((a,b) =>
    (a.completedAt ?? a.updatedAt).localeCompare(b.completedAt ?? b.updatedAt) || a.id.localeCompare(b.id));
  for (const match of completed) {
    if (match.participants.length !== 2 || !match.winnerParticipantId) continue;
    const players = match.participants.map(p => {
      let entry = stats.get(p.participantId);
      if (!entry) {
        entry = { participantId: p.participantId, displayName: p.displayName, matchesPlayed: 0,
          wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, gameDifferential: 0, rating: 1000 };
        stats.set(p.participantId, entry);
      }
      return entry;
    });
    const expected = 1 / (1 + 10 ** (((players[1]!.rating ?? 1000) - (players[0]!.rating ?? 1000)) / 400));
    const delta = 32 * ((players[0]!.participantId === match.winnerParticipantId ? 1 : 0) - expected);
    players.forEach((entry, index) => {
      entry.rating = (entry.rating ?? 1000) + (index === 0 ? delta : -delta);
      entry.matchesPlayed++;
      entry.wins += Number(entry.participantId === match.winnerParticipantId);
      entry.losses = entry.matchesPlayed - entry.wins;
      entry.gamesWon += match.participants[index]!.score;
      entry.gamesLost += match.participants[1-index]!.score;
      entry.gameDifferential = entry.gamesWon - entry.gamesLost;
      entry.eligible = entry.matchesPlayed >= settings.minimumSets;
      entry.winRate = Math.round(100 * entry.wins / entry.matchesPlayed);
    });
  }
  return [...stats.values()].map(s => ({ ...s, rankingMode: settings.mode, rating: Math.round(s.rating ?? 1000) })).sort((a,b) =>
    (settings.mode === "COMPETITIVE"
      ? Number(b.eligible) - Number(a.eligible) || (b.rating ?? 1000) - (a.rating ?? 1000)
      : b.wins - a.wins)
    || b.gameDifferential - a.gameDifferential || b.wins - a.wins || a.participantId.localeCompare(b.participantId));
}

/** The oldest available entrant is always considered; widen the skill window as they wait. */
export function selectLadderPair(queue: LadderQueueEntry[], matches: LadderMatch[], settings = defaultLadderSettings, now = Date.now()): [LadderQueueEntry,LadderQueueEntry] | undefined {
  const ordered = [...queue].sort((a,b) => a.queuedAt.localeCompare(b.queuedAt) || a.participantId.localeCompare(b.participantId));
  const first = ordered[0];
  if (!first || ordered.length < 2) return undefined;
  const history = matches.filter(m => m.status === "COMPLETED").sort((a,b) =>
    (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt) || a.id.localeCompare(b.id));
  const lastOpponent = (id: string) => history.find(m => m.participants.some(p => p.participantId === id))?.participants.find(p => p.participantId !== id)?.participantId;
  const firstLast = lastOpponent(first.participantId);
  const rating = new Map(ladderStandings(matches, settings).map(s => [s.participantId,s.rating ?? 1000]));
  const waited = Math.max(0, now - Date.parse(first.queuedAt)) / 1000;
  const skillWindow = 100 + waited * 2;
  const ranked = ordered.slice(1).map((second,index) => ({ second, index,
    rematch: firstLast === second.participantId || lastOpponent(second.participantId) === first.participantId,
    played: history.filter(m => m.participants.some(p => p.participantId === first.participantId) && m.participants.some(p => p.participantId === second.participantId)).length,
    difference: Math.abs((rating.get(first.participantId) ?? 1000) - (rating.get(second.participantId) ?? 1000)),
  })).sort((a,b) => Number(a.rematch)-Number(b.rematch)
    || (settings.mode === "COMPETITIVE" ? Number(a.difference > skillWindow)-Number(b.difference > skillWindow) : 0)
    || a.played-b.played
    || (settings.mode === "COMPETITIVE" ? a.difference-b.difference : 0) || a.index-b.index);
  const best = ranked[0]!;
  const alternativesBusy = matches.some(m => openLadderStatuses.includes(m.status) && m.participants.some(p => ![first.participantId,best.second.participantId].includes(p.participantId)));
  if (best.rematch && alternativesBusy && waited < settings.rematchWaitSeconds) return undefined;
  return [first,best.second];
}
