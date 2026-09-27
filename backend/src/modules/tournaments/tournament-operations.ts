import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { Match } from "../../shared/types.js";

export interface OperationRequest {
  id?: string;
  expectedRevision?: string;
  platform?: string;
  appVersion?: string;
}

export const operationRequest = new AsyncLocalStorage<OperationRequest>();

export class OperationConflict extends Error {
  readonly statusCode = 409;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

// A background acknowledgement must not invalidate the operator's current form.
export function matchRevision(match: Match): string {
  return fingerprint({ id: match.id, status: match.status, bestOf: match.bestOf, reportedBestOf: match.reportedBestOf,
    participants: match.participants.map(p => ({ participantId: p.participantId, slot: p.slot, score: p.score })),
    gameResults: match.gameResults, characterSelections: match.characterSelections, gameCharacterSelections: match.gameCharacterSelections,
    winnerParticipantId: match.winnerParticipantId, advancingParticipantIds: match.advancingParticipantIds,
    call: match.call, localSyncVersion: match.externalRef?.localSyncVersion ?? 0,
  });
}

export function safeDiagnostic(value: unknown): string {
  return String(value ?? "")
    .replace(/Bearer\s+[^\s,;"']+/gi, "Bearer [oculto]")
    .replace(/((?:token|password|secret|authorization|api[_-]?key|x-app-key|x-admin-key)["']?\s*[=:]\s*["']?)[^\s,;&"']+/gi, "$1[oculto]")
    .replace(/https?:\/\/[^\s"']+/gi, "[URL omitida]")
    .slice(0, 1000);
}

export interface TournamentActivity {
  id: string;
  tournamentId: string;
  matchId?: string;
  action: string;
  createdAt: string;
  platform?: string;
  appVersion?: string;
  before?: unknown;
  after?: unknown;
  error?: string;
}

export interface SyncJob {
  id: string;
  tournamentId: string;
  matchId: string;
  action: string;
  version: number;
  state: "PENDING" | "RUNNING" | "FAILED" | "SYNCED" | "SUPERSEDED";
  attempts: number;
  error?: string;
  updatedAt: string;
}

export const actionLabels: Record<string, string> = {
  archiveTournament: 'Tournament archived', unarchiveTournament: 'Tournament unarchived',
  repairLocalAutomaticAdvances: 'Automatic advancement and tournament completion repaired',
  fortniteGENERATE:'Fortnite: groups and seats drawn',fortniteSTART:'Fortnite: game started',fortniteGAME:'Fortnite: score sheet saved',fortniteADVANCE:'Fortnite: round closed',
  callMatch: "Match called", cancelMatchCall: "Call cancelled", startMatch: "Match started",
  updateMatchCharacters: "Characters saved", recordGameWin: "Game win added",
  reportResult: "Result recorded/corrected", reportDetailedResult: "Detailed result recorded/corrected",
  selectMarioKartAdvancer: "Selected qualifier", resolveAbsence: "Absence / DQ",
  resetMatch: "Match reset", resetTournament: "Tournament reset", generateBracket: "Bracket generated",
  startTournament: "Tournament started", updateTournament: "Settings saved", updateSetups: "Setups and streams updated",
  addParticipant: "Participant added", updateParticipant: "Participant edited", deleteParticipant: "Participant deleted",
  "sync-failed": "start.gg synchronization error", "sync-confirmed": "Confirmed on start.gg",
  "sync-retry": "Synchronization retry requested",
};

export function matchAuditState(match?: Match): unknown {
  return match ? {
    status: match.status, winnerParticipantId: match.winnerParticipantId,
    scores: match.participants.map(p => ({ participantId: p.participantId, name: p.displayName, score: p.score })),
    gameResults: match.gameResults, characters: match.gameCharacterSelections ?? match.characterSelections,
    advancingParticipantIds: match.advancingParticipantIds, setup: match.call?.stationLabel,
  } : null;
}

export function describeAuditState(value: unknown): string {
  if (!value || typeof value !== "object") return "No data";
  if (Array.isArray(value)) return value.map(p => `${p.name ?? "Player"}${p.seed ? ` (seed ${p.seed})` : ""}`).join(", ");
  const state = value as Record<string, any>;
  const labels: Record<string, string> = { PLAYING: "Playing", PENDING: "Pending", CALLED: "Called", COMPLETED: "Finished", ARCHIVED: "Archived", WALKOVER: "Resolved due to absence", CANCELLED: "Cancelled", IN_PROGRESS: "In progress", READY: "Ready", DRAFT: "Draft" };
  const parts = [state.title, state.status ? (labels[state.status] ?? state.status) : undefined];
  if (state.fortnite?.rows) parts.push(state.fortnite.rows.map((p:any)=>`${p.name??'Player'}: ${p.placement?p.placement+'.º':'no podium'}, ${p.kills} kills${p.vipKill?', eliminated the VIP':''}`).join(' · '));
  if (state.scores) {
    parts.push(state.scores.map((p: any) => `${p.name ?? "Player"}: ${p.score}`).join(" · "));
    const winner = state.scores.find((p: any) => p.participantId === state.winnerParticipantId);
    if (winner) parts.push(`Winner: ${winner.name ?? "Player"}`);
  }
  if (state.setup) parts.push(`Setup: ${state.setup}`);
  if (state.characters?.length) {
    const selections = state.characters.flatMap((item: any) => item.selections ?? [item]);
    parts.push(`Characters: ${selections.map((s: any) => s.characterName).filter(Boolean).join(", ")}`);
  }
  if (state.settings) {
    const settingLabels: Record<string, string> = { setupCount: "Setups", streamCount: "Streams", format: "Format", bestOf: "BO", winnersBestOf: "BO winners", losersBestOf: "BO losers", callTimeoutMinutes: "Call timeout in minutes", mkartAdvanceCount: "Qualifiers", mkartLosersAdvanceCount: "Losers bracket qualifiers", seedingMethod: "Seeding" };
    parts.push(...Object.entries(settingLabels).filter(([key]) => state.settings[key] !== undefined).map(([key, label]) => `${label}: ${state.settings[key]}`));
  }
  return safeDiagnostic(parts.filter(Boolean).join(" · "));
}
