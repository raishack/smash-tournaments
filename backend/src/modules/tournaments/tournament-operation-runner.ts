import { AsyncLocalStorage } from "node:async_hooks";
import { assertTournamentWritable } from './tournament-archive.js';
import { createId } from "../../shared/id.js";
import type { Match } from "../../shared/types.js";
import type { TournamentsPostgresRepository } from "./tournaments.postgres-repository.js";
import { fingerprint, matchAuditState, matchRevision, operationRequest, OperationConflict, safeDiagnostic } from "./tournament-operations.js";

export class TournamentOperationRunner {
  private readonly running = new AsyncLocalStorage<boolean>();
  constructor(private readonly repository: TournamentsPostgresRepository) {}

  async execute<T>(tournamentId: string, action: string, input: Record<string, unknown>, block: () => Promise<T>): Promise<T> {
    if (this.running.getStore()) return block();
    // Lightweight repositories used by domain tests can omit persistence concerns.
    if (!this.repository.withTournamentTransaction) {
      assertTournamentWritable(await this.repository.getTournament(tournamentId));
      return block();
    }
    return this.repository.withTournamentTransaction(tournamentId, () => this.running.run(true, async () => {
      assertTournamentWritable(await this.repository.getTournament(tournamentId));
      const request = operationRequest.getStore() ?? {};
      const key = fingerprint({ action, input });
      if (request.id) {
        const previous = await this.repository.getOperation(tournamentId, request.id);
        if (previous) {
          if (previous.fingerprint !== key) throw new OperationConflict("Esta operación ya se usó con otros datos. Recarga el torneo.");
          return previous.result as T;
        }
      }
      const matchId = typeof input.matchId === "string" ? input.matchId : undefined;
      const expectedRevision = (input.input as { expectedRevision?: string } | undefined)?.expectedRevision ?? request.expectedRevision;
      const beforeMatch = matchId ? (await this.repository.listMatches(tournamentId)).find(m => m.id === matchId) : undefined;
      if (matchId && expectedRevision && (!beforeMatch || matchRevision(beforeMatch) !== expectedRevision)) {
        throw new OperationConflict("Este match cambió desde otro dispositivo. Recarga y revisa el resultado antes de volver a guardar.");
      }
      const before = matchId ? matchAuditState(beforeMatch) : await this.summary(tournamentId, action);
      let result = await block();
      const afterMatch = matchId ? (await this.repository.listMatches(tournamentId)).find(m => m.id === matchId) : undefined;
      if (afterMatch && result && typeof result === "object" && "participants" in result) {
        result = { ...result, operationRevision: matchRevision(afterMatch) };
      }
      await this.repository.appendActivity({
        id: createId("act"), tournamentId, matchId, action, createdAt: new Date().toISOString(),
        platform: safeDiagnostic(request.platform || "backend"), appVersion: safeDiagnostic(request.appVersion),
        before, after: matchId ? matchAuditState(afterMatch) : await this.summary(tournamentId, action),
      });
      if (request.id) await this.repository.saveOperation(tournamentId, request.id, key, result);
      return result;
    }));
  }

  private async summary(tournamentId: string, action: string): Promise<unknown> {
    if (/Participant/.test(action)) return (await this.repository.listParticipants(tournamentId)).map(p => ({ id: p.id, name: p.displayName, seed: p.seed, status: p.status }));
    const tournament = await this.repository.getTournament(tournamentId);
    return tournament ? { title: tournament.title, status: tournament.status, settings: tournament.settings } : null;
  }
}
