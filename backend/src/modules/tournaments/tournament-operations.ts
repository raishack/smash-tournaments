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
  archiveTournament: 'Torneo archivado', unarchiveTournament: 'Torneo desarchivado',
  repairLocalAutomaticAdvances: 'Pases automáticos y cierre del torneo reparados',
  fortniteGENERATE:'Fortnite: grupos y puestos sorteados',fortniteSTART:'Fortnite: partida iniciada',fortniteGAME:'Fortnite: acta guardada',fortniteADVANCE:'Fortnite: ronda cerrada',
  callMatch: "Llamada al match", cancelMatchCall: "Llamada cancelada", startMatch: "Match iniciado",
  updateMatchCharacters: "Personajes guardados", recordGameWin: "Partida sumada",
  reportResult: "Resultado anotado/corregido", reportDetailedResult: "Resultado detallado anotado/corregido",
  selectMarioKartAdvancer: "Clasificado seleccionado", resolveAbsence: "Ausencia / DQ",
  resetMatch: "Match reiniciado", resetTournament: "Torneo reiniciado", generateBracket: "Bracket generada",
  startTournament: "Torneo iniciado", updateTournament: "Ajustes guardados", updateSetups: "Setups y stream modificados",
  addParticipant: "Participante añadido", updateParticipant: "Participante editado", deleteParticipant: "Participante eliminado",
  "sync-failed": "Error de sincronización con start.gg", "sync-confirmed": "Confirmado en start.gg",
  "sync-retry": "Reintento de sincronización solicitado",
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
  if (!value || typeof value !== "object") return "Sin datos";
  if (Array.isArray(value)) return value.map(p => `${p.name ?? "Jugador"}${p.seed ? ` (seed ${p.seed})` : ""}`).join(", ");
  const state = value as Record<string, any>;
  const labels: Record<string, string> = { PLAYING: "En juego", PENDING: "Pendiente", CALLED: "Llamado", COMPLETED: "Finalizado", ARCHIVED: "Archivado", WALKOVER: "Resuelto por ausencia", CANCELLED: "Cancelado", IN_PROGRESS: "En curso", READY: "Preparado", DRAFT: "Borrador" };
  const parts = [state.title, state.status ? (labels[state.status] ?? state.status) : undefined];
  if (state.fortnite?.rows) parts.push(state.fortnite.rows.map((p:any)=>`${p.name??'Jugador'}: ${p.placement?p.placement+'.º':'sin podio'}, ${p.kills} kills${p.vipKill?', eliminó al VIP':''}`).join(' · '));
  if (state.scores) {
    parts.push(state.scores.map((p: any) => `${p.name ?? "Jugador"}: ${p.score}`).join(" · "));
    const winner = state.scores.find((p: any) => p.participantId === state.winnerParticipantId);
    if (winner) parts.push(`Ganador: ${winner.name ?? "Jugador"}`);
  }
  if (state.setup) parts.push(`Setup: ${state.setup}`);
  if (state.characters?.length) {
    const selections = state.characters.flatMap((item: any) => item.selections ?? [item]);
    parts.push(`Personajes: ${selections.map((s: any) => s.characterName).filter(Boolean).join(", ")}`);
  }
  if (state.settings) {
    const settingLabels: Record<string, string> = { setupCount: "Setups", streamCount: "Streams", format: "Formato", bestOf: "BO", winnersBestOf: "BO winners", losersBestOf: "BO losers", callTimeoutMinutes: "Minutos de llamada", mkartAdvanceCount: "Clasificados", mkartLosersAdvanceCount: "Clasificados de repesca", seedingMethod: "Seeding" };
    parts.push(...Object.entries(settingLabels).filter(([key]) => state.settings[key] !== undefined).map(([key, label]) => `${label}: ${state.settings[key]}`));
  }
  return safeDiagnostic(parts.filter(Boolean).join(" · "));
}
