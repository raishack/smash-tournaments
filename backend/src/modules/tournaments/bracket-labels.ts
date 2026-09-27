import type { Match } from "../../shared/types.js";

function columnLetter(index: number): string {
  let result = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(65 + (value - 1) % 26) + result;
  }
  return result;
}

/** Presentation only: never changes IDs, seeds, results, or progression. */
export function withBracketLabels(matches: Match[], format?: string): Match[] {
  const stageOrder = { POOLS: 0, WINNERS: 1, LOSERS: 2, FINALS: 3 };
  const groupKey = (match: Match) => [match.externalRef?.phaseId ?? "local", match.externalRef?.phaseGroupId ?? "main"].join(":");
  const roundKey = (match: Match) => [groupKey(match), match.bracketStage, match.roundNumber].join(":");
  const sorted = [...matches].sort((a, b) => groupKey(a).localeCompare(groupKey(b))
    || stageOrder[a.bracketStage] - stageOrder[b.bracketStage] || a.roundNumber - b.roundNumber || a.matchNumber - b.matchNumber);
  const rounds = new Map<string, Match[]>();
  for (const match of sorted) {
    const key = roundKey(match);
    const entries = rounds.get(key) ?? [];
    entries.push(match);
    rounds.set(key, entries);
  }
  const identifiers = new Map<string, string>();
  const columns = new Map<string, number>();
  for (const entries of rounds.values()) {
    const group = groupKey(entries[0]!);
    const column = columns.get(group) ?? 0;
    entries.forEach((match, index) => identifiers.set(match.id, match.externalRef?.identifier || `${columnLetter(column)}${index + 1}`));
    columns.set(group, column + 1);
  }
  const lastRounds = new Map<string, number>();
  for (const match of matches) {
    const key = groupKey(match) + match.bracketStage;
    lastRounds.set(key, Math.max(lastRounds.get(key) ?? 0, match.roundNumber));
  }
  return matches.map((match) => {
    const lastRound = lastRounds.get(groupKey(match) + match.bracketStage)!;
    const fromEnd = lastRound - match.roundNumber;
    const prefix = match.bracketStage === "LOSERS" ? "Losers" : "Winners";
    const roundLabel = match.externalRef?.fullRoundText || ((match.externalRef?.phaseType === "ROUND_ROBIN" || format === "ROUND_ROBIN")
      ? `Round ${match.roundNumber}`
      : match.bracketStage === "FINALS" ? (match.roundNumber > 1 ? "Grand Final Reset" : "Grand Final")
      : `${prefix} ${fromEnd === 0 ? "Final" : fromEnd === 1 ? "Semi-Final" : fromEnd === 2 ? "Quarter-Final" : `Round ${match.roundNumber}`}`);
    const displayIdentifier = identifiers.get(match.id)!;
    const startggStreamLabel = match.externalRef?.stream ? `Stream start.gg: ${match.externalRef.stream.name}` : undefined;
    return {
      ...match, displayIdentifier, roundLabel, startggStreamLabel, displayLabel: `${displayIdentifier} · ${roundLabel}${startggStreamLabel ? ` · ${startggStreamLabel}` : ""}`,
      participants: match.participants.map((participant) => {
        const dependency = /^(winner|loser)_of_(.+)$/.exec(participant.participantId);
        const sourceLabel = dependency && identifiers.get(dependency[2]!);
        return sourceLabel ? { ...participant, displayName: `${dependency![1] === "loser" ? "Loser" : "Winner"} of ${sourceLabel}` } : participant;
      }),
    };
  });
}
