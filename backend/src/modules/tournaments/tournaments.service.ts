import { inspect } from "node:util";
import { tournamentReview } from './tournament-review.js';
import { assertTournamentWritable } from './tournament-archive.js';
import { nickKey, teamSettings } from '../teams/team-types.js';
import { fortniteConfig, fortniteSummary } from '../fortnite/fortnite-model.js';
import { TournamentOperationRunner } from "./tournament-operation-runner.js";
import { actionLabels, describeAuditState, matchRevision, safeDiagnostic, stableJson, type SyncJob } from "./tournament-operations.js";
import { withBracketLabels } from "./bracket-labels.js";
import { createId } from "../../shared/id.js";
import type {
  Match,
  MatchCharacterSelection,
  MatchGameCharacterSelections,
  MatchParticipant,
  MatchStatus,
  Tournament,
  TournamentParticipant,
} from "../../shared/types.js";
import type {
  CallMatchInput,
  CreateParticipantInput,
  CreateTournamentInput,
  ImportStartggEventInput,
  RecordGameWinInput,
  ReportDetailedResultInput,
  ResolveAbsenceInput,
  ReportResultInput,
  StartggPreviewInput,
  SelectMkAdvancerInput,
  StartMatchInput,
  UpdateMatchCharactersInput,
  UpdateParticipantInput,
  UpdateTournamentInput,
} from "./tournament.schemas.js";
import { NoopTournamentNotifier, type TournamentNotifier } from "./tournament-notifier.js";
import { TournamentsPostgresRepository } from "./tournaments.postgres-repository.js";
import { NoopStartggClient, type StartggImportedBracket, type StartggMirroredMatch, type StartggMirroredSourceRef, type StartggMutationSyncResult, type StartggSyncClient } from "./startgg.client.js";
import { resolveRoa2Character } from "./roa2.characters.js";
import { resolveSmashUltimateCharacter } from "./smash-ultimate.characters.js";

function hasStartggParticipantRef(
  participant: TournamentParticipant,
): participant is TournamentParticipant & { externalRef: NonNullable<TournamentParticipant["externalRef"]> } {
  return participant.externalRef?.provider === "START_GG";
}

function hasStartggMatchRef(
  match: Match,
): match is Match & { externalRef: NonNullable<Match["externalRef"]> } {
  return match.externalRef?.provider === "START_GG";
}

export class TournamentsService {
  private ladderCoordinator?: (id: string, match: Match, station?: string) => Promise<void>;
  setLadderCoordinator(coordinator: (id: string, match: Match, station?: string) => Promise<void>): void { this.ladderCoordinator = coordinator; }

  private readonly operations: TournamentOperationRunner;
  private static readonly STARTGG_SNAPSHOT_STABILIZATION_ATTEMPTS = 4;
  private static readonly STARTGG_SNAPSHOT_STABILIZATION_DELAY_MS = 1000;
  private static readonly STARTGG_ACTION_RETRY_ATTEMPTS = 4;
  private static readonly STARTGG_ACTION_RETRY_DELAY_MS = 1500;
  private readonly activeManualStartggImports = new Map<string, Promise<Awaited<ReturnType<TournamentsService["getTournamentOverview"]>>>>();
  private readonly startggActionQueues = new Map<string, Promise<void>>();
  private readonly pendingStartggActionKeys = new Map<string, Set<string>>();
  private readonly startggDebug = process.env.STARTGG_DEBUG_SYNC === "1";

  constructor(
    private readonly repository: TournamentsPostgresRepository,
    private readonly notifier: TournamentNotifier = new NoopTournamentNotifier(),
    private readonly startggClient: StartggSyncClient = new NoopStartggClient(),
  ) { this.operations = new TournamentOperationRunner(repository); }

  async listTournaments(includeArchived = false): Promise<Tournament[]> {
    return (await this.repository.listTournaments()).filter(t => includeArchived || t.status !== 'ARCHIVED');
  }

  async setArchived(tournamentId: string, archived: boolean): Promise<Tournament> {
    return this.repository.withTournamentTransaction(tournamentId, async () => {
      const tournament = await this.repository.getTournament(tournamentId);
      if (!tournament) throw new Error('Tournament not found');
      if (archived && tournament.status === 'ARCHIVED') return tournament;
      if (!archived && tournament.status !== 'ARCHIVED') throw new Error('Este torneo no está archivado');
      if (archived) {
        if (tournament.status !== 'COMPLETED') throw new Error('Solo se pueden archivar torneos completados');
        this.ensureImportFinished(tournament);
        if (this.activeManualStartggImports.has(tournamentId)) throw new Error('Espera a que termine la importación');
        const matches = await this.repository.listMatches(tournamentId);
        if ((await this.repository.listSyncJobs(tournamentId)).some(j => ['PENDING','RUNNING'].includes(j.state)
          || (j.state === 'FAILED' && matches.some(m => m.id === j.matchId && (m.externalRef?.localSyncVersion ?? 0) === j.version)))) {
          throw new Error('Resuelve los envíos pendientes o fallidos a start.gg antes de archivar');
        }
        if (await this.repository.hasActiveLadder(tournamentId)) throw new Error('Finaliza la ladder antes de archivar el torneo');
      }
      const updated: Tournament = { ...tournament, status: archived ? 'ARCHIVED' : 'COMPLETED',
        settings: { ...tournament.settings, displayEnabled: false, registrationEnabled: false }, updatedAt: new Date().toISOString() };
      await this.repository.saveTournament(updated);
      await this.repository.appendActivity({id:createId('act'),tournamentId,action:archived?'archiveTournament':'unarchiveTournament',
        createdAt:updated.updatedAt,platform:'management',before:{status:tournament.status},after:{status:updated.status}});
      return updated;
    });
  }

  async isImporting(tournamentId: string): Promise<boolean> {
    return (await this.repository.getTournament(tournamentId))?.settings.importJob?.state === "RUNNING";
  }

  async getReview(tournamentId: string) {
    return this.inTournamentTransaction(tournamentId, async () => {
      const overview = await this.getTournamentOverview(tournamentId);
      if (!overview) return undefined;
      const [members, registrations, jobs, fortnite, activeLadder] = await Promise.all([
        this.repository.listTeamMembers(tournamentId), this.repository.listRegistrations(tournamentId),
        this.repository.listSyncJobs(tournamentId), this.repository.getFortniteState(tournamentId),
        this.repository.hasActiveLadder(tournamentId),
      ]);
      return tournamentReview({ ...overview, members, registrations, jobs, fortnite, activeLadder,
        importing: overview.tournament.settings.importJob?.state === 'RUNNING' || this.activeManualStartggImports.has(tournamentId) });
    }, true);
  }

  async deleteTournament(tournamentId: string): Promise<void> {
    return this.inTournamentTransaction(tournamentId, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    if (tournament.settings.importJob?.state === "RUNNING") throw new Error("Espera a que termine la importacion");
    assertTournamentWritable(tournament);

    await this.repository.replaceMatches(tournamentId, []);
    await this.repository.replaceParticipants(tournamentId, []);
    await this.repository.deleteTournament(tournamentId);

    });
  }

  async getTournamentOverview(tournamentId: string) {
    return this.inTournamentTransaction(tournamentId, async () => {
    let tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      return undefined;
    }

    const [participants, storedMatches] = await Promise.all([
      this.repository.listParticipants(tournamentId), this.repository.listMatches(tournamentId),
    ]);
    let matches = storedMatches;
    // Older reset operations cleared unrelated byes. Reconcile only deterministic
    // local passes under the tournament lock; never replay results or notifications.
    if (this.hasLocalStandardBracket(tournament) && ['READY', 'IN_PROGRESS'].includes(tournament.status)) {
      matches = this.resolveDependentParticipantsFromLocalMatches(storedMatches, true);
      const repaired = matches.some((match, index) => match !== storedMatches[index]);
      const completed = tournament.status === 'IN_PROGRESS' && this.isTournamentComplete(matches);
      if (repaired) await this.repository.replaceMatches(tournamentId, matches);
      if (completed) {
        tournament = { ...tournament, status: 'COMPLETED', updatedAt: new Date().toISOString() };
        await this.repository.saveTournament(tournament);
      }
      if ((repaired || completed) && this.repository.appendActivity) {
        await this.repository.appendActivity({ id: createId('act'), tournamentId,
          action: 'repairLocalAutomaticAdvances', createdAt: new Date().toISOString(), platform: 'backend',
          before: { status: completed ? 'IN_PROGRESS' : tournament.status },
          after: { status: tournament.status, repairedMatchIds: matches.filter((match, index) => match !== storedMatches[index]).map(match => match.id) },
        });
      }
    }
    const jobs = this.repository.listSyncJobs ? await this.repository.listSyncJobs(tournamentId) : [];
    const fortnite = tournament.settings.bracketMode === 'FORTNITE' ? fortniteSummary(await this.repository.getFortniteState(tournamentId)) : undefined;
    const visibleTournament = tournament.settings.registrationClosesAt && Date.parse(tournament.settings.registrationClosesAt) <= Date.now()
      ? {...tournament, settings:{...tournament.settings, registrationEnabled:false}} : tournament;
    return { tournament: visibleTournament, participants, fortnite, matches: withBracketLabels(matches, tournament.settings.format).map(match => ({
      ...match, operationRevision: matchRevision(match), syncStatus: this.describeSyncStatus(tournament, match, jobs),
    })) };

    }, true);
  }

  private async inTournamentTransaction<T>(tournamentId: string, action: () => Promise<T>, readOnly = false): Promise<T> {
    const checked = async () => {
      if (!readOnly) assertTournamentWritable(await this.repository.getTournament(tournamentId));
      return action();
    };
    return this.repository.withTournamentTransaction ? this.repository.withTournamentTransaction(tournamentId, checked) : checked();
  }

  private async updateStoredMatches(tournamentId: string, transform: (matches: Match[]) => Match[]): Promise<Match[]> {
    return this.inTournamentTransaction(tournamentId, async () => {
      assertTournamentWritable(await this.repository.getTournament(tournamentId));
      const updated = transform(await this.repository.listMatches(tournamentId));
      await this.repository.replaceMatches(tournamentId, updated);
      return updated;
    });
  }

  private describeSyncStatus(tournament: Tournament, match: Match, jobs: SyncJob[]): Match["syncStatus"] {
    if (!this.isMirroredStartggMatch(tournament, match)) return undefined;
    const version = match.externalRef?.localSyncVersion ?? 0;
    const job = jobs.filter(j => j.matchId === match.id && j.version === version).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!tournament.importSource?.syncResults) return { state: "LOCAL", message: "Guardado en la app · sincronización desactivada" };
    if (job?.state === "FAILED") return { state: "FAILED", message: "No se pudo sincronizar con start.gg", error: job.error, updatedAt: job.updatedAt, canRetry: true };
    if (job && (job.state === "PENDING" || job.state === "RUNNING")) return { state: "PENDING", message: "Guardado en la app · pendiente de start.gg", updatedAt: job.updatedAt };
    if (version > (match.externalRef?.syncedSyncVersion ?? 0)) return { state: "LOCAL", message: "Guardado en la app" };
    return { state: "SYNCED", message: "Confirmado en start.gg", updatedAt: match.externalRef?.resultSyncedAt ?? job?.updatedAt };
  }

  async getActivity(tournamentId: string) {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) throw new Error("Tournament not found");
    const events = await this.repository.listActivity(tournamentId);
    const jobs = await this.repository.listSyncJobs(tournamentId);
    const labels = new Map(withBracketLabels(await this.repository.listMatches(tournamentId), tournament.settings.format).map(m => [m.id, m.displayLabel]));
    const entries = events.map(event => ({
      id: event.id, createdAt: event.createdAt, matchId: event.matchId, matchLabel: event.matchId ? labels.get(event.matchId) ?? "Match eliminado" : undefined, summary: actionLabels[event.action] ?? event.action,
      detail: [event.platform ? `${event.platform} ${event.appVersion ?? ""}`.trim() : "backend",
        event.before !== undefined ? `Antes: ${describeAuditState(event.before)}` : "",
        event.after !== undefined ? `Después: ${describeAuditState(event.after)}` : "",
        event.error ? `Error: ${safeDiagnostic(event.error)}` : ""].filter(Boolean).join("\n"),
    }));
    const diagnosticText = ["Diagnóstico del torneo", `Fecha: ${new Date().toISOString()}`, `Torneo: ${tournament.id}`,
      `Estado: ${tournament.status}`, `Importación: ${safeDiagnostic(stableJson(tournament.settings.importJob ?? {}))}`,
      ...jobs.filter(j => j.state !== "SYNCED" && j.state !== "SUPERSEDED").map(j => `Sync ${j.matchId}: ${j.state}; intentos ${j.attempts}; ${safeDiagnostic(j.error)}`),
      "Historial (últimas 200 operaciones):", ...entries.map(e => `${e.createdAt} ${e.matchId ?? ""} ${e.summary}\n${e.detail}`),
    ].join("\n");
    return { entries, diagnosticText };
  }

  async resumePendingSyncs(): Promise<void> {
    for (const job of await this.repository.listSyncJobs()) await this.dispatchSyncJob(job);
  }

  async retrySync(tournamentId: string, matchId: string): Promise<{ queued: boolean }> {
    return this.operations.execute(tournamentId, "sync-retry", { matchId }, async () => {
      const context = await this.getMirroredSyncContext(tournamentId, matchId);
      if (!context) throw new Error("Match not found");
      this.ensureImportFinished(context.tournament);
      const job = (await this.repository.listSyncJobs(tournamentId)).find(j => j.matchId === matchId && j.version === context.match.externalRef?.localSyncVersion && j.state === "FAILED");
      if (!job) return { queued: false };
      await this.repository.saveSyncJob({ ...job, state: "PENDING", error: undefined, updatedAt: new Date().toISOString() });
      await this.dispatchSyncJob(job);
      return { queued: true };
    });
  }

  private async dispatchSyncJob(job: SyncJob): Promise<void> {
    if (job.action === "set-call") await this.enqueueMirroredStartggSetCall(job.tournamentId, job.matchId, job.version);
    else if (job.action === "set-start") await this.enqueueMirroredStartggSetStarted(job.tournamentId, job.matchId, job.version);
    else if (job.action === "set-reset") await this.enqueueMirroredStartggSetReset(job.tournamentId, job.matchId, job.version);
    else {
      const context = await this.getMirroredSyncContext(job.tournamentId, job.matchId);
      if (context) await this.enqueueMirroredStartggMatchCompletion(job.tournamentId, context.match, job.version);
    }
  }

  async createTournament(input: CreateTournamentInput, importJob?: Tournament["settings"]["importJob"]): Promise<Tournament> {
    const now = new Date().toISOString();
    const settings = this.normalizeSettings({ ...input.settings, importJob });
    const tournament: Tournament = {
      id: createId("tor"),
      ownerId: input.ownerId,
      title: input.title,
      gameTitle: input.gameTitle,
      description: input.description,
      platform: input.platform,
      status: "DRAFT",
      startsAt: input.startsAt,
      maxParticipants: input.maxParticipants,
      isPublic: input.isPublic,
      settings,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.saveTournament(tournament);
    return tournament;
  }

  async previewStartggImport(input: StartggPreviewInput) {
    return this.startggClient.previewEventImport(input.eventUrl);
  }

  async createStartggImport(input: ImportStartggEventInput & { setupCount: number; streamCount?: number; callTimeoutMinutes: number; playerMatchReportingEnabled: boolean }) {
    const tournament = await this.createTournament({
      ownerId: "local-organizer", title: "Importando torneo de start.gg", gameTitle: "start.gg",
      description: "Importacion de start.gg", platform: "start.gg", startsAt: new Date().toISOString(),
      maxParticipants: 2, isPublic: true,
      settings: { format: "SINGLE_ELIMINATION", bestOf: 3, hasThirdPlaceMatch: false,
        checkInRequired: false, allowRematchReview: true, seedingMethod: "MANUAL",
        autoCallMatches: false, manualSeedingLocked: false, setupCount: input.setupCount, streamCount: input.streamCount ?? 0,
        callTimeoutMinutes: input.callTimeoutMinutes, playerMatchReportingEnabled: input.playerMatchReportingEnabled },
    }, {
      eventUrl: input.eventUrl, syncResults: input.syncResults,
      preserveTournamentTitle: input.preserveTournamentTitle, state: "RUNNING", updatedAt: new Date().toISOString(),
    });
    // Save the pending job with the placeholder so a restart cannot orphan it.
    this.launchBackgroundImport(tournament.id, input);
    return (await this.getTournamentOverview(tournament.id))!;
  }

  async startBackgroundImport(tournamentId: string, input: ImportStartggEventInput) {
    return this.inTournamentTransaction(tournamentId, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) throw new Error("Tournament not found");
    if (tournament.settings.importJob?.state === "RUNNING") return this.getTournamentOverview(tournamentId);
    const matches = await this.repository.listMatches(tournamentId);
    this.ensureStartggImportAllowed(tournament, matches);
    tournament.settings = { ...tournament.settings, importJob: {
      ...input, state: "RUNNING", updatedAt: new Date().toISOString(),
    } };
    await this.repository.saveTournament(tournament);
    const launch = () => this.launchBackgroundImport(tournamentId, input);
    if (this.repository.afterCommit) this.repository.afterCommit(launch); else launch();
    return this.getTournamentOverview(tournamentId);

    });
  }

  private async persistImportProgress(tournamentId: string, progress: { stage: string; message: string; completed?: number; total?: number }): Promise<void> {
    await this.inTournamentTransaction(tournamentId, async () => {
      const tournament = await this.repository.getTournament(tournamentId);
      if (tournament?.settings.importJob?.state !== "RUNNING") return;
      await this.repository.saveTournament({ ...tournament, settings: { ...tournament.settings,
        importJob: { ...tournament.settings.importJob, progress, updatedAt: new Date().toISOString() } } });
    });
  }

  async resumeBackgroundImports(): Promise<void> {
    for (const tournament of await this.repository.listTournaments()) {
      const job = tournament.settings.importJob;
      if (job?.state === "RUNNING") this.launchBackgroundImport(tournament.id, job);
    }
  }

  private launchBackgroundImport(tournamentId: string, input: ImportStartggEventInput): void {
    setImmediate(() => {
      void (async () => {
        let error: string | undefined;
        try { await this.importFromStartgg(tournamentId, input); }
        catch (cause) { error = safeDiagnostic(cause instanceof Error ? cause.message : "Import failed"); }
        await this.inTournamentTransaction(tournamentId, async () => {
        const current = await this.repository.getTournament(tournamentId);
        if (!current) return;
        current.settings = { ...current.settings, importJob: {
          ...current.settings.importJob, ...input, state: error ? "FAILED" : "COMPLETED", error, updatedAt: new Date().toISOString(),
        } };
        await this.repository.saveTournament(current);
        });
      })().catch((error) => console.error("[startgg:background-import]", tournamentId, error));
    });
  }

  async importFromStartgg(tournamentId: string, input: ImportStartggEventInput) {
    const existingImport = this.activeManualStartggImports.get(tournamentId);
    if (existingImport) {
      this.logStartggDebug("manual import joined existing request", { tournamentId, eventUrl: input.eventUrl });
      return existingImport;
    }

    const importPromise = this.runManualStartggImport(tournamentId, input);
    this.activeManualStartggImports.set(tournamentId, importPromise);
    try {
      return await importPromise;
    } finally {
      if (this.activeManualStartggImports.get(tournamentId) === importPromise) {
        this.activeManualStartggImports.delete(tournamentId);
      }
    }
  }

  private async runManualStartggImport(tournamentId: string, input: ImportStartggEventInput) {
    const startedAtMs = Date.now();
    if (this.repository.listSyncJobs) {
      for (const job of await this.repository.listSyncJobs(tournamentId)) {
        if (job.state === "PENDING" || job.state === "RUNNING") await this.dispatchSyncJob(job);
      }
    }
    await this.awaitStartggActionQueue(tournamentId);
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    const matches = await this.repository.listMatches(tournamentId);
    this.ensureStartggImportAllowed(tournament, matches);

    this.logStartggDebug("manual import requested", {
      tournamentId,
      eventUrl: input.eventUrl,
      existingMatches: matches.length,
      existingGroups: this.describeMirroredGroups(matches.filter(hasStartggMatchRef)),
    });
    if (this.repository.listSyncJobs) {
      const unfinished = (await this.repository.listSyncJobs(tournamentId)).some(job =>
        ["PENDING", "RUNNING", "FAILED"].includes(job.state) && matches.some(m => m.id === job.matchId && (m.externalRef?.localSyncVersion ?? 0) === job.version));
      if (unfinished) throw new Error("Hay envíos a start.gg pendientes o con error. Resuélvelos antes de reimportar para conservar los resultados locales.");
    }
    const snapshot = await this.loadStableStartggSnapshot(tournament, input.eventUrl, matches, {
      includeGameDetails: true,
      allowFallback: false,
      attempts: 8,
      delayMs: 1500,
      retryOnRateLimit: true,
      reason: "manual-import",
    });
    if (!snapshot) {
      this.logStartggDebug("manual import failed - no stable snapshot", {
        tournamentId,
        eventUrl: input.eventUrl,
        durationMs: Date.now() - startedAtMs,
      });
      throw new Error("Unable to load a stable start.gg snapshot right now. Please try again in a few seconds.");
    }
    await this.persistImportProgress(tournamentId, { stage: "SAVING", message: "Guardando el torneo", completed: snapshot.matches.length, total: snapshot.matches.length });
    const result = await this.applyStartggSnapshot(tournament, snapshot, {
      syncResults: input.syncResults,
      preserveTournamentTitle: input.preserveTournamentTitle,
      preserveLocalProgress: false,
    });
    if (result) {
      const resolvedMatches = this.resolveDependentParticipantsFromLocalMatches(result.matches);
      if (resolvedMatches.some((match, index) => match !== result.matches[index])) {
        await this.updateStoredMatches(tournamentId, matches => this.resolveDependentParticipantsFromLocalMatches(matches));
      }
    }
    this.logStartggDebug("manual import applied", {
      tournamentId,
      importedMatches: snapshot.matches.length,
      importedGroups: this.describeImportedGroups(snapshot.matches),
      previewSetIds: snapshot.matches.filter((match) => this.isPreviewStartggSetId(match.setId)).map((match) => match.setId),
      durationMs: Date.now() - startedAtMs,
    });
    return result;
  }

  async updateTournament(tournamentId: string, input: UpdateTournamentInput): Promise<Tournament> {
    return this.operations.execute(tournamentId, "updateTournament", { input }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    if (tournament.settings.importJob?.state === "RUNNING") throw new Error("Espera a que termine la importacion");

    if (tournament.importSource?.provider === "START_GG") {
      return this.updateMirroredStartggTournament(tournament, input);
    }

    const matches = await this.repository.listMatches(tournamentId);
    const hasStartedMatches = ["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(tournament.status)
      || matches.some((match) => this.hasRealMatchActivity(match));
    const settings = this.normalizeSettings({
      ...input.settings,
      fortniteLobbySize: input.settings.fortniteLobbySize ?? tournament.settings.fortniteLobbySize,
      fortniteGamesPerRound: input.settings.fortniteGamesPerRound ?? tournament.settings.fortniteGamesPerRound,
      teamSize: input.settings.teamSize ?? tournament.settings.teamSize,
      reserveCount: input.settings.reserveCount ?? tournament.settings.reserveCount,
      allowSoloRegistration: input.settings.allowSoloRegistration ?? tournament.settings.allowSoloRegistration,
      displayEnabled: tournament.settings.displayEnabled,
      registrationEnabled: tournament.settings.registrationEnabled,
      registrationClosesAt: tournament.settings.registrationClosesAt,
      registrationWaitlist: tournament.settings.registrationWaitlist,
      registrationUrl: tournament.settings.registrationUrl,
      streamCount: input.settings.streamCount ?? tournament.settings.streamCount ?? 0,
      importJob: tournament.settings.importJob,
      playAreaName: input.settings.playAreaName === undefined
        ? tournament.settings.playAreaName
        : input.settings.playAreaName,
    });
    if (hasStartedMatches && !this.onlyOperationalTournamentSettingsChanged(tournament, input, settings)) {
      throw new Error("Tournament options cannot be edited after matches have started");
    }
    this.ensureSetupCountCanBeApplied(settings, matches);
    if (settings.bracketMode !== tournament.settings.bracketMode && (settings.bracketMode === 'FORTNITE' || tournament.settings.bracketMode === 'FORTNITE') && (matches.length || await this.repository.getFortniteState(tournamentId))) throw new Error('Reinicia el torneo antes de cambiar su formato');
    if (tournament.settings.bracketMode === 'FORTNITE' && await this.repository.getFortniteState(tournamentId)) {
      if (settings.fortniteLobbySize !== tournament.settings.fortniteLobbySize || settings.fortniteGamesPerRound !== tournament.settings.fortniteGamesPerRound || input.maxParticipants !== tournament.maxParticipants || settings.bracketMode !== 'FORTNITE') throw new Error('Los grupos ya están sorteados. Reinicia el torneo antes de cambiar puestos, partidas o aforo');
    }
    if ((settings.teamSize ?? 1) !== (tournament.settings.teamSize ?? 1) || (settings.reserveCount ?? 0) !== (tournament.settings.reserveCount ?? 0)) {
      if (matches.length || (await this.repository.listParticipants(tournamentId)).length || (await this.repository.listTeamMembers(tournamentId)).length) throw new Error('No se puede cambiar el tamaño de plantilla cuando ya hay equipos o jugadores inscritos');
    }
    if ((await this.repository.listParticipants(tournamentId)).length > input.maxParticipants) throw new Error('El aforo no puede ser menor que el número de inscritos');
    const structuralChange = this.hasBracketStructureChange(tournament.settings, settings);
    const shouldRegenerateBracket = structuralChange
      || (input.maxParticipants > tournament.maxParticipants && matches.length > 0);

    const updatedMatches = shouldRegenerateBracket
      ? []
      : matches.map((match) => ({
          ...match,
          bestOf: this.bestOfForBracketStage(settings, match.bracketStage),
          updatedAt: new Date().toISOString(),
        }));

    const updated: Tournament = {
      ...tournament,
      title: input.title,
      gameTitle: input.gameTitle,
      description: input.description,
      platform: input.platform,
      maxParticipants: input.maxParticipants,
      settings,
      status: shouldRegenerateBracket ? "DRAFT" : tournament.status,
      updatedAt: new Date().toISOString(),
    };

    await this.repository.saveTournament(updated);
    if (!this.onlyOperationalTournamentSettingsChanged(tournament, input, settings)) {
      await this.repository.replaceMatches(tournamentId, updatedMatches);
    }
    return updated;

    });
  }

  async updateSetups(tournamentId: string, setupCount: number, streamCount?: number): Promise<Tournament> {
    return this.operations.execute(tournamentId, "updateSetups", { setupCount, streamCount }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) throw new Error("Tournament not found");
    if (tournament.settings.importJob?.state === "RUNNING") throw new Error("Espera a que termine la importacion");
    const settings = this.normalizeSettings({ ...tournament.settings, setupCount, streamCount: streamCount ?? tournament.settings.streamCount ?? 0 });
    this.ensureSetupCountCanBeApplied(settings, await this.repository.listMatches(tournamentId));
    const updated = { ...tournament, settings, updatedAt: new Date().toISOString() };
    await this.repository.saveTournament(updated);
    return updated;

    });
  }

  async addParticipant(tournamentId: string, input: CreateParticipantInput): Promise<TournamentParticipant> {
    return this.operations.execute(tournamentId, "addParticipant", { input }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureManualParticipantEditingAllowed(tournament);
    if (tournament.settings.bracketMode === 'FORTNITE' && await this.repository.getFortniteState(tournamentId)) throw new Error('Los grupos Fortnite ya están sorteados. Reinicia el torneo antes de cambiar inscritos');

    const matches = await this.repository.listMatches(tournamentId);
    this.ensureLocalDrawCanChange(tournament, matches);
    const participants = await this.repository.listParticipants(tournamentId);
    if (participants.length >= tournament.maxParticipants) {
      throw new Error("Tournament is full");
    }
    if ((tournament.settings.teamSize ?? 1) > 1) {
      if ((await this.repository.listMatches(tournamentId)).length) throw new Error('Añade equipos antes de generar la bracket');
      if (participants.some(p => nickKey(p.displayName) === nickKey(input.displayName))) throw new Error('Ya hay un equipo con ese nombre');
    }

    const participant: TournamentParticipant = {
      id: createId("par"),
      tournamentId,
      userId: input.userId,
      displayName: input.displayName,
      seed: input.seed,
      checkedIn: false,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };

    await this.repository.replaceParticipants(tournamentId, [...participants, participant]);
    if (matches.length) {
      await this.repository.replaceMatches(tournamentId, []);
      await this.repository.saveTournament({ ...tournament, status: "DRAFT", updatedAt: new Date().toISOString() });
    }
    if ((tournament.settings.teamSize ?? 1) > 1) await this.repository.ensureTeamCode(tournamentId,participant.id);
    return participant;

    });
  }

  async updateAttendance(tournamentId: string, participantId: string, checkedIn: boolean) {
    return this.inTournamentTransaction(tournamentId, async () => {
      const participant = (await this.repository.listParticipants(tournamentId)).find(p => p.id === participantId);
      if (!participant) throw new Error('Participant not found');
      // Read the current name inside the same transaction; a stale review must not undo an edit.
      return this.updateParticipant(tournamentId, participantId, { displayName: participant.displayName, checkedIn, clearSeed: false });
    });
  }

  async updateParticipant(
    tournamentId: string,
    participantId: string,
    input: UpdateParticipantInput,
  ): Promise<TournamentParticipant> {
    return this.operations.execute(tournamentId, "updateParticipant", { participantId, input }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureManualParticipantEditingAllowed(tournament);
    if (tournament.settings.bracketMode === 'FORTNITE' && await this.repository.getFortniteState(tournamentId)) throw new Error('Los grupos Fortnite ya están sorteados. Reinicia el torneo antes de cambiar inscritos');

    const matches = await this.repository.listMatches(tournamentId);
    const participants = await this.repository.listParticipants(tournamentId);
    const participant = participants.find((item) => item.id === participantId);
    if (!participant) {
      throw new Error("Participant not found");
    }

    if ((tournament.settings.teamSize ?? 1) > 1 && participants.some(p => p.id !== participantId && nickKey(p.displayName) === nickKey(input.displayName))) throw new Error('Ya hay un equipo con ese nombre');

    const nextSeed = input.clearSeed || input.seed === null ? undefined : input.seed ?? participant.seed;
    const seedChanged = nextSeed !== participant.seed;

    const updated: TournamentParticipant = {
      ...participant,
      displayName: input.displayName,
      seed: nextSeed,
      checkedIn: input.checkedIn ?? participant.checkedIn,
      status: input.status ?? participant.status,
    };
    const eligibilityChanged = this.isLocalDrawParticipant(tournament, participant) !== this.isLocalDrawParticipant(tournament, updated);
    if (seedChanged || eligibilityChanged) this.ensureLocalDrawCanChange(tournament, matches);

    await this.repository.replaceParticipants(
      tournamentId,
      participants.map((item) => (item.id === participantId ? updated : item)),
    );
    if ((seedChanged || eligibilityChanged) && matches.length) {
      await this.repository.replaceMatches(tournamentId, []);
      await this.repository.saveTournament({ ...tournament, status: "DRAFT", updatedAt: new Date().toISOString() });
    } else if (updated.displayName !== participant.displayName && matches.length) {
      await this.repository.replaceMatches(tournamentId, matches.map(match => ({
        ...match,
        participants: match.participants.map(slot => slot.participantId === participantId
          ? { ...slot, displayName: updated.displayName } : slot),
      })));
    }
    return updated;

    });
  }

  async deleteParticipant(tournamentId: string, participantId: string): Promise<void> {
    return this.operations.execute(tournamentId, "deleteParticipant", { participantId }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureManualParticipantEditingAllowed(tournament);
    if (tournament.settings.bracketMode === 'FORTNITE' && await this.repository.getFortniteState(tournamentId)) throw new Error('Los grupos Fortnite ya están sorteados. Reinicia el torneo antes de cambiar inscritos');

    const participants = await this.repository.listParticipants(tournamentId);
    const participant = participants.find((item) => item.id === participantId);
    if (!participant) {
      throw new Error("Participant not found");
    }

    const matches = await this.repository.listMatches(tournamentId);
    this.ensureLocalDrawCanChange(tournament, matches);

    const updatedParticipants = participants.filter((item) => item.id !== participantId);
    if ((tournament.settings.teamSize ?? 1) > 1) await this.repository.disbandTeam(tournamentId,participantId);
    await this.repository.replaceParticipants(tournamentId, updatedParticipants);
    await this.repository.replaceMatches(tournamentId, []);
    await this.repository.saveTournament({
      ...tournament,
      status: "DRAFT",
      updatedAt: new Date().toISOString(),
    });

    });
  }

  async resetTournament(tournamentId: string): Promise<Tournament> {
    return this.operations.execute(tournamentId, "resetTournament", {  }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureImportFinished(tournament);
    if (tournament.importSource?.provider === "START_GG") {
      throw new Error("Mirrored start.gg tournaments must be refreshed from start.gg instead of reset locally");
    }

    const participants = await this.repository.listParticipants(tournamentId);
    const resetParticipants = participants.map((participant) => ({
      ...participant,
      checkedIn: false,
      status: "ACTIVE" as const,
    }));
    const updatedTournament: Tournament = {
      ...tournament,
      status: "DRAFT",
      updatedAt: new Date().toISOString(),
    };

    await this.repository.replaceParticipants(tournamentId, resetParticipants);
    if (tournament.settings.bracketMode === 'FORTNITE') await this.repository.deleteFortniteState(tournamentId);
    await this.repository.replaceMatches(tournamentId, []);
    await this.repository.saveTournament(updatedTournament);
    return updatedTournament;

    });
  }

  async startTournament(tournamentId: string): Promise<Tournament> {
    return this.operations.execute(tournamentId, "startTournament", {  }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureImportFinished(tournament);
    if (tournament.settings.bracketMode === 'FORTNITE') throw new Error('Inicia las partidas desde el panel Fortnite');

    const matches = await this.repository.listMatches(tournamentId);
    if (matches.length === 0) {
      throw new Error("Generate the bracket before starting the tournament");
    }
    if (tournament.status === "IN_PROGRESS") {
      return tournament;
    }
    if (tournament.status === "COMPLETED" || tournament.status === "CANCELLED") {
      throw new Error("Completed or cancelled tournaments cannot be started again");
    }

    const updatedTournament: Tournament = {
      ...tournament,
      status: "IN_PROGRESS",
      updatedAt: new Date().toISOString(),
    };

    await this.repository.saveTournament(updatedTournament);
    await this.notifySafely("tournament-started", () => this.notifier.notifyTournamentStarted(updatedTournament, matches));
    return updatedTournament;

    });
  }

  async generateBracket(tournamentId: string): Promise<Match[]> {
    return this.operations.execute(tournamentId, "generateBracket", {  }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureImportFinished(tournament);
    if (tournament.settings.bracketMode === 'FORTNITE') throw new Error('Genera los grupos desde el panel Fortnite');
    if (tournament.importSource?.provider === "START_GG") {
      throw new Error("Mirrored start.gg tournaments already use the bracket imported from start.gg");
    }

    this.ensureLocalDrawCanChange(tournament, await this.repository.listMatches(tournamentId));
    const participants = (await this.repository.listParticipants(tournamentId))
      .filter(participant => this.isLocalDrawParticipant(tournament, participant));
    if (participants.length < 2) {
      throw new Error("Se necesitan al menos dos participantes activos con asistencia confirmada cuando se exige check-in");
    }
    const settings = this.normalizeSettings({ ...tournament.settings, registrationEnabled: false });
    if ((settings.teamSize ?? 1) > 1) {
      const members = await this.repository.listTeamMembers(tournamentId);
      const incomplete = participants.filter(p => members.filter(m => m.teamId === p.id && m.role === 'PLAYER').length !== settings.teamSize
        || members.filter(m => m.teamId === p.id && m.role === 'RESERVE').length > (settings.reserveCount ?? 0));
      if (incomplete.length) throw new Error('Completa las plantillas antes de generar la bracket: ' + incomplete.map(p => p.displayName).join(', '));
    }
    const seededParticipants = tournament.importSource?.provider === "START_GG"
      ? this.seedParticipants(participants, "MANUAL")
      : this.seedParticipants(participants, tournament.settings.seedingMethod);
    const matches = settings.bracketMode === "MKART"
      ? settings.format === "DOUBLE_ELIMINATION"
        ? this.buildMarioKartDoubleEliminationBracket(tournamentId, seededParticipants, settings)
        : this.buildMarioKartBracket(tournamentId, seededParticipants, settings)
      : settings.format === "DOUBLE_ELIMINATION"
        ? this.buildDoubleEliminationBracket(tournamentId, seededParticipants, settings)
        : this.buildSingleEliminationBracket(tournamentId, seededParticipants, settings);

    await this.repository.replaceMatches(tournamentId, matches);
    const updatedTournament: Tournament = {
      ...tournament,
      settings,
      status: "READY",
      updatedAt: new Date().toISOString(),
    };
    await this.repository.saveTournament(updatedTournament);
    return matches;

    });
  }

  async callMatch(tournamentId: string, matchId: string, input: CallMatchInput): Promise<Match> {
    return this.operations.execute(tournamentId, "callMatch", { matchId, input }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureTournamentStarted(tournament);

    const matches = await this.repository.listMatches(tournamentId);
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    if (match.status !== "PENDING" && match.status !== "CALLED") {
      throw new Error("Solo se puede llamar a un match pendiente o ya llamado. Recarga el torneo");
    }
    this.ensureMatchHasResolvedContenders(match);
    this.ensureMirroredStartggSetIsEditable(tournament, match);
    const stationLabel = this.normalizeSetupLabel(input.stationLabel);
    this.ensureSetupAvailable(tournament, matches, matchId, stationLabel);
    await this.ladderCoordinator?.(tournamentId, match, stationLabel);

    const updatedMatch: Match = this.withMirroredLocalMutation({
      ...match,
      status: "CALLED",
      call: {
        calledAt: new Date().toISOString(),
        calledByUserId: input.calledByUserId,
        stationLabel,
      },
      updatedAt: new Date().toISOString(),
    });

    await this.repository.replaceMatches(
      tournamentId,
      matches.map((item) => (item.id === matchId ? updatedMatch : item)),
    );
    if (this.isMirroredStartggMatch(tournament, match)) {
      await this.enqueueMirroredStartggSetCall(tournament.id, match.id, this.getMirroredLocalSyncVersion(updatedMatch));
    }
    await this.notifySafely("match-called", () => this.notifier.notifyMatchCalled(tournament, updatedMatch));
    return updatedMatch;

    });
  }

  async cancelMatchCall(tournamentId: string, matchId: string): Promise<Match> {
    return this.operations.execute(tournamentId, "cancelMatchCall", { matchId }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureTournamentStarted(tournament);

    const matches = await this.repository.listMatches(tournamentId);
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    if (match.status !== "CALLED" || match.call?.startedAt) {
      throw new Error("Solo se puede cancelar una llamada antes de iniciar el match. Recarga el torneo");
    }

    const updatedMatch: Match = {
      ...match,
      status: "PENDING",
      call: undefined,
      updatedAt: new Date().toISOString(),
    };

    await this.repository.replaceMatches(
      tournamentId,
      matches.map((item) => (item.id === matchId ? updatedMatch : item)),
    );
    return updatedMatch;

    });
  }

  async startMatch(tournamentId: string, matchId: string, input: StartMatchInput): Promise<Match> {
    return this.operations.execute(tournamentId, "startMatch", { matchId, input }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureTournamentStarted(tournament);

    const matches = await this.repository.listMatches(tournamentId);
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    if (match.status !== "PENDING" && match.status !== "CALLED") {
      throw new Error("Solo se puede iniciar un match pendiente o llamado. Recarga el torneo");
    }
    this.ensureMatchHasResolvedContenders(match);

    const updatedMatch: Match = this.withMirroredLocalMutation({
      ...match,
      status: "PLAYING",
      call: {
        calledAt: match.call?.calledAt ?? new Date().toISOString(),
        calledByUserId: match.call?.calledByUserId ?? input.startedByUserId,
        stationLabel: match.call?.stationLabel,
        startedAt: new Date().toISOString(),
        startedByUserId: input.startedByUserId,
      },
      updatedAt: new Date().toISOString(),
    });

    await this.ladderCoordinator?.(tournamentId, match, match.call?.stationLabel);
    const progressedMatches = matches.map((item) => (item.id === matchId ? updatedMatch : item));
    await this.repository.replaceMatches(tournamentId, progressedMatches);
    if (this.isMirroredStartggMatch(tournament, match)) {
      await this.enqueueMirroredStartggSetStarted(tournament.id, match.id, this.getMirroredLocalSyncVersion(updatedMatch));
    }
    return updatedMatch;

    });
  }

  async updateMatchCharacters(
    tournamentId: string,
    matchId: string,
    input: UpdateMatchCharactersInput,
  ): Promise<Match> {
    return this.operations.execute(tournamentId, "updateMatchCharacters", { matchId, input }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureImportFinished(tournament);
    if (!this.supportsSmashCharacterReporting(tournament)) {
      throw new Error("Character reporting is only available for supported start.gg tournaments");
    }

    const matches = await this.repository.listMatches(tournamentId);
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    this.ensureMatchHasResolvedContenders(match);

    const nextSelections = this.normalizeDetailedGameSelections(tournament, match, input.selections);

    const updatedMatch: Match = this.withMirroredLocalMutation({
      ...match,
      characterSelections: nextSelections,
      updatedAt: new Date().toISOString(),
    });
    await this.repository.replaceMatches(
      tournamentId,
      matches.map((item) => (item.id === matchId ? updatedMatch : item)),
    );
    return updatedMatch;

    });
  }

  async recordGameWin(tournamentId: string, matchId: string, input: RecordGameWinInput): Promise<Match> {
    return this.operations.execute(tournamentId, "recordGameWin", { matchId, input }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureTournamentStarted(tournament);

    const matches = await this.repository.listMatches(tournamentId);
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    this.ensureMatchHasResolvedContenders(match);
    this.ensureMirroredStartggSetIsEditable(tournament, match);
    if (match.status === "COMPLETED" || match.status === "WALKOVER" || match.status === "CANCELLED") {
      throw new Error("Completed matches cannot be edited from game wins");
    }

    const participant = match.participants.find((item) => item.participantId === input.participantId);
    if (!participant) {
      throw new Error("Participant not found in match");
    }

    const winsNeeded = Math.floor((match.reportedBestOf ?? match.bestOf) / 2) + 1;
    const updatedParticipants = match.participants.map((item) =>
      item.participantId === input.participantId
        ? { ...item, score: item.score + 1 }
        : item,
    );
    const updatedWinner = updatedParticipants.find((item) => item.score >= winsNeeded);

    const updatedMatch: Match = this.withMirroredLocalMutation({
      ...match,
      status: updatedWinner ? "COMPLETED" : "PLAYING",
      winnerParticipantId: updatedWinner?.participantId,
      gameResults: [...(match.gameResults ?? []), input.participantId],
      gameCharacterSelections: [
        ...(match.gameCharacterSelections ?? []),
        {
          gameNum: (match.gameResults?.length ?? 0) + 1,
          selections: (match.characterSelections ?? []).map((selection) => ({ ...selection })),
        },
      ],
      participants: updatedParticipants,
      call: match.call
        ? {
            ...match.call,
            startedAt: match.call.startedAt ?? new Date().toISOString(),
          }
        : undefined,
      updatedAt: new Date().toISOString(),
    });

    if (!updatedWinner) {
      await this.repository.replaceMatches(
        tournamentId,
        matches.map((item) => (item.id === matchId ? updatedMatch : item)),
      );
      const updatedTournament: Tournament = {
        ...tournament,
        status: "IN_PROGRESS",
        updatedAt: new Date().toISOString(),
      };
      await this.repository.saveTournament(updatedTournament);
      return updatedMatch;
    }

    if (this.isMirroredStartggMatch(tournament, match)) {
      const resetMatches = this.resetDependentMatches(matches, match.id, match.winnerParticipantId);
      const resolution = await this.applyMatchResolution(
        tournament.id,
        tournament,
        resetMatches,
        updatedMatch,
        { skipExternalSync: true },
      );
      await this.notifyResolutionEffects(resolution.tournament, resolution.matches, updatedMatch);
      const completionSnapshot = resolution.matches.find((item) => item.id === match.id) ?? updatedMatch;
      await this.enqueueMirroredStartggMatchCompletion(
        tournament.id,
        completionSnapshot,
        this.getMirroredLocalSyncVersion(updatedMatch),
      );
      return completionSnapshot;
    }

    const resetMatches = this.resetDependentMatches(
      matches,
      match.id,
      match.winnerParticipantId,
    );
    const resolution = await this.applyMatchResolution(tournamentId, tournament, resetMatches, updatedMatch);
    await this.notifyResolutionEffects(resolution.tournament, resolution.matches, updatedMatch);
    return updatedMatch;

    });
  }

  async selectMarioKartAdvancer(
    tournamentId: string,
    matchId: string,
    input: SelectMkAdvancerInput,
  ): Promise<Match> {
    return this.operations.execute(tournamentId, "selectMarioKartAdvancer", { matchId, input }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureTournamentStarted(tournament);
    const settings = this.normalizeSettings(tournament.settings);
    if (settings.bracketMode !== "MKART") {
      throw new Error("This tournament is not using MKART mode");
    }

    const matches = await this.repository.listMatches(tournamentId);
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    this.ensureMatchHasResolvedContenders(match);
    this.ensureMirroredStartggSetIsEditable(tournament, match);
    if (match.status === "COMPLETED" || match.status === "WALKOVER" || match.status === "CANCELLED") {
      throw new Error("Completed matches cannot be edited");
    }
    if (!match.call?.startedAt && match.status !== "PLAYING") {
      throw new Error("Match must be started before selecting advancers");
    }

    const participant = match.participants.find((item) => item.participantId === input.participantId);
    if (!participant) {
      throw new Error("Participant not found in match");
    }

    const currentAdvancers = [...(match.advancingParticipantIds ?? [])];
    if (currentAdvancers.includes(input.participantId)) {
      throw new Error("This participant is already marked as advanced");
    }
    if (currentAdvancers.length >= match.advancersRequired) {
      throw new Error("All advancers for this match are already selected");
    }

    const nextAdvancers = [...currentAdvancers, input.participantId];
    const updatedMatch: Match = this.withMirroredLocalMutation({
      ...match,
      status: nextAdvancers.length >= match.advancersRequired ? "COMPLETED" : "PLAYING",
      advancingParticipantIds: nextAdvancers,
      winnerParticipantId: match.advancersRequired === 1 ? nextAdvancers[0] : undefined,
      participants: match.participants.map((item) => ({
        ...item,
        score: nextAdvancers.includes(item.participantId) ? 1 : 0,
      })),
      call: match.call
        ? {
            ...match.call,
            startedAt: match.call.startedAt ?? new Date().toISOString(),
          }
        : undefined,
      updatedAt: new Date().toISOString(),
    });

    if (updatedMatch.status !== "COMPLETED") {
      await this.repository.replaceMatches(
        tournamentId,
        matches.map((item) => (item.id === matchId ? updatedMatch : item)),
      );
      await this.repository.saveTournament({
        ...tournament,
        status: "IN_PROGRESS",
        updatedAt: new Date().toISOString(),
      });
      return updatedMatch;
    }

    const resetMatches = this.resetDependentMatches(matches, match.id, match.winnerParticipantId);
    const resolution = await this.applyMatchResolution(tournamentId, tournament, resetMatches, updatedMatch);
    await this.notifyResolutionEffects(resolution.tournament, resolution.matches, updatedMatch);
    return updatedMatch;

    });
  }

  async reportResult(tournamentId: string, matchId: string, input: ReportResultInput): Promise<Match> {
    return this.operations.execute(tournamentId, "reportResult", { matchId, input }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureTournamentStarted(tournament);

    const matches = await this.repository.listMatches(tournamentId);
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    this.ensureMatchHasResolvedContenders(match);
    this.ensureMirroredStartggSetIsEditable(tournament, match, { allowCompletedMirrored: true });

    this.validateReportedScores(match, input);
    const scoresMap = new Map(input.scores.map((score) => [score.participantId, score.score]));
    const updatedMatch: Match = this.withMirroredLocalMutation({
      ...match,
      status: "COMPLETED",
      gameResults: this.buildGameResultsFromScores(match, input.scores, input.winnerParticipantId),
      // A summary supplies no per-game character history. Keep the current
      // entrant selection, but do not reuse game rows from an earlier result.
      gameCharacterSelections: [],
      advancingParticipantIds: [input.winnerParticipantId],
      winnerParticipantId: input.winnerParticipantId,
      participants: match.participants.map((participant) => ({
        ...participant,
        score: scoresMap.get(participant.participantId) ?? participant.score,
      })),
      updatedAt: new Date().toISOString(),
    });

    if (await this.persistLocalScoreCorrection(tournament, matches, match, updatedMatch)) return updatedMatch;

    if (this.isMirroredStartggMatch(tournament, match)) {
      const resetMatches = this.resetDependentMatches(
        matches,
        match.id,
        match.winnerParticipantId,
      );
      const resolution = await this.applyMatchResolution(
        tournamentId,
        tournament,
        resetMatches,
        updatedMatch,
        { skipExternalSync: true },
      );
      await this.notifyResolutionEffects(resolution.tournament, resolution.matches, updatedMatch);
      const completionSnapshot = resolution.matches.find((item) => item.id === match.id) ?? updatedMatch;
      await this.enqueueMirroredStartggMatchCompletion(
        tournament.id,
        completionSnapshot,
        this.getMirroredLocalSyncVersion(updatedMatch),
      );
      return completionSnapshot;
    }

    const resetMatches = this.resetDependentMatches(
      matches,
      match.id,
      match.winnerParticipantId,
    );
    const resolution = await this.applyMatchResolution(tournamentId, tournament, resetMatches, updatedMatch);
    await this.notifyResolutionEffects(resolution.tournament, resolution.matches, updatedMatch);
    return updatedMatch;

    });
  }

  async reportDetailedResult(
    tournamentId: string,
    matchId: string,
    input: ReportDetailedResultInput,
  ): Promise<Match> {
    return this.operations.execute(tournamentId, "reportDetailedResult", { matchId, input }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureTournamentStarted(tournament);

    const matches = await this.repository.listMatches(tournamentId);
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    this.ensureMatchHasResolvedContenders(match);
    this.ensureMirroredStartggSetIsEditable(tournament, match, { allowCompletedMirrored: true });

    const participantsById = new Map(match.participants.map((participant) => [participant.participantId, participant]));
    const effectiveBestOf = input.bestOfOverride ?? match.reportedBestOf ?? match.bestOf;
    const reportedBestOf = effectiveBestOf !== match.bestOf ? effectiveBestOf : undefined;
    const winsNeeded = Math.floor(effectiveBestOf / 2) + 1;
    const scoresByParticipantId = new Map(match.participants.map((participant) => [participant.participantId, 0]));
    const supportsCharacters = this.supportsSmashCharacterReporting(tournament);
    const gameCharacterSelections: MatchGameCharacterSelections[] = [];

    for (const [index, game] of input.games.entries()) {
      if ([...scoresByParticipantId.values()].some(score => score >= winsNeeded)) {
        throw new Error("No se pueden anotar partidas después de la victoria que cierra el set");
      }
      if (!participantsById.has(game.winnerParticipantId)) {
        throw new Error("The selected game winner does not belong to this match");
      }

      scoresByParticipantId.set(
        game.winnerParticipantId,
        (scoresByParticipantId.get(game.winnerParticipantId) ?? 0) + 1,
      );

      if (!supportsCharacters) {
        continue;
      }

      const selections = this.normalizeDetailedGameSelections(tournament, match, game.selections);
      gameCharacterSelections.push({
        gameNum: index + 1,
        selections,
      });
    }

    const participantScores = match.participants.map((participant) => ({
      participantId: participant.participantId,
      score: scoresByParticipantId.get(participant.participantId) ?? 0,
    }));
    const winningEntry = participantScores.reduce<(typeof participantScores)[number] | undefined>((best, current) => {
      if (!best || current.score > best.score) {
        return current;
      }
      return best;
    }, undefined);

    if (!winningEntry || winningEntry.score < winsNeeded) {
      throw new Error("The reported score does not complete the set for this phase");
    }
    if (winningEntry.score > winsNeeded) {
      throw new Error("The reported score exceeds the games needed to win this set");
    }
    const tiedParticipants = participantScores.filter((participant) => participant.score === winningEntry.score);
    if (tiedParticipants.length > 1) {
      throw new Error("The reported games leave the set tied");
    }
    if (input.games.length > effectiveBestOf) {
      throw new Error("Too many games were reported for this set");
    }

    const updatedMatch: Match = this.withMirroredLocalMutation({
      ...match,
      status: "COMPLETED",
      reportedBestOf,
      gameResults: input.games.map((game) => game.winnerParticipantId),
      gameCharacterSelections: supportsCharacters ? gameCharacterSelections : [],
      characterSelections: supportsCharacters
        ? (gameCharacterSelections[gameCharacterSelections.length - 1]?.selections ?? [])
        : [],
      advancingParticipantIds: [winningEntry.participantId],
      winnerParticipantId: winningEntry.participantId,
      participants: match.participants.map((participant) => ({
        ...participant,
        score: scoresByParticipantId.get(participant.participantId) ?? 0,
      })),
      updatedAt: new Date().toISOString(),
    });

    if (await this.persistLocalScoreCorrection(tournament, matches, match, updatedMatch)) return updatedMatch;

    if (this.isMirroredStartggMatch(tournament, match)) {
      const resetMatches = this.resetDependentMatches(
        matches,
        match.id,
        match.winnerParticipantId,
      );
      const resolution = await this.applyMatchResolution(
        tournamentId,
        tournament,
        resetMatches,
        updatedMatch,
        { skipExternalSync: true },
      );
      await this.notifyResolutionEffects(resolution.tournament, resolution.matches, updatedMatch);
      const completionSnapshot = resolution.matches.find((item) => item.id === match.id) ?? updatedMatch;
      await this.enqueueMirroredStartggMatchCompletion(
        tournament.id,
        completionSnapshot,
        this.getMirroredLocalSyncVersion(updatedMatch),
      );
      return completionSnapshot;
    }

    const resetMatches = this.resetDependentMatches(
      matches,
      match.id,
      match.winnerParticipantId,
    );
    const resolution = await this.applyMatchResolution(tournamentId, tournament, resetMatches, updatedMatch);
    await this.notifyResolutionEffects(resolution.tournament, resolution.matches, updatedMatch);
    return updatedMatch;

    });
  }

  async resolveAbsence(
    tournamentId: string,
    matchId: string,
    input: ResolveAbsenceInput,
  ): Promise<Match> {
    return this.operations.execute(tournamentId, "resolveAbsence", { matchId, input }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureTournamentStarted(tournament);

    const matches = await this.repository.listMatches(tournamentId);
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    this.ensureMatchHasResolvedContenders(match);
    this.ensureMirroredStartggSetIsEditable(tournament, match, { allowCompletedMirrored: true });

    const winnerParticipantId =
      input.outcome === "SLOT_1_ABSENT"
        ? match.participants.find((participant) => participant.slot === 2)?.participantId
        : input.outcome === "SLOT_2_ABSENT"
          ? match.participants.find((participant) => participant.slot === 1)?.participantId
          : undefined;

    const updatedMatch: Match = this.withMirroredLocalMutation({
      ...match,
      status: "WALKOVER",
      gameResults: [],
      gameCharacterSelections: [],
      characterSelections: [],
      advancingParticipantIds: winnerParticipantId ? [winnerParticipantId] : [],
      winnerParticipantId,
      updatedAt: new Date().toISOString(),
    });

    if (this.isMirroredStartggMatch(tournament, match) && winnerParticipantId) {
      const resetMatches = this.resetDependentMatches(
        matches,
        match.id,
        match.winnerParticipantId,
      );
      const resolution = await this.applyMatchResolution(
        tournamentId,
        tournament,
        resetMatches,
        updatedMatch,
        { skipExternalSync: true },
      );
      await this.notifyResolutionEffects(resolution.tournament, resolution.matches, updatedMatch);
      const completionSnapshot = resolution.matches.find((item) => item.id === match.id) ?? updatedMatch;
      await this.enqueueMirroredStartggMatchCompletion(
        tournament.id,
        completionSnapshot,
        this.getMirroredLocalSyncVersion(updatedMatch),
      );
      return completionSnapshot;
    }

    if (winnerParticipantId) {
      const participants = await this.repository.listParticipants(tournamentId);
      const disqualifiedIds = match.participants
        .map((participant) => participant.participantId)
        .filter((participantId) => participantId !== winnerParticipantId);
      await this.repository.replaceParticipants(
        tournamentId,
        participants.map((participant) =>
          disqualifiedIds.includes(participant.id)
            ? { ...participant, status: "DISQUALIFIED" as const }
            : participant,
        ),
      );
    }

    const resetMatches = this.resetDependentMatches(
      matches,
      match.id,
      match.winnerParticipantId,
    );
    const resolution = await this.applyMatchResolution(tournamentId, tournament, resetMatches, updatedMatch);
    await this.notifyResolutionEffects(resolution.tournament, resolution.matches, updatedMatch);
    return updatedMatch;

    });
  }

  async resetMatch(tournamentId: string, matchId: string): Promise<Match> {
    return this.operations.execute(tournamentId, "resetMatch", { matchId }, async () => {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }
    this.ensureImportFinished(tournament);

    const matches = await this.repository.listMatches(tournamentId);
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }

    if (this.isMirroredStartggMatch(tournament, match)) {
      const resetMirroredMatch: Match = this.withMirroredLocalMutation({
        ...match,
        status: "PENDING",
        reportedBestOf: undefined,
        gameResults: [],
        gameCharacterSelections: [],
        characterSelections: [],
        advancingParticipantIds: [],
        winnerParticipantId: undefined,
        call: undefined,
        externalRef: match.externalRef?.provider === "START_GG"
          ? {
              ...match.externalRef,
              resultSyncedAt: undefined,
            }
          : match.externalRef,
        participants: match.participants.map((participant) => ({
          ...participant,
          score: 0,
        })),
        updatedAt: new Date().toISOString(),
      }, { clearResultSync: true });
      const dependentResets = this.resetDependentMatches(matches, match.id, match.winnerParticipantId);
      const originalMatches = new Map(matches.map(item => [item.id, item]));
      const resetMatches = this.normalizeUnresolvedMatches(
        dependentResets
          .map((item) => {
            if (item.id === match.id) {
              return resetMirroredMatch;
            }
            if (item.externalRef?.provider === "START_GG" && item !== originalMatches.get(item.id)) {
              return this.withMirroredLocalMutation({
                ...item,
                externalRef: {
                  ...item.externalRef,
                  resultSyncedAt: undefined,
                },
              }, { clearResultSync: true });
            }
            return item;
          }),
      );

      await this.repository.replaceMatches(tournamentId, resetMatches);
      await this.repository.saveTournament({
        ...tournament,
        updatedAt: new Date().toISOString(),
      });
      await this.enqueueMirroredStartggSetReset(tournament.id, match.id, this.getMirroredLocalSyncVersion(resetMirroredMatch));
      return resetMirroredMatch;
    }

    const resetSourceMatch: Match = {
      ...match,
      status: "PENDING",
      reportedBestOf: undefined,
      gameResults: [],
      gameCharacterSelections: [],
      characterSelections: [],
      advancingParticipantIds: [],
      winnerParticipantId: undefined,
      call: undefined,
      participants: match.participants.map((participant) => ({
        ...participant,
        score: 0,
      })),
      updatedAt: new Date().toISOString(),
    };

    const resetMatches = this.normalizeUnresolvedMatches(
      this.resetDependentMatches(matches, match.id, match.winnerParticipantId)
        .map((item) => (item.id === match.id ? resetSourceMatch : item)),
    );

    await this.repository.replaceMatches(tournamentId, resetMatches);
    await this.repository.saveTournament({
      ...tournament,
      status: tournament.status === 'COMPLETED' && !this.isTournamentComplete(resetMatches) ? 'IN_PROGRESS' : tournament.status,
      updatedAt: new Date().toISOString(),
    });
    return resetSourceMatch;

    });
  }

  private ensureManualParticipantEditingAllowed(tournament: Tournament) {
    this.ensureImportFinished(tournament);
    if (tournament.importSource?.provider === "START_GG") {
      throw new Error("Participants imported from start.gg must be refreshed from start.gg instead of edited manually");
    }
  }

  private async syncResolvedMatchToStartgg(tournament: Tournament, match: Match): Promise<void> {
    if (tournament.importSource?.provider !== "START_GG" || !tournament.importSource.syncResults) {
      return;
    }
    if (!match.winnerParticipantId || match.participants.length !== 2 || match.externalRef?.provider !== "START_GG") {
      return;
    }

    const participants = await this.repository.listParticipants(tournament.id);
    const participantById = new Map(participants.map((participant) => [participant.id, participant]));
    const winner = participantById.get(match.winnerParticipantId);
    const winnerEntrantId = winner?.externalRef?.provider === "START_GG"
      ? winner.externalRef.entrantId
      : undefined;
    const entrantIds = match.participants
      .map((participant) => participantById.get(participant.participantId))
      .map((participant) => participant?.externalRef?.provider === "START_GG" ? participant.externalRef.entrantId : undefined)
      .filter((entrantId): entrantId is string => Boolean(entrantId));
    if (!winnerEntrantId || entrantIds.length !== 2) {
      return;
    }

    try {
      const syncResult = await this.startggClient.reportMatchResult(match.externalRef.setId, winnerEntrantId);
      await this.persistResolvedMirroredSetReference(tournament.id, match.id, syncResult.setId);
    } catch (error) {
      console.warn("Failed to sync result to start.gg", {
        tournamentId: tournament.id,
        matchId: match.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async seedDemoData(): Promise<void> {
    if ((await this.repository.countTournaments()) > 0) {
      return;
    }

    const tournament = await this.createTournament({
      ownerId: "user_admin",
      title: "Smash Tournaments Demo Cup",
      gameTitle: "EA Sports FC 26",
      description: "Torneo demo para validar el flujo base de brackets y matches.",
      platform: "PlayStation 5",
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      maxParticipants: 16,
      isPublic: true,
      settings: {
        format: "SINGLE_ELIMINATION",
        bracketMode: "STANDARD",
        bestOf: 3,
        hasThirdPlaceMatch: false,
        checkInRequired: false,
        allowRematchReview: true,
        seedingMethod: "MANUAL",
        autoCallMatches: false,
        callTimeoutMinutes: 10,
        autoDisqualifyAfterMinutes: 15,
        manualSeedingLocked: false,
      },
    });

    for (const [displayName, seed] of [
      ["Neko", 1],
      ["Blitz", 2],
      ["Vortex", 3],
      ["Kairo", 4],
    ] as const) {
      await this.addParticipant(tournament.id, {
        displayName,
        seed,
      });
    }

    await this.generateBracket(tournament.id);
  }

  private toMatchParticipant(participant: TournamentParticipant, slot: number): MatchParticipant {
    return {
      id: createId("mp"),
      participantId: participant.id,
      displayName: participant.displayName,
      slot,
      score: 0,
    };
  }

  private buildInitialBracketRoundParticipants(
    seededParticipants: TournamentParticipant[],
  ): Array<MatchParticipant | undefined> {
    const bracketSize = this.nextPowerOfTwo(Math.max(seededParticipants.length, 2));
    return this.buildBracketSeedOrder(bracketSize).map((seedRank) => {
      const participant = seededParticipants[seedRank - 1];
      return participant ? this.toMatchParticipant(participant, 1) : undefined;
    });
  }

  private buildBracketSeedOrder(size: number): number[] {
    let seedOrder = [1];
    while (seedOrder.length < size) {
      const nextSize = seedOrder.length * 2;
      seedOrder = seedOrder.flatMap((seed) => [seed, nextSize + 1 - seed]);
    }
    return seedOrder;
  }

  private createPlaceholderParticipant(
    sourceMatchId: string,
    kind: "winner" | "loser",
    slot: number,
    matches: Match[],
  ): MatchParticipant {
    return {
      id: createId("mp"),
      participantId: `${kind}_of_${sourceMatchId}`,
      displayName: this.placeholderDisplayName(sourceMatchId, matches, kind),
      slot,
      score: 0,
    };
  }

  private createMarioKartPlaceholderParticipant(
    sourceMatchId: string,
    placement: number,
    slot: number,
    matches: Match[],
  ): MatchParticipant {
    return {
      id: createId("mp"),
      participantId: `advance_${placement}_of_${sourceMatchId}`,
      displayName: this.marioKartPlaceholderDisplayName(sourceMatchId, placement, matches),
      slot,
      score: 0,
    };
  }

  private createMarioKartDroppedPlaceholderParticipant(
    sourceMatchId: string,
    placement: number,
    slot: number,
    matches: Match[],
  ): MatchParticipant {
    return {
      id: createId("mp"),
      participantId: `drop_${placement}_of_${sourceMatchId}`,
      displayName: this.marioKartDroppedPlaceholderDisplayName(sourceMatchId, placement, matches),
      slot,
      score: 0,
    };
  }

  private async applyStartggSnapshot(
    tournament: Tournament,
    snapshot: StartggImportedBracket,
    options: {
      syncResults: boolean;
      preserveTournamentTitle: boolean;
      preserveLocalProgress?: boolean;
    },
  ) {
    return this.inTournamentTransaction(tournament.id, async () => {
    const current = await this.repository.getTournament(tournament.id);
    if (!current) throw new Error("Tournament not found");
    tournament = current;
    const now = new Date().toISOString();
    const existingParticipants = await this.repository.listParticipants(tournament.id);
    const participantIdByEntrantId = new Map(
      existingParticipants
        .filter(hasStartggParticipantRef)
        .map((participant) => [participant.externalRef.entrantId, participant.id]),
    );

    const importedParticipants: TournamentParticipant[] = snapshot.participants.map((participant) => ({
      id: participantIdByEntrantId.get(participant.externalRef.entrantId) ?? createId("par"),
      tournamentId: tournament.id,
      displayName: participant.displayName,
      seed: participant.seed,
      checkedIn: false,
      status: "ACTIVE",
      externalRef: participant.externalRef,
      createdAt: now,
    }));

    const participantByEntrantId = new Map(
      importedParticipants
        .filter(hasStartggParticipantRef)
        .map((participant) => [participant.externalRef.entrantId, participant]),
    );
    const existingMatches = await this.repository.listMatches(tournament.id);
    // The external fetch runs outside this transaction; validate the current state again.
    this.ensureStartggImportAllowed(tournament, existingMatches);
    const existingMatchBySetId = new Map(
      existingMatches
        .filter(hasStartggMatchRef)
        .map((match) => [match.externalRef.setId, match]),
    );
    const preserveLocalProgress = options.preserveLocalProgress ?? false;
    let mirroredMatches = snapshot.matches.map((match) =>
      {
        const previousMatch = existingMatchBySetId.get(match.setId)
          ?? this.findExistingMirroredMatchFallback(existingMatches, match);
        return this.toMirroredLocalMatch(
          tournament.id,
          now,
          previousMatch?.id ?? createId("m"),
          match,
          participantByEntrantId,
          previousMatch,
          preserveLocalProgress,
        );
      },
    );
    if (preserveLocalProgress) {
      mirroredMatches = this.preserveMissingMirroredPhaseGroups(existingMatches, mirroredMatches);
      mirroredMatches = this.preserveMissingMirroredMatches(existingMatches, mirroredMatches);
    }
    mirroredMatches = this.resolveMirroredDependentParticipants(mirroredMatches, existingMatches);
    mirroredMatches = this.linkMirroredPlaceholdersToLocalMatchIds(mirroredMatches);

    this.logStartggDebug("apply snapshot", {
      tournamentId: tournament.id,
      eventUrl: snapshot.eventUrl,
      importedMatches: snapshot.matches.length,
      finalMatches: mirroredMatches.length,
      existingMatches: existingMatches.length,
      groups: this.describeMirroredGroups(mirroredMatches),
    });
    const updatedTournament: Tournament = {
      ...tournament,
      title: options.preserveTournamentTitle ? tournament.title : snapshot.eventName,
      gameTitle: snapshot.gameTitle || tournament.gameTitle,
      maxParticipants: Math.max(snapshot.participants.length, tournament.maxParticipants),
      settings: {
        ...tournament.settings,
        format: snapshot.format,
        bracketMode: "STANDARD",
        bestOf: snapshot.bestOf,
        winnersBestOf: snapshot.winnersBestOf,
        losersBestOf: snapshot.losersBestOf,
        seedingMethod: "MANUAL",
        playAreaName: undefined,
      },
      status: this.deriveMirroredTournamentStatus(mirroredMatches, tournament.status),
      importSource: {
        provider: "START_GG",
        eventId: snapshot.eventId,
        phaseId: snapshot.phaseId,
        phaseGroupId: snapshot.phaseGroupId,
        eventSlug: snapshot.eventSlug,
        eventUrl: snapshot.eventUrl,
        entrantSize: snapshot.entrantSize,
        hasPools: snapshot.hasPools,
        syncResults: options.syncResults,
        importedAt: now,
      },
      updatedAt: now,
    };
    await this.repository.replaceOverview(updatedTournament, importedParticipants, mirroredMatches);
    return this.getTournamentOverview(tournament.id);

    });
  }

  private toMirroredLocalMatch(
    tournamentId: string,
    now: string,
    matchId: string,
    mirroredMatch: StartggImportedBracket["matches"][number],
    participantByEntrantId: Map<string, TournamentParticipant>,
    previousMatch?: Match,
    preserveLocalProgress: boolean = false,
  ): Match {
    const importedParticipants = mirroredMatch.slots.map((slot) => {
      const participant = slot.entrantId ? participantByEntrantId.get(slot.entrantId) : undefined;
      return {
        id: createId("mp"),
        participantId: participant?.id ?? this.toMirroredPlaceholderParticipantId(mirroredMatch, slot),
        displayName: participant?.displayName ?? slot.displayName,
        slot: slot.slot,
        score: slot.score,
      };
    });
    const winnerParticipantId = mirroredMatch.winnerEntrantId
      ? participantByEntrantId.get(mirroredMatch.winnerEntrantId)?.id
      : undefined;
    const importedGameResults = mirroredMatch.gameWinnerEntrantIds
      .map((entrantId) => participantByEntrantId.get(entrantId)?.id)
      .filter((participantId): participantId is string => Boolean(participantId));
    const importedGameCharacterSelections = this.toImportedMirroredLocalGameCharacterSelections(
      mirroredMatch,
      participantByEntrantId,
    );
    const importedCharacterSelections = this.getLatestImportedGameCharacterSelections(
      importedGameCharacterSelections,
    );

    const importedMatch: Match = {
      id: matchId,
      tournamentId,
      bracketStage: mirroredMatch.bracketStage,
      roundNumber: mirroredMatch.roundNumber,
      matchNumber: mirroredMatch.matchNumber,
      status: mirroredMatch.status,
      bestOf: mirroredMatch.bestOf,
      reportedBestOf: previousMatch?.reportedBestOf,
      advancersRequired: 1,
      participants: importedParticipants,
      gameResults: importedGameResults,
      characterSelections: importedCharacterSelections,
      gameCharacterSelections: importedGameCharacterSelections,
      advancingParticipantIds: winnerParticipantId ? [winnerParticipantId] : [],
      winnerParticipantId,
      externalRef: {
        provider: "START_GG",
        setId: mirroredMatch.setId,
        identifier: mirroredMatch.identifier,
        stream: mirroredMatch.stream,
        hasPlaceholder: mirroredMatch.hasPlaceholder,
        isPoolPhase: mirroredMatch.isPoolPhase,
        localSyncVersion: previousMatch?.externalRef?.provider === "START_GG"
          ? previousMatch.externalRef.localSyncVersion
          : undefined,
        syncedSyncVersion: previousMatch?.externalRef?.provider === "START_GG"
          ? previousMatch.externalRef.syncedSyncVersion
          : undefined,
        resultSyncedAt: previousMatch?.externalRef?.provider === "START_GG"
          ? previousMatch.externalRef.resultSyncedAt
          : undefined,
        phaseId: mirroredMatch.phaseId,
        phaseGroupId: mirroredMatch.phaseGroupId,
        phaseName: mirroredMatch.phaseName,
        phaseOrder: mirroredMatch.phaseOrder,
        phaseGroupName: mirroredMatch.phaseGroupName,
        phaseType: mirroredMatch.phaseType,
        entrantSize: mirroredMatch.entrantSize,
        fullRoundText: mirroredMatch.fullRoundText,
        entrantIds: mirroredMatch.entrantIds,
      },
      createdAt: now,
      updatedAt: now,
    };

    if (preserveLocalProgress && this.shouldPreserveMirroredLocalProgress(importedMatch, previousMatch)) {
      this.logStartggDebug("preserving local mirrored progress", {
        tournamentId,
        matchId,
        previous: this.describeMatchForDebug(previousMatch!),
        imported: this.describeMatchForDebug(importedMatch),
      });
      return this.mergeMirroredLocalProgress(importedMatch, previousMatch!);
    }

    return importedMatch;
  }

  private findExistingMirroredMatchFallback(
    existingMatches: Match[],
    mirroredMatch: StartggImportedBracket["matches"][number],
  ): Match | undefined {
    return existingMatches
      .filter(hasStartggMatchRef)
      .find((match) =>
        match.externalRef.phaseId === mirroredMatch.phaseId
        && (match.externalRef.phaseGroupId ?? "") === (mirroredMatch.phaseGroupId ?? "")
        && match.bracketStage === mirroredMatch.bracketStage
        && match.roundNumber === mirroredMatch.roundNumber
        && match.matchNumber === mirroredMatch.matchNumber
        && (match.externalRef.identifier ?? "") === mirroredMatch.identifier
        && match.externalRef.fullRoundText === mirroredMatch.fullRoundText,
      );
  }

  private toImportedMirroredLocalGameCharacterSelections(
    mirroredMatch: StartggImportedBracket["matches"][number],
    participantByEntrantId: Map<string, TournamentParticipant>,
  ): NonNullable<Match["gameCharacterSelections"]> {
    const importedSelections = mirroredMatch.gameCharacterSelections
      .map((game) => ({
        gameNum: game.gameNum,
        selections: game.selections
          .map((selection) => {
            const participantId = participantByEntrantId.get(selection.entrantId)?.id;
            if (!participantId) {
              return undefined;
            }
            return {
              participantId,
              characterId: selection.characterId,
              characterName: selection.characterName,
            };
          })
          .filter((selection): selection is NonNullable<typeof selection> => selection !== undefined),
      }))
      .filter((game) => game.selections.length > 0);

    return importedSelections;
  }

  private toMirroredPlaceholderParticipantId(
    mirroredMatch: StartggImportedBracket["matches"][number],
    slot: StartggImportedBracket["matches"][number]["slots"][number],
  ): string {
    const currentSetId = mirroredMatch.setId;
    if (this.isRoundRobinMirroredPhaseType(mirroredMatch.phaseType)) {
      return `winner_of_startgg_${currentSetId}_${slot.slot}`;
    }
    const prereqType = slot.prereqType?.trim().toLowerCase();
    const prereqId = slot.prereqId?.trim();
    const prereqPlacement = Number(slot.prereqPlacement ?? 0);
    if (prereqType === "set" && prereqId) {
      if (prereqPlacement === 1) {
        return `winner_of_startgg_${prereqId}`;
      }
      if (prereqPlacement === 2) {
        return `loser_of_startgg_${prereqId}`;
      }
      if (prereqPlacement > 0) {
        return `advance_${prereqPlacement}_of_startgg_${prereqId}`;
      }
    }
    return `winner_of_startgg_${currentSetId}_${slot.slot}`;
  }

  private isRoundRobinMirroredPhaseType(phaseType?: string): boolean {
    return phaseType?.trim().toUpperCase() === "ROUND_ROBIN";
  }

  private isRoundRobinMirroredMatch(match?: Match): boolean {
    return match?.externalRef?.provider === "START_GG"
      && this.isRoundRobinMirroredPhaseType(match.externalRef.phaseType);
  }

  private getLatestImportedGameCharacterSelections(
    importedSelections: NonNullable<Match["gameCharacterSelections"]>,
  ): NonNullable<Match["characterSelections"]> {
    const latestSelections = importedSelections.length > 0
      ? importedSelections[importedSelections.length - 1]?.selections
      : undefined;
    if (latestSelections && latestSelections.length > 0) {
      return latestSelections;
    }
    return [];
  }

  private preserveMissingMirroredPhaseGroups(previousMatches: Match[], importedMatches: Match[]): Match[] {
    const previousGroups = new Map<string, Match[]>();
    previousMatches
      .filter(hasStartggMatchRef)
      .forEach((match) => {
        const key = this.mirroredPhaseGroupKey(match);
        if (!key) {
          return;
        }
        if (!previousGroups.has(key)) {
          previousGroups.set(key, []);
        }
        previousGroups.get(key)!.push(match);
      });

    const importedGroupKeys = new Set(
      importedMatches
        .map((match) => this.mirroredPhaseGroupKey(match))
        .filter((key): key is string => Boolean(key)),
    );

    const missingMatches = Array.from(previousGroups.entries())
      .filter(([key]) => !importedGroupKeys.has(key))
      .flatMap(([, matches]) => matches);

    if (missingMatches.length === 0) {
      return importedMatches;
    }

    return [...importedMatches, ...missingMatches].sort((left, right) =>
      (left.externalRef?.phaseOrder ?? Number.MAX_SAFE_INTEGER) - (right.externalRef?.phaseOrder ?? Number.MAX_SAFE_INTEGER)
      || left.bracketStage.localeCompare(right.bracketStage)
      || left.roundNumber - right.roundNumber
      || left.matchNumber - right.matchNumber,
    );
  }

  private preserveMissingMirroredMatches(previousMatches: Match[], importedMatches: Match[]): Match[] {
    const importedSetIds = new Set(
      importedMatches
        .filter(hasStartggMatchRef)
        .map((match) => match.externalRef.setId),
    );

    const importedGroupSizes = new Map<string, number>();
    importedMatches.forEach((match) => {
      const key = this.mirroredPhaseGroupKey(match);
      if (!key) {
        return;
      }
      importedGroupSizes.set(key, (importedGroupSizes.get(key) ?? 0) + 1);
    });

    const previousGroups = new Map<string, Match[]>();
    previousMatches
      .filter(hasStartggMatchRef)
      .forEach((match) => {
        const key = this.mirroredPhaseGroupKey(match);
        if (!key) {
          return;
        }
        if (!previousGroups.has(key)) {
          previousGroups.set(key, []);
        }
        previousGroups.get(key)!.push(match);
      });

    const recoveredMatches = previousMatches
      .filter(hasStartggMatchRef)
      .filter((match) => !importedSetIds.has(match.externalRef.setId))
      .filter((match) => {
        const key = this.mirroredPhaseGroupKey(match);
        if (!key) {
          return false;
        }
        const previousGroupSize = previousGroups.get(key)?.length ?? 0;
        const importedGroupSize = importedGroupSizes.get(key) ?? 0;
        return previousGroupSize > importedGroupSize;
      });

    if (recoveredMatches.length === 0) {
      return importedMatches;
    }

    return [...importedMatches, ...recoveredMatches].sort((left, right) =>
      (left.externalRef?.phaseOrder ?? Number.MAX_SAFE_INTEGER) - (right.externalRef?.phaseOrder ?? Number.MAX_SAFE_INTEGER)
      || left.bracketStage.localeCompare(right.bracketStage)
      || left.roundNumber - right.roundNumber
      || left.matchNumber - right.matchNumber,
    );
  }

  private resolveMirroredDependentParticipants(importedMatches: Match[], previousMatches: Match[]): Match[] {
    const sourceMatches = new Map<string, Match>();
    [...previousMatches, ...importedMatches]
      .filter(hasStartggMatchRef)
      .forEach((match) => {
        sourceMatches.set(match.externalRef.setId, match);
      });

    return importedMatches.map((match) => ({
      ...match,
      participants: match.participants.map((participant) => {
        const resolved = this.resolveMirroredDependentParticipant(participant.participantId, sourceMatches);
        if (!resolved) {
          return participant;
        }
        return {
          ...participant,
          participantId: resolved.id,
          displayName: resolved.displayName,
        };
      }),
    }));
  }

  private linkMirroredPlaceholdersToLocalMatchIds(importedMatches: Match[]): Match[] {
    const localMatchIdBySetId = new Map(
      importedMatches
        .filter(hasStartggMatchRef)
        .map((match) => [match.externalRef.setId, match.id]),
    );

    return importedMatches.map((match) => ({
      ...match,
      participants: match.participants.map((participant) => ({
        ...participant,
        participantId: this.toLocalMirroredPlaceholderParticipantId(participant.participantId, localMatchIdBySetId),
      })),
    }));
  }


  private toLocalMirroredPlaceholderParticipantId(
    participantId: string,
    localMatchIdBySetId: Map<string, string>,
  ): string {
    if (participantId.startsWith("winner_of_startgg_")) {
      const setId = participantId.slice("winner_of_startgg_".length);
      const localMatchId = localMatchIdBySetId.get(setId);
      return localMatchId ? `winner_of_${localMatchId}` : participantId;
    }
    if (participantId.startsWith("loser_of_startgg_")) {
      const setId = participantId.slice("loser_of_startgg_".length);
      const localMatchId = localMatchIdBySetId.get(setId);
      return localMatchId ? `loser_of_${localMatchId}` : participantId;
    }
    const advanceMatch = /^advance_(\d+)_of_startgg_(.+)$/.exec(participantId);
    if (advanceMatch) {
      const placement = advanceMatch[1];
      const setId = advanceMatch[2];
      const localMatchId = localMatchIdBySetId.get(setId);
      return localMatchId ? `advance_${placement}_of_${localMatchId}` : participantId;
    }
    const dropMatch = /^drop_(\d+)_of_startgg_(.+)$/.exec(participantId);
    if (dropMatch) {
      const placement = dropMatch[1];
      const setId = dropMatch[2];
      const localMatchId = localMatchIdBySetId.get(setId);
      return localMatchId ? `drop_${placement}_of_${localMatchId}` : participantId;
    }
    return participantId;
  }

  private resolveMirroredDependentParticipant(
    placeholderParticipantId: string,
    sourceMatches: Map<string, Match>,
  ): { id: string; displayName: string } | undefined {
    if (placeholderParticipantId.startsWith("winner_of_startgg_")) {
      const setId = placeholderParticipantId.slice("winner_of_startgg_".length);
      const source = sourceMatches.get(setId);
      if (!source?.winnerParticipantId) {
        return undefined;
      }
      const winner = source.participants.find((participant) => participant.participantId === source.winnerParticipantId);
      return winner ? { id: winner.participantId, displayName: winner.displayName } : undefined;
    }
    if (placeholderParticipantId.startsWith("loser_of_startgg_")) {
      const setId = placeholderParticipantId.slice("loser_of_startgg_".length);
      const source = sourceMatches.get(setId);
      if (!source?.winnerParticipantId) {
        return undefined;
      }
      const loser = source.participants.find((participant) => participant.participantId !== source.winnerParticipantId);
      return loser ? { id: loser.participantId, displayName: loser.displayName } : undefined;
    }
    const advanceMatch = /^advance_(\d+)_of_startgg_(.+)$/.exec(placeholderParticipantId);
    if (advanceMatch) {
      const placement = Number(advanceMatch[1]);
      const setId = advanceMatch[2];
      const source = sourceMatches.get(setId);
      const participantId = source?.advancingParticipantIds?.[placement - 1];
      if (!participantId) {
        return undefined;
      }
      const participant = source.participants.find((item) => item.participantId === participantId);
      return participant ? { id: participant.participantId, displayName: participant.displayName } : undefined;
    }
    return undefined;
  }

  private mirroredPhaseGroupKey(match: Match): string | undefined {
    if (match.externalRef?.provider !== "START_GG") {
      return undefined;
    }
    const phaseId = match.externalRef.phaseId?.trim();
    const phaseGroupId = match.externalRef.phaseGroupId?.trim();
    const phaseName = match.externalRef.phaseName?.trim();
    const phaseGroupName = match.externalRef.phaseGroupName?.trim();
    return [phaseId || phaseName || "phase", phaseGroupId || phaseGroupName || "group"].join("::");
  }

  private deriveMirroredTournamentStatus(
    matches: Match[],
    previousStatus?: Tournament["status"],
  ): Tournament["status"] {
    if (matches.length === 0) {
      return "DRAFT";
    }
    if (matches.every((match) => match.status === "COMPLETED" || match.status === "WALKOVER")) {
      return "COMPLETED";
    }
    if (matches.some((match) => match.status === "COMPLETED" || match.status === "WALKOVER")) {
      return "IN_PROGRESS";
    }
    if (previousStatus === "IN_PROGRESS") {
      return "IN_PROGRESS";
    }
    return "READY";
  }

  private shouldPreserveMirroredLocalProgress(importedMatch: Match, previousMatch?: Match): boolean {
    if (!previousMatch) {
      return false;
    }
    if (this.hasMirroredLocalProgressWorthPreserving(previousMatch) && this.wouldImportedMirroredStateDegradeLocal(importedMatch, previousMatch)) {
      return true;
    }
    if (previousMatch.status === "COMPLETED" || previousMatch.status === "WALKOVER") {
      return false;
    }
    if (importedMatch.status !== "PENDING") {
      return false;
    }
    if (importedMatch.winnerParticipantId || (importedMatch.advancingParticipantIds?.length ?? 0) > 0) {
      return false;
    }
    if ((importedMatch.gameResults?.length ?? 0) > 0) {
      return false;
    }
    if ((importedMatch.gameCharacterSelections?.length ?? 0) > 0) {
      return false;
    }
    if ((importedMatch.characterSelections?.length ?? 0) > 0) {
      return false;
    }

    if (!this.hasMirroredLocalProgressWorthPreserving(previousMatch)) {
      return false;
    }
    const importedIds = importedMatch.participants.map((participant) => participant.participantId);
    const previousIds = previousMatch.participants.map((participant) => participant.participantId);
    if (importedIds.length !== previousIds.length) {
      return false;
    }

    if (importedIds.every((participantId, index) => participantId === previousIds[index])) {
      return true;
    }

    return this.resolvedMirroredParticipantCount(importedMatch) < this.resolvedMirroredParticipantCount(previousMatch);
  }

  private mergeMirroredLocalProgress(importedMatch: Match, previousMatch: Match): Match {
    const keepPreviousParticipants =
      this.resolvedMirroredParticipantCount(importedMatch) < this.resolvedMirroredParticipantCount(previousMatch);
    const previousParticipantById = new Map(
      previousMatch.participants.map((participant) => [participant.participantId, participant]),
    );
    const participants = keepPreviousParticipants
      ? previousMatch.participants.map((participant) => ({ ...participant }))
      : importedMatch.participants.map((participant) => {
          const previousParticipant = previousParticipantById.get(participant.participantId);
          return previousParticipant
            ? {
                ...participant,
                score: previousParticipant.score,
              }
            : participant;
        });

    return {
      ...importedMatch,
      status: previousMatch.status,
      participants,
      gameResults: previousMatch.gameResults ?? [],
      characterSelections: previousMatch.characterSelections ?? [],
      gameCharacterSelections: previousMatch.gameCharacterSelections ?? [],
      call: previousMatch.call,
      externalRef: importedMatch.externalRef?.provider === "START_GG" && previousMatch.externalRef?.provider === "START_GG"
        ? {
            ...importedMatch.externalRef,
            setId: this.isPreviewStartggSetId(importedMatch.externalRef.setId) && !this.isPreviewStartggSetId(previousMatch.externalRef.setId)
              ? previousMatch.externalRef.setId
              : importedMatch.externalRef.setId,
            hasPlaceholder: importedMatch.externalRef.hasPlaceholder === true && previousMatch.externalRef.hasPlaceholder === false
              ? false
              : importedMatch.externalRef.hasPlaceholder,
            localSyncVersion: Math.max(
              importedMatch.externalRef.localSyncVersion ?? 0,
              previousMatch.externalRef.localSyncVersion ?? 0,
            ),
            syncedSyncVersion: Math.max(
              importedMatch.externalRef.syncedSyncVersion ?? 0,
              previousMatch.externalRef.syncedSyncVersion ?? 0,
            ),
            resultSyncedAt: previousMatch.externalRef.resultSyncedAt ?? importedMatch.externalRef.resultSyncedAt,
          }
        : importedMatch.externalRef,
      updatedAt: importedMatch.updatedAt,
    };
  }

  private hasMirroredLocalProgressWorthPreserving(match: Match): boolean {
    return match.status === "CALLED"
      || match.status === "PLAYING"
      || (match.gameResults?.length ?? 0) > 0
      || (match.gameCharacterSelections?.length ?? 0) > 0
      || (match.characterSelections?.length ?? 0) > 0
      || Boolean(match.call?.calledAt)
      || Boolean(match.call?.startedAt);
  }

  private resolvedMirroredParticipantCount(match: Match): number {
    return match.participants.filter((participant) => !this.isPlaceholderParticipantId(participant.participantId)).length;
  }

  private getMirroredLocalSyncVersion(match: Match): number {
    return match.externalRef?.provider === "START_GG"
      ? match.externalRef.localSyncVersion ?? 0
      : 0;
  }

  private mirroredStatusRank(status: MatchStatus): number {
    switch (status) {
      case "CALLED":
        return 1;
      case "CHECKED_IN":
        return 2;
      case "PLAYING":
      case "RESULT_REPORTED":
      case "UNDER_REVIEW":
        return 3;
      case "COMPLETED":
      case "WALKOVER":
        return 4;
      default:
        return 0;
    }
  }

  private wouldImportedMirroredStateDegradeLocal(importedMatch: Match, previousMatch: Match): boolean {
    if (this.mirroredStatusRank(importedMatch.status) < this.mirroredStatusRank(previousMatch.status)) {
      return true;
    }
    if (this.resolvedMirroredParticipantCount(importedMatch) < this.resolvedMirroredParticipantCount(previousMatch)) {
      return true;
    }
    if (Boolean(previousMatch.call?.calledAt) && !importedMatch.call?.calledAt) {
      return true;
    }
    if (Boolean(previousMatch.call?.startedAt) && !importedMatch.call?.startedAt) {
      return true;
    }
    if (Boolean(previousMatch.winnerParticipantId) && !importedMatch.winnerParticipantId) {
      return true;
    }
    if ((previousMatch.advancingParticipantIds?.length ?? 0) > (importedMatch.advancingParticipantIds?.length ?? 0)) {
      return true;
    }
    if ((previousMatch.gameResults?.length ?? 0) > (importedMatch.gameResults?.length ?? 0)) {
      return true;
    }
    if ((previousMatch.gameCharacterSelections?.length ?? 0) > (importedMatch.gameCharacterSelections?.length ?? 0)) {
      return true;
    }
    if ((previousMatch.characterSelections?.length ?? 0) > (importedMatch.characterSelections?.length ?? 0)) {
      return true;
    }
    const previousScoreTotal = previousMatch.participants.reduce((sum, participant) => sum + participant.score, 0);
    const importedScoreTotal = importedMatch.participants.reduce((sum, participant) => sum + participant.score, 0);
    return importedScoreTotal < previousScoreTotal;
  }

  private withMirroredLocalMutation(match: Match, options: { clearResultSync?: boolean } = {}): Match {
    if (!this.isMirroredStartggExternalRef(match.externalRef)) {
      return match;
    }
    return {
      ...match,
      externalRef: {
        ...match.externalRef,
        localSyncVersion: (match.externalRef.localSyncVersion ?? 0) + 1,
        ...(options.clearResultSync ? { resultSyncedAt: undefined } : {}),
      },
    };
  }

  private isMirroredStartggExternalRef(externalRef: Match["externalRef"]): externalRef is NonNullable<Match["externalRef"]> {
    return externalRef?.provider === "START_GG";
  }

  private isMirroredStartggMatch(tournament: Tournament, match: Match): boolean {
    return tournament.importSource?.provider === "START_GG" && match.externalRef?.provider === "START_GG";
  }

  private ensureMirroredStartggSetIsEditable(
    tournament: Tournament,
    match: Match,
    options: { allowCompletedMirrored?: boolean } = {},
  ): void {
    if (
      this.isMirroredStartggMatch(tournament, match)
      && !options.allowCompletedMirrored
      && (match.status === "COMPLETED" || match.status === "WALKOVER")
    ) {
      throw new Error("This start.gg set is already reported. Correct it in start.gg and then refresh the tournament");
    }
  }

  private supportsSmashCharacterReporting(tournament: Tournament): boolean {
    return tournament.importSource?.provider === "START_GG"
      && (
        /smash|ultimate/i.test(tournament.gameTitle)
        || /rivals of aether ii|rivals of aether 2|rivals ii|rivals 2|roa 2|roa2/i.test(tournament.gameTitle)
      );
  }

  private resolveSupportedCharacter(tournament: Tournament, value: string): { id: number; name: string } | undefined {
    if (/smash|ultimate/i.test(tournament.gameTitle)) {
      return resolveSmashUltimateCharacter(value);
    }
    if (/rivals of aether ii|rivals of aether 2|rivals ii|rivals 2|roa 2|roa2/i.test(tournament.gameTitle)) {
      return resolveRoa2Character(value);
    }
    return undefined;
  }

  private async enqueueMirroredStartggSetCall(tournamentId: string, matchId: string, actionVersion: number): Promise<void> {
    await this.enqueueMirroredStartggAction(tournamentId, "set-call", { matchId, actionVersion }, async () => {
      const context = await this.getMirroredSyncContext(tournamentId, matchId);
      if (!context || (context.match.status !== "CALLED" && context.match.status !== "PLAYING" && context.match.status !== "COMPLETED" && context.match.status !== "WALKOVER")) {
        return;
      }
      if (this.shouldSkipQueuedMirroredStartggAction(context.match, "set-call", actionVersion)) {
        this.logStartggDebug("start.gg action skipped - stale mirrored state", {
          tournamentId,
          actionType: "set-call",
          matchId,
          actionVersion,
          localMatch: this.describeMatchForDebug(context.match),
        });
        return;
      }
      await this.syncMirroredStartggSetCall(context.tournament, context.match, actionVersion);
    });
  }

  private async enqueueMirroredStartggSetStarted(tournamentId: string, matchId: string, actionVersion: number): Promise<void> {
    await this.enqueueMirroredStartggAction(tournamentId, "set-start", { matchId, actionVersion }, async () => {
      const context = await this.getMirroredSyncContext(tournamentId, matchId);
      if (!context) {
        return;
      }
      if (this.shouldSkipQueuedMirroredStartggAction(context.match, "set-start", actionVersion)) {
        this.logStartggDebug("start.gg action skipped - stale mirrored state", {
          tournamentId,
          actionType: "set-start",
          matchId,
          actionVersion,
          localMatch: this.describeMatchForDebug(context.match),
        });
        return;
      }
      if (context.match.status === "CALLED") {
        this.logStartggDebug("start.gg set-start deferred - local state not ready yet", {
          tournamentId,
          matchId,
          actionVersion,
          localMatch: this.describeMatchForDebug(context.match),
        });
        throw new Error("The mirrored start.gg set is not locally started yet. Retrying in background.");
      }
      if (context.match.status !== "PLAYING" && context.match.status !== "COMPLETED" && context.match.status !== "WALKOVER") {
        this.logStartggDebug("start.gg action skipped - unsupported local state", {
          tournamentId,
          actionType: "set-start",
          matchId,
          actionVersion,
          localMatch: this.describeMatchForDebug(context.match),
        });
        return;
      }
      await this.syncMirroredStartggSetStarted(context.tournament, context.match, actionVersion);
    });
  }

  private async enqueueMirroredStartggMatchCompletion(tournamentId: string, matchSnapshot: Match, actionVersion: number): Promise<void> {
    await this.enqueueMirroredStartggAction(tournamentId, "set-completion", { matchId: matchSnapshot.id, actionVersion }, async () => {
      const context = await this.getMirroredSyncContext(tournamentId, matchSnapshot.id);
      if (!context) {
        return;
      }
      if (this.shouldSkipQueuedMirroredStartggAction(context.match, "set-completion", actionVersion)) {
        this.logStartggDebug("start.gg action skipped - stale mirrored state", {
          tournamentId,
          actionType: "set-completion",
          matchId: matchSnapshot.id,
          actionVersion,
          localMatch: this.describeMatchForDebug(context.match),
        });
        return;
      }
      const reportableSnapshot = this.toQueuedMirroredCompletionSnapshot(context.match, matchSnapshot);
      this.logStartggDebug("start.gg completion using queued snapshot", {
        tournamentId,
        matchId: matchSnapshot.id,
        actionVersion,
        currentMatch: this.describeMatchForDebug(context.match),
        queuedSnapshot: this.describeMatchForDebug(reportableSnapshot),
      });
      await this.syncMirroredStartggMatchCompletion(context.tournament, reportableSnapshot, actionVersion);
    });
  }

  private async enqueueMirroredStartggSetReset(tournamentId: string, matchId: string, actionVersion: number): Promise<void> {
    await this.enqueueMirroredStartggAction(tournamentId, "set-reset", { matchId, actionVersion }, async () => {
      const context = await this.getMirroredSyncContext(tournamentId, matchId);
      if (!context) {
        return;
      }
      if (this.shouldSkipQueuedMirroredStartggAction(context.match, "set-reset", actionVersion)) {
        this.logStartggDebug("start.gg action skipped - stale mirrored state", {
          tournamentId,
          actionType: "set-reset",
          matchId,
          actionVersion,
          localMatch: this.describeMatchForDebug(context.match),
        });
        return;
      }
      if (context.match.participants.some((p) => this.isPlaceholderParticipantId(p.participantId))) {
        return;
      }
      const setId = await this.resolveReportableStartggSetId(context.tournament, context.match);
      try {
        const remote = await this.startggClient.getSetState(setId);
        if (remote.state === 1 && remote.games.length === 0) {
          await this.persistResolvedMirroredSetReference(tournamentId, matchId, setId, { syncedVersion: actionVersion });
          return;
        }
        const syncResult = await this.startggClient.resetSet(setId, true);
        await this.persistResolvedMirroredSetReference(tournamentId, matchId, syncResult.setId, { syncedVersion: actionVersion });
        await this.persistResolvedMirroredGroupSetReferences(tournamentId, context.match, syncResult);
        this.logStartggDebug("set reset synced", {
          tournamentId,
          matchId,
          setId: syncResult.setId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("bye")) {
          this.logStartggDebug("set reset skipped - bye set", { tournamentId, matchId, setId });
          return;
        }
        throw error;
      }
    });
  }

  private async enqueueMirroredStartggAction(
    tournamentId: string,
    actionType: string,
    payload: Record<string, unknown>,
    action: () => Promise<void>,
  ): Promise<void> {
    const jobId = `${tournamentId}:${this.toStartggActionKey(actionType, payload)}`;
    if (this.repository.saveSyncJob) {
      const previous = (await this.repository.listSyncJobs(tournamentId)).find(job => job.id === jobId);
      if (previous?.state === "SYNCED" || previous?.state === "SUPERSEDED") return;
      if (!previous) await this.repository.saveSyncJob({ id: jobId, tournamentId, matchId: String(payload.matchId),
        action: actionType, version: Number(payload.actionVersion), state: "PENDING", attempts: 0, updatedAt: new Date().toISOString() });
    }
    const schedule = () => this.scheduleMirroredStartggAction(tournamentId, actionType, payload, action);
    if (this.repository.afterCommit) this.repository.afterCommit(schedule); else schedule();
  }

  private scheduleMirroredStartggAction(tournamentId: string, actionType: string, payload: Record<string, unknown>, action: () => Promise<void>): void {
    const actionKey = this.toStartggActionKey(actionType, payload);
    if (actionKey) {
      const pendingKeys = this.pendingStartggActionKeys.get(tournamentId) ?? new Set<string>();
      if (pendingKeys.has(actionKey)) {
        this.logStartggDebug("start.gg action skipped - duplicate already queued", {
          tournamentId,
          actionType,
          ...payload,
        });
        return;
      }
      pendingKeys.add(actionKey);
      this.pendingStartggActionKeys.set(tournamentId, pendingKeys);
    }
    const previous = this.startggActionQueues.get(tournamentId) ?? Promise.resolve();
    this.logStartggDebug("queued start.gg action", {
      tournamentId,
      actionType,
      ...payload,
    });
    const next = previous
      .catch(() => undefined)
      .then(() => this.repository.withSyncWorker
        ? this.repository.withSyncWorker(tournamentId, () => this.runMirroredStartggActionWithRetry(tournamentId, actionType, payload, action))
        : this.runMirroredStartggActionWithRetry(tournamentId, actionType, payload, action))
      .then(() => undefined)
      .catch(error => console.error("[startgg:worker]", safeDiagnostic(error)));
    this.startggActionQueues.set(tournamentId, next);
    void next.finally(() => {
      if (actionKey) {
        const pendingKeys = this.pendingStartggActionKeys.get(tournamentId);
        pendingKeys?.delete(actionKey);
        if (pendingKeys && pendingKeys.size === 0) {
          this.pendingStartggActionKeys.delete(tournamentId);
        }
      }
      if (this.startggActionQueues.get(tournamentId) === next) {
        this.startggActionQueues.delete(tournamentId);
      }
    });
  }

  private async runMirroredStartggActionWithRetry(tournamentId: string, actionType: string, payload: Record<string, unknown>, action: () => Promise<void>): Promise<void> {
    const matchId = String(payload.matchId), version = Number(payload.actionVersion);
    const id = `${tournamentId}:${this.toStartggActionKey(actionType, payload)}`;
    const previous = this.repository.listSyncJobs ? (await this.repository.listSyncJobs(tournamentId)).find(job => job.id === id) : undefined;
    if (previous?.state === "SYNCED" || previous?.state === "SUPERSEDED" || previous?.state === "FAILED") return;
    let job: SyncJob = previous ?? { id, tournamentId, matchId, action: actionType, version, attempts: 0, state: "PENDING", updatedAt: new Date().toISOString() };
    const save = async (state: SyncJob["state"], error?: string) => {
      job = { ...job, state, error, updatedAt: new Date().toISOString() };
      if (this.repository.saveSyncJob) await this.repository.saveSyncJob(job);
    };
    for (let attempt = 1; attempt <= TournamentsService.STARTGG_ACTION_RETRY_ATTEMPTS; attempt++) {
      const context = await this.getMirroredSyncContext(tournamentId, matchId);
      if (!context || (context.match.externalRef?.localSyncVersion ?? 0) > version) { await save("SUPERSEDED"); return; }
      if ((context.match.externalRef?.syncedSyncVersion ?? 0) >= version) { await save("SYNCED"); return; }
      job.attempts += 1;
      await save("RUNNING");
      try {
        await action();
        const latest = await this.getMirroredSyncContext(tournamentId, matchId);
        const state = (latest?.match.externalRef?.syncedSyncVersion ?? 0) >= version ? "SYNCED" : "SUPERSEDED";
        await save(state);
        if (state === "SYNCED" && this.repository.appendActivity) await this.repository.appendActivity({
          id: createId("act"), tournamentId, matchId, action: "sync-confirmed", createdAt: new Date().toISOString(), platform: "backend",
        });
        return;
      } catch (error) {
        const message = safeDiagnostic(error instanceof Error ? error.message : error);
        const retryable = attempt < TournamentsService.STARTGG_ACTION_RETRY_ATTEMPTS && !/otro resultado|no coincide|disabled|not configured|forbidden|unauthorized/i.test(message);
        await save(retryable ? "PENDING" : "FAILED", message);
        if (!retryable) {
          if (this.repository.appendActivity) await this.repository.appendActivity({ id: createId("act"), tournamentId, matchId,
            action: "sync-failed", error: message, createdAt: new Date().toISOString(), platform: "backend" });
          return;
        }
        await this.delay(TournamentsService.STARTGG_ACTION_RETRY_DELAY_MS * attempt);
      }
    }
  }

  private async awaitStartggActionQueue(tournamentId: string): Promise<void> {
    const pending = this.startggActionQueues.get(tournamentId);
    if (!pending) {
      return;
    }
    this.logStartggDebug("waiting for queued start.gg actions before manual import", {
      tournamentId,
    });
    await pending.catch(() => undefined);
  }

  private async getMirroredSyncContext(
    tournamentId: string,
    matchId: string,
  ): Promise<{ tournament: Tournament; match: Match } | undefined> {
    const tournament = await this.repository.getTournament(tournamentId);
    if (!tournament) {
      return undefined;
    }
    const match = (await this.repository.listMatches(tournamentId)).find((item) => item.id === matchId);
    if (!match || !this.isMirroredStartggMatch(tournament, match)) {
      return undefined;
    }
    return { tournament, match };
  }

  private toStartggActionKey(actionType: string, payload: Record<string, unknown>): string | undefined {
    const matchId = typeof payload.matchId === "string" ? payload.matchId : undefined;
    const actionVersion = typeof payload.actionVersion === "number" ? payload.actionVersion : undefined;
    if (!matchId || actionVersion === undefined) {
      return undefined;
    }
    return `${actionType}:${matchId}:${actionVersion}`;
  }

  private shouldSkipQueuedMirroredStartggAction(
    match: Match,
    actionType: string,
    actionVersion: number,
  ): boolean {
    if (match.externalRef?.provider !== "START_GG") {
      return true;
    }
    const localSyncVersion = match.externalRef.localSyncVersion ?? 0;
    const syncedSyncVersion = match.externalRef.syncedSyncVersion ?? 0;
    if (localSyncVersion > actionVersion || syncedSyncVersion >= actionVersion) {
      return true;
    }
    if (actionType === "set-call" && (match.status === "PLAYING" || match.status === "COMPLETED" || match.status === "WALKOVER")) {
      return true;
    }
    if (actionType === "set-start" && (match.status === "COMPLETED" || match.status === "WALKOVER")) {
      return true;
    }
    return false;
  }

  private toQueuedMirroredCompletionSnapshot(currentMatch: Match, queuedSnapshot: Match): Match {
    if (queuedSnapshot.externalRef?.provider !== "START_GG" || currentMatch.externalRef?.provider !== "START_GG") {
      return queuedSnapshot;
    }

    return {
      ...queuedSnapshot,
      externalRef: {
        ...queuedSnapshot.externalRef,
        setId: currentMatch.externalRef.setId,
        identifier: currentMatch.externalRef.identifier ?? queuedSnapshot.externalRef.identifier,
        hasPlaceholder: currentMatch.externalRef.hasPlaceholder,
        isPoolPhase: currentMatch.externalRef.isPoolPhase ?? queuedSnapshot.externalRef.isPoolPhase,
        localSyncVersion: Math.max(
          queuedSnapshot.externalRef.localSyncVersion ?? 0,
          currentMatch.externalRef.localSyncVersion ?? 0,
        ),
        syncedSyncVersion: currentMatch.externalRef.syncedSyncVersion,
        resultSyncedAt: currentMatch.externalRef.resultSyncedAt,
        phaseId: currentMatch.externalRef.phaseId,
        phaseGroupId: currentMatch.externalRef.phaseGroupId,
        phaseName: currentMatch.externalRef.phaseName,
        phaseOrder: currentMatch.externalRef.phaseOrder,
        phaseGroupName: currentMatch.externalRef.phaseGroupName,
        phaseType: currentMatch.externalRef.phaseType,
        entrantSize: currentMatch.externalRef.entrantSize,
        fullRoundText: currentMatch.externalRef.fullRoundText,
        entrantIds: currentMatch.externalRef.entrantIds,
      },
    };
  }

  private async syncMirroredStartggSetCall(tournament: Tournament, match: Match, actionVersion: number): Promise<void> {
    if (!this.isMirroredStartggMatch(tournament, match) || match.externalRef?.provider !== "START_GG") {
      return;
    }
    const setId = this.canDirectlyMutatePreviewStartggSet(match)
      ? match.externalRef.setId
      : await this.resolveReportableStartggSetId(tournament, match);
    try {
      const remote = await this.startggClient.getSetState(setId);
      if ([2, 3, 6].includes(remote.state)) {
        await this.persistResolvedMirroredSetReference(tournament.id, match.id, setId, { syncedVersion: actionVersion });
        return;
      }
      const syncResult = await this.startggClient.markSetCalled(setId);
      await this.persistResolvedMirroredSetReference(tournament.id, match.id, syncResult.setId, { syncedVersion: actionVersion });
      await this.persistResolvedMirroredGroupSetReferences(tournament.id, match, syncResult);
      this.logStartggDebug("set call synced", {
        tournamentId: tournament.id,
        matchId: match.id,
        setId: syncResult.setId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!this.isPreviewStartggSetId(setId) || !message.includes("not found")) {
        throw error;
      }
      this.logStartggDebug("set call on preview failed - preview already promoted, resolving fresh", {
        tournamentId: tournament.id,
        matchId: match.id,
        previewSetId: setId,
      });
      const resolvedSetId = await this.resolveReportableStartggSetId(tournament, match);
      const syncResult = await this.startggClient.markSetCalled(resolvedSetId);
      await this.persistResolvedMirroredSetReference(tournament.id, match.id, syncResult.setId, { syncedVersion: actionVersion });
      await this.persistResolvedMirroredGroupSetReferences(tournament.id, match, syncResult);
      this.logStartggDebug("set call synced after resolution", {
        tournamentId: tournament.id,
        matchId: match.id,
        setId: syncResult.setId,
      });
    }
  }

  private async refreshMirroredPreviewMatchIfNeeded(
    tournament: Tournament,
    match: Match,
    reason: string,
  ): Promise<Match | undefined> {
    if (!this.isMirroredStartggMatch(tournament, match) || !tournament.importSource) {
      return undefined;
    }
    if (!this.isPreviewStartggSetId(match.externalRef?.setId) && !match.externalRef?.hasPlaceholder) {
      return undefined;
    }

    const previousMatches = await this.repository.listMatches(tournament.id);
    const snapshot = await this.loadStableStartggSnapshot(
      tournament,
      tournament.importSource.eventUrl,
      previousMatches,
      {
        includeGameDetails: false,
        allowFallback: true,
        attempts: 3,
        delayMs: 800,
        retryOnRateLimit: true,
        reason,
      },
    );
    if (!snapshot) {
      return undefined;
    }

    await this.applyStartggSnapshot(tournament, snapshot, {
      syncResults: tournament.importSource.syncResults,
      preserveTournamentTitle: true,
      preserveLocalProgress: true,
    });

    const refreshedMatches = await this.repository.listMatches(tournament.id);
    const refreshedMatch =
      refreshedMatches.find((item) => item.id === match.id)
      ?? refreshedMatches
        .filter(hasStartggMatchRef)
        .find((item) =>
          item.externalRef.phaseId === match.externalRef?.phaseId
          && (item.externalRef.phaseGroupId ?? "") === (match.externalRef?.phaseGroupId ?? "")
          && item.bracketStage === match.bracketStage
          && item.roundNumber === match.roundNumber
          && item.matchNumber === match.matchNumber
          && (item.externalRef.identifier ?? "") === (match.externalRef?.identifier ?? "")
          && item.externalRef.fullRoundText === match.externalRef?.fullRoundText,
        );

    this.logStartggDebug("preview match post-action reconcile", {
      tournamentId: tournament.id,
      reason,
      previousSetId: match.externalRef?.setId,
      refreshedSetId: refreshedMatch?.externalRef?.setId,
      hasPlaceholder: refreshedMatch?.externalRef?.hasPlaceholder,
      refreshedMatch: refreshedMatch ? this.describeMatchForDebug(refreshedMatch) : undefined,
    });

    return refreshedMatch;
  }

  private async syncMirroredStartggSetStarted(tournament: Tournament, match: Match, actionVersion: number): Promise<void> {
    if (!this.isMirroredStartggMatch(tournament, match) || match.externalRef?.provider !== "START_GG") {
      return;
    }
    const setId = await this.resolveReportableStartggSetId(tournament, match);
    const remote = await this.startggClient.getSetState(setId);
    if (remote.state === 2 || remote.state === 3) {
      await this.persistResolvedMirroredSetReference(tournament.id, match.id, setId, { syncedVersion: actionVersion });
      return;
    }
    const syncResult = await this.startggClient.markSetInProgress(setId);
    await this.persistResolvedMirroredSetReference(tournament.id, match.id, syncResult.setId, { syncedVersion: actionVersion });
    await this.persistResolvedMirroredGroupSetReferences(tournament.id, match, syncResult);
    this.logStartggDebug("set start synced", {
      tournamentId: tournament.id,
      matchId: match.id,
      setId: syncResult.setId,
    });
  }

  private async syncMirroredStartggMatchCompletion(tournament: Tournament, match: Match, actionVersion: number): Promise<Match> {
    if (!tournament.importSource || tournament.importSource.provider !== "START_GG") {
      return match;
    }
    if (!tournament.importSource.syncResults) {
      throw new Error("This mirrored start.gg tournament has result sync disabled");
    }
    if (!match.winnerParticipantId || match.externalRef?.provider !== "START_GG") {
      throw new Error("This mirrored start.gg set cannot be synced because it has no mapped winner or set ID");
    }

    const participants = await this.repository.listParticipants(tournament.id);
    const winner = participants.find((participant) => participant.id === match.winnerParticipantId);
    const winnerEntrantId = winner?.externalRef?.provider === "START_GG"
      ? winner.externalRef.entrantId
      : undefined;
    if (!winnerEntrantId) {
      throw new Error("The selected winner is not mapped to a start.gg entrant");
    }

    try {
      const reportableSetId = await this.resolveReportableStartggSetId(tournament, match);
      const normalizedMatch: Match = reportableSetId !== match.externalRef.setId
        ? {
            ...match,
            externalRef: {
              ...match.externalRef,
              setId: reportableSetId,
            },
          }
        : match;
      const wasPreviouslySynced = Boolean(normalizedMatch.externalRef?.resultSyncedAt);
      const gameData = this.toStartggGameData(normalizedMatch, participants);
      const remote = await this.startggClient.getSetState(reportableSetId);
      if (remote.state === 3) {
        const canonical = (selections: Array<{ entrantId: string; characterId: number }> = []) => selections.map(s => `${s.entrantId}:${s.characterId}`).sort();
        const expectedGames = gameData ?? [];
        const sameGames = remote.games.length === expectedGames.length && remote.games.every((game, index) =>
          game.winnerId === expectedGames[index].winnerId && stableJson(canonical(game.selections)) === stableJson(canonical(expectedGames[index].selections)));
        const sameResult = remote.winnerEntrantId === winnerEntrantId && (normalizedMatch.status === "WALKOVER" ? remote.disqualified : !remote.disqualified && sameGames);
        if (sameResult) {
          await this.persistMirroredResultSyncMetadata(tournament.id, match.id, reportableSetId, actionVersion);
          await this.refreshMirroredDownstreamProgressAfterGroupCompletion(tournament, match);
          return normalizedMatch;
        }
        if (!wasPreviouslySynced) throw new Error("start.gg ya tiene otro resultado o sus partidas no coinciden. Revisa el set antes de sincronizar.");
      }
      if (wasPreviouslySynced && remote.state === 3) {
        const resetSyncResult = await this.startggClient.resetSet(reportableSetId, true);
        await this.persistResolvedMirroredSetReference(tournament.id, match.id, resetSyncResult.setId);
        await this.persistResolvedMirroredGroupSetReferences(tournament.id, match, resetSyncResult);
        await this.updateStoredMatches(tournament.id, matches => matches.map(item =>
          item.id === match.id && item.externalRef?.provider === "START_GG" && item.externalRef.localSyncVersion === actionVersion
            ? { ...item, externalRef: { ...item.externalRef, resultSyncedAt: undefined }, updatedAt: new Date().toISOString() }
            : item));
        this.logStartggDebug("reported set reset before correction", {
          tournamentId: tournament.id,
          matchId: match.id,
          setId: resetSyncResult.setId,
          previousSyncedAt: normalizedMatch.externalRef?.resultSyncedAt,
        });
      }
      this.logStartggDebug("report result requested", {
        tournamentId: tournament.id,
        matchId: match.id,
        requestedSetId: match.externalRef.setId,
        reportableSetId,
        winnerEntrantId,
        isDQ: normalizedMatch.status === "WALKOVER",
        localMatch: this.describeMatchForDebug(normalizedMatch),
      });
      const syncResult = await this.startggClient.reportMatchResult(
        reportableSetId,
        winnerEntrantId,
        gameData,
        normalizedMatch.status === "WALKOVER",
      );
      this.logStartggDebug("report result sent", {
        tournamentId: tournament.id,
        matchId: match.id,
        setId: syncResult.setId,
        winnerEntrantId,
        localStatus: normalizedMatch.status,
        isDQ: normalizedMatch.status === "WALKOVER",
      });
      await this.persistMirroredResultSyncMetadata(tournament.id, match.id, syncResult.setId, actionVersion);
      await this.persistResolvedMirroredGroupSetReferences(tournament.id, match, syncResult);
      await this.refreshMirroredDownstreamProgressAfterGroupCompletion(tournament, match);
      return normalizedMatch;
    } catch (error) {
      this.logStartggDebug("report result failed", {
        tournamentId: tournament.id,
        matchId: match.id,
        setId: match.externalRef.setId,
        localMatch: this.describeMatchForDebug(match),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async resolveReportableStartggSetId(tournament: Tournament, match: Match): Promise<string> {
    if (match.externalRef?.provider !== "START_GG") {
      throw new Error("This mirrored start.gg set cannot be synced because it has no mapped set ID");
    }
    if (!this.isPreviewStartggSetId(match.externalRef.setId) && !match.externalRef.hasPlaceholder) {
      return match.externalRef.setId;
    }
    if (tournament.importSource?.provider !== "START_GG") {
      throw new Error("This mirrored start.gg set cannot be synced because it has no import source");
    }

    this.logStartggDebug("preview setId detected - resolving from start.gg", {
      tournamentId: tournament.id,
      matchId: match.id,
      previewSetId: match.externalRef.setId,
      localMatch: this.describeMatchForDebug(match),
    });

    const resolved = await this.startggClient.resolveSetReference({
      phaseId: match.externalRef.phaseId,
      phaseGroupId: match.externalRef.phaseGroupId,
      identifier: match.externalRef.identifier,
      phaseName: match.externalRef.phaseName,
      phaseOrder: match.externalRef.phaseOrder,
      phaseGroupName: match.externalRef.phaseGroupName,
      phaseType: match.externalRef.phaseType,
      isPoolPhase: match.externalRef.isPoolPhase,
      entrantSize: match.externalRef.entrantSize,
      bracketStage: match.bracketStage,
      roundNumber: match.roundNumber,
      matchNumber: match.matchNumber,
      fullRoundText: match.externalRef.fullRoundText,
    });

    if (!resolved || resolved.hasPlaceholder) {
      this.logStartggDebug("preview setId unresolved - retry required", {
        tournamentId: tournament.id,
        matchId: match.id,
        previewSetId: match.externalRef.setId,
        resolvedSetId: resolved?.setId,
        hasPlaceholder: resolved?.hasPlaceholder,
      });
      throw new Error("The start.gg set is not fully ready yet. Retrying in background.");
    }

    this.logStartggDebug("preview setId resolved", {
      tournamentId: tournament.id,
      matchId: match.id,
      previewSetId: match.externalRef.setId,
      resolvedSetId: resolved.setId,
    });
    await this.persistResolvedMirroredSetReference(tournament.id, match.id, resolved.setId);
    return resolved.setId;
  }

  private async persistResolvedMirroredSetReference(
    tournamentId: string,
    matchId: string,
    resolvedSetId: string,
    options: {
      syncedVersion?: number;
    } = {},
  ): Promise<void> {
    return this.inTournamentTransaction(tournamentId, async () => {
    const matches = await this.repository.listMatches(tournamentId);
    const currentMatch = matches.find((item) => item.id === matchId);
    if (
      !currentMatch?.externalRef
      || (
        currentMatch.externalRef.setId === resolvedSetId
        && (
          options.syncedVersion === undefined
          || (currentMatch.externalRef.syncedSyncVersion ?? 0) >= options.syncedVersion
        )
      )
    ) {
      return;
    }
    await this.repository.replaceMatches(
      tournamentId,
      matches.map((item) =>
        item.id !== matchId || item.externalRef?.provider !== "START_GG"
          ? item
          : {
              ...item,
              externalRef: {
                ...item.externalRef,
                setId: resolvedSetId,
                hasPlaceholder: false,
                syncedSyncVersion: options.syncedVersion !== undefined
                  ? Math.max(item.externalRef.syncedSyncVersion ?? 0, options.syncedVersion)
                  : item.externalRef.syncedSyncVersion,
              },
              updatedAt: new Date().toISOString(),
            },
      ),
    );
    this.logStartggDebug("persisted resolved start.gg setId", {
      tournamentId,
      matchId,
      resolvedSetId,
    });

    });
  }

  private async persistResolvedMirroredGroupSetReferences(
    tournamentId: string,
    match: Match,
    syncResult: StartggMutationSyncResult,
  ): Promise<void> {
    if (
      match.externalRef?.provider !== "START_GG"
      || !match.externalRef.phaseId
      || !match.externalRef.phaseGroupId
      || syncResult.updatedSetIds.length === 0
    ) {
      return;
    }

    const matches = await this.repository.listMatches(tournamentId);
    const groupMatches = matches.filter((item) =>
      item.externalRef?.provider === "START_GG"
      && item.externalRef.phaseId === match.externalRef?.phaseId
      && (item.externalRef.phaseGroupId ?? "") === (match.externalRef?.phaseGroupId ?? "")
    );
    if (groupMatches.length === 0) {
      return;
    }

    const resolvedMatches = await this.startggClient.resolveSetReferencesFromUpdatedIds({
      phaseId: match.externalRef.phaseId,
      phaseGroupId: match.externalRef.phaseGroupId,
      identifier: match.externalRef.identifier,
      phaseName: match.externalRef.phaseName,
      phaseOrder: match.externalRef.phaseOrder,
      phaseGroupName: match.externalRef.phaseGroupName,
      phaseType: match.externalRef.phaseType,
      isPoolPhase: match.externalRef.isPoolPhase,
      entrantSize: match.externalRef.entrantSize,
      bracketStage: match.bracketStage,
      roundNumber: match.roundNumber,
      matchNumber: match.matchNumber,
      fullRoundText: match.externalRef.fullRoundText,
    }, syncResult.updatedSetIds);
    if (resolvedMatches.length === 0) {
      return;
    }

    return this.inTournamentTransaction(tournamentId, async () => {
    const matches = await this.repository.listMatches(tournamentId);
    const resolvedByKey = new Map(
      resolvedMatches.map((item) => [
        `${item.identifier}|${item.bracketStage}|${item.roundNumber}|${item.matchNumber}|${item.fullRoundText}`,
        item,
      ]),
    );

    let changed = false;
    const updatedMatches = matches.map((item) => {
      if (
        !item.externalRef
        || item.externalRef.provider !== "START_GG"
        || item.externalRef.phaseId !== match.externalRef?.phaseId
        || (item.externalRef.phaseGroupId ?? "") !== (match.externalRef?.phaseGroupId ?? "")
      ) {
        return item;
      }
      const extRef = item.externalRef; let resolved = resolvedByKey.get(`${extRef.identifier ?? ""}|${item.bracketStage}|${item.roundNumber}|${item.matchNumber}|${extRef.fullRoundText ?? ""}`);
      if (!resolved && extRef.identifier) {
        const byId = [...resolvedByKey.entries()].find(([, candidate]) => candidate.identifier === extRef.identifier);
        if (byId) { resolved = byId[1]; }
      }
      if (!resolved || item.externalRef.setId === resolved.setId) {
        return item;
      }
      changed = true;
      return {
        ...item,
        externalRef: {
          ...item.externalRef,
          setId: resolved.setId,
          identifier: resolved.identifier,
          hasPlaceholder: resolved.hasPlaceholder,
        },
        updatedAt: new Date().toISOString(),
      };
    });

    if (!changed) {
      return;
    }

    await this.repository.replaceMatches(tournamentId, updatedMatches);
    this.logStartggDebug("persisted resolved start.gg group setIds", {
      tournamentId,
      phaseGroupId: match.externalRef?.phaseGroupId,
      updatedSetIds: syncResult.updatedSetIds,
      remappedMatches: updatedMatches
        .filter((item) =>
          item.externalRef?.provider === "START_GG"
          && item.externalRef.phaseId === match.externalRef?.phaseId
          && (item.externalRef.phaseGroupId ?? "") === (match.externalRef?.phaseGroupId ?? "")
        )
        .map((item) => ({
          matchId: item.id,
          setId: item.externalRef?.setId,
          identifier: item.externalRef?.identifier,
          fullRoundText: item.externalRef?.fullRoundText,
          roundNumber: item.roundNumber,
          matchNumber: item.matchNumber,
        })),
    });
    });
  }

  private async persistMirroredResultSyncMetadata(
    tournamentId: string,
    matchId: string,
    resolvedSetId: string,
    syncedVersion: number,
  ): Promise<void> {
    return this.inTournamentTransaction(tournamentId, async () => {
    const matches = await this.repository.listMatches(tournamentId);
    const currentMatch = matches.find((item) => item.id === matchId);
    if (!currentMatch?.externalRef || currentMatch.externalRef.provider !== "START_GG") {
      return;
    }
    const now = new Date().toISOString();
    await this.repository.replaceMatches(
      tournamentId,
      matches.map((item) =>
        item.id !== matchId || item.externalRef?.provider !== "START_GG"
          ? item
          : {
              ...item,
              externalRef: {
                ...item.externalRef,
                setId: resolvedSetId,
                hasPlaceholder: false,
                resultSyncedAt: now,
                syncedSyncVersion: Math.max(item.externalRef.syncedSyncVersion ?? 0, syncedVersion),
              },
              updatedAt: now,
            },
      ),
    );
    this.logStartggDebug("persisted mirrored result sync metadata", {
      tournamentId,
      matchId,
      resolvedSetId,
      syncedAt: now,
    });

    });
  }

  private describeMirroredGroups(matches: Match[]): Array<{ key: string; count: number; completed: number; pending: number }> {
    const groups = new Map<string, { count: number; completed: number; pending: number }>();
    matches.forEach((match) => {
      const key = this.mirroredPhaseGroupKey(match) ?? "unknown";
      const current = groups.get(key) ?? { count: 0, completed: 0, pending: 0 };
      current.count += 1;
      if (match.status === "COMPLETED" || match.status === "WALKOVER") {
        current.completed += 1;
      } else {
        current.pending += 1;
      }
      groups.set(key, current);
    });
    return Array.from(groups.entries()).map(([key, value]) => ({ key, ...value }));
  }

  private describeImportedGroups(matches: StartggImportedBracket["matches"]): Array<{ key: string; count: number; completed: number; pending: number }> {
    const groups = new Map<string, { count: number; completed: number; pending: number }>();
    matches.forEach((match) => {
      const key = [match.phaseId || match.phaseName || "phase", match.phaseGroupId || match.phaseGroupName || "group"].join("::");
      const current = groups.get(key) ?? { count: 0, completed: 0, pending: 0 };
      current.count += 1;
      if (match.status === "COMPLETED") {
        current.completed += 1;
      } else {
        current.pending += 1;
      }
      groups.set(key, current);
    });
    return Array.from(groups.entries()).map(([key, value]) => ({ key, ...value }));
  }

  private logStartggDebug(message: string, payload: Record<string, unknown>): void {
    if (!this.startggDebug) {
      return;
    }
    console.log(`[start.gg][debug] ${message} ${inspect(payload, {
      depth: null,
      colors: false,
      compact: false,
      breakLength: 120,
    })}`);
  }

  private isPreviewStartggSetId(setId: string | undefined): boolean {
    return typeof setId === "string" && setId.startsWith("preview_");
  }

  private canDirectlyMutatePreviewStartggSet(match: Match): boolean {
    return this.isPreviewStartggSetId(match.externalRef?.setId)
      && !match.externalRef?.hasPlaceholder
      && this.hasResolvedContenders(match);
  }

  private hasResolvedContenders(match: Match): boolean {
    return match.participants.length >= 2
      && match.participants.every((participant) => !this.isPlaceholderParticipantId(participant.participantId));
  }

  private async loadStableStartggSnapshot(
    tournament: Tournament,
    eventUrl: string,
    previousMatches: Match[],
    options: {
      includeGameDetails?: boolean;
      allowFallback?: boolean;
      attempts?: number;
      delayMs?: number;
      retryOnRateLimit?: boolean;
      reason?: string;
    } = {},
  ): Promise<StartggImportedBracket | undefined> {
    const includeGameDetails = options.includeGameDetails ?? true;
    const allowFallback = options.allowFallback ?? true;
    const attempts = options.attempts ?? TournamentsService.STARTGG_SNAPSHOT_STABILIZATION_ATTEMPTS;
    const delayMs = options.delayMs ?? TournamentsService.STARTGG_SNAPSHOT_STABILIZATION_DELAY_MS;
    const retryOnRateLimit = options.retryOnRateLimit ?? false;
    const reason = options.reason ?? "background-refresh";
    const previousMirroredMatches = previousMatches.filter(hasStartggMatchRef);
    if (previousMirroredMatches.length === 0) {
      return this.startggClient.importEventSnapshot(eventUrl, { includeGameDetails, onProgress: reason === "manual-import" ? progress => this.persistImportProgress(tournament.id, progress) : undefined });
    }

    let bestSnapshot: StartggImportedBracket | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let snapshot: StartggImportedBracket;
      try {
        snapshot = await this.startggClient.importEventSnapshot(eventUrl, { includeGameDetails, onProgress: reason === "manual-import" ? progress => this.persistImportProgress(tournament.id, progress) : undefined });
      } catch (error) {
        if (retryOnRateLimit && this.isStartggRateLimitError(error) && attempt < attempts) {
          this.logStartggDebug("snapshot rate limited - waiting", {
            tournamentId: tournament.id,
            attempt,
            reason,
          });
          await this.delay(delayMs);
          continue;
        }
        throw error;
      }
      const evaluation = this.evaluateStartggSnapshotStability(previousMirroredMatches, snapshot.matches);
      const score = evaluation.importedCount * 1000 + evaluation.coveredGroups * 100 - evaluation.missingGroups * 10;

      this.logStartggDebug("snapshot stability check", {
        tournamentId: tournament.id,
        attempt,
        importedCount: evaluation.importedCount,
        previousCount: evaluation.previousCount,
        coveredGroups: evaluation.coveredGroups,
        expectedGroups: evaluation.expectedGroups,
        missingGroups: evaluation.missingGroups,
        stable: evaluation.stable,
        reason,
      });

      if (score > bestScore) {
        bestSnapshot = snapshot;
        bestScore = score;
      }

      if (evaluation.stable) {
        return snapshot;
      }

      if (attempt < attempts) {
        await this.delay(delayMs);
      }
    }

    if (!allowFallback) {
      return undefined;
    }

    this.logStartggDebug("snapshot stabilization fallback", {
      tournamentId: tournament.id,
      importedCount: bestSnapshot?.matches.length ?? 0,
      attempts,
      reason,
    });

    return bestSnapshot ?? this.startggClient.importEventSnapshot(eventUrl, { includeGameDetails, onProgress: reason === "manual-import" ? progress => this.persistImportProgress(tournament.id, progress) : undefined });
  }

  private describeMatchForDebug(match: Match): Record<string, unknown> {
    return {
      id: match.id,
      setId: match.externalRef?.provider === "START_GG" ? match.externalRef.setId : undefined,
      localSyncVersion: match.externalRef?.provider === "START_GG" ? match.externalRef.localSyncVersion : undefined,
      syncedSyncVersion: match.externalRef?.provider === "START_GG" ? match.externalRef.syncedSyncVersion : undefined,
      status: match.status,
      participantIds: match.participants.map((participant) => participant.participantId),
      participantNames: match.participants.map((participant) => participant.displayName),
      scores: match.participants.map((participant) => participant.score),
      winnerParticipantId: match.winnerParticipantId,
      advancers: match.advancingParticipantIds ?? [],
      calledAt: match.call?.calledAt,
      startedAt: match.call?.startedAt,
      gameResults: match.gameResults ?? [],
    };
  }

  private isStartggRateLimitError(error: unknown): boolean {
    return error instanceof Error && /status 429\b/.test(error.message);
  }

  private evaluateStartggSnapshotStability(
    previousMatches: Match[],
    importedMatches: StartggImportedBracket["matches"],
  ): {
    previousCount: number;
    importedCount: number;
    expectedGroups: number;
    coveredGroups: number;
    missingGroups: number;
    stable: boolean;
  } {
    const previousGroupSizes = new Map<string, number>();
    previousMatches.forEach((match) => {
      const key = this.mirroredPhaseGroupKey(match);
      if (!key) {
        return;
      }
      previousGroupSizes.set(key, (previousGroupSizes.get(key) ?? 0) + 1);
    });

    const importedGroupSizes = new Map<string, number>();
    importedMatches.forEach((match) => {
      const key = [match.phaseId || match.phaseName || "phase", match.phaseGroupId || match.phaseGroupName || "group"].join("::");
      importedGroupSizes.set(key, (importedGroupSizes.get(key) ?? 0) + 1);
    });

    let coveredGroups = 0;
    let missingGroups = 0;
    previousGroupSizes.forEach((previousSize, key) => {
      const importedSize = importedGroupSizes.get(key) ?? 0;
      if (importedSize >= previousSize) {
        coveredGroups += 1;
      } else {
        missingGroups += 1;
      }
    });

    const stable =
      importedMatches.length >= previousMatches.length
      && missingGroups === 0;

    return {
      previousCount: previousMatches.length,
      importedCount: importedMatches.length,
      expectedGroups: previousGroupSizes.size,
      coveredGroups,
      missingGroups,
      stable,
    };
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private seedParticipants(
    participants: TournamentParticipant[],
    seedingMethod: Tournament["settings"]["seedingMethod"],
  ): TournamentParticipant[] {
    if (seedingMethod === "RANDOM") {
      const shuffled = [...participants];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      return shuffled;
    }

    return [...participants].sort((left, right) => {
      const leftSeed = left.seed ?? Number.MAX_SAFE_INTEGER;
      const rightSeed = right.seed ?? Number.MAX_SAFE_INTEGER;
      return leftSeed - rightSeed;
    });
  }

  private buildSingleEliminationBracket(
    tournamentId: string,
    seededParticipants: TournamentParticipant[],
    settings: Tournament["settings"],
  ): Match[] {
    const matches: Match[] = [];
    let roundParticipants = this.buildInitialBracketRoundParticipants(seededParticipants);
    let roundNumber = 1;

    while (roundParticipants.length > 1) {
      const roundMatches: Match[] = [];
      for (let index = 0; index < roundParticipants.length; index += 2) {
        roundMatches.push(
          this.createMatch(
            tournamentId,
            "WINNERS",
            roundNumber,
            roundMatches.length + 1,
            roundParticipants[index],
            roundParticipants[index + 1],
            this.bestOfForBracketStage(settings, "WINNERS"),
          ),
        );
      }

      matches.push(...roundMatches);
      roundParticipants = roundMatches.map((match) => this.toWinnerAdvancer(match, matches));
      roundNumber += 1;
    }

    return matches;
  }

  private buildDoubleEliminationBracket(
    tournamentId: string,
    seededParticipants: TournamentParticipant[],
    settings: Tournament["settings"],
  ): Match[] {
    const matches: Match[] = [];
    const winnersRounds: Match[][] = [];
    let winnerEntrants = this.buildInitialBracketRoundParticipants(seededParticipants);
    let winnersRoundNumber = 1;

    while (winnerEntrants.length > 1) {
      const roundMatches: Match[] = [];
      for (let index = 0; index < winnerEntrants.length; index += 2) {
        roundMatches.push(
          this.createMatch(
            tournamentId,
            "WINNERS",
            winnersRoundNumber,
            roundMatches.length + 1,
            winnerEntrants[index],
            winnerEntrants[index + 1],
            this.bestOfForBracketStage(settings, "WINNERS"),
          ),
        );
      }

      matches.push(...roundMatches);
      winnersRounds.push(roundMatches);
      winnerEntrants = roundMatches.map((match) => this.toWinnerAdvancer(match, matches));
      winnersRoundNumber += 1;
    }

    let losersRoundNumber = 1;
    let currentLosersAdvancers: Array<MatchParticipant | undefined> = [];

    // Keep empty positions until the next round has been wired. Compacting byes
    // changes which winners branch a survivor belongs to and undoes crossovers.
    const addLosersMatch = (round: number, position: number, left?: MatchParticipant, right?: MatchParticipant) => {
      if (!left && !right) return undefined;
      const match = this.createMatch(tournamentId, "LOSERS", round, position, left, right,
        this.bestOfForBracketStage(settings, "LOSERS"));
      matches.push(match);
      return this.toWinnerAdvancer(match, matches);
    };

    const firstLoserSeeds = winnersRounds[0]
      .map((match) => this.matchCanProduceLoser(match)
        ? this.createPlaceholderParticipant(match.id, "loser", 1, matches) : undefined);
    for (let index = 0; index < firstLoserSeeds.length; index += 2) {
      currentLosersAdvancers.push(addLosersMatch(losersRoundNumber, index / 2 + 1,
        firstLoserSeeds[index], firstLoserSeeds[index + 1]));
    }
    losersRoundNumber += 1;

    for (let winnersIndex = 1; winnersIndex < winnersRounds.length; winnersIndex += 1) {
      const integrationAdvancers: Array<MatchParticipant | undefined> = [];
      const droppingLosers = this.orderLosersForCrossover(winnersRounds[winnersIndex], winnersIndex)
        .map((match) => this.matchCanProduceLoser(match)
          ? this.createPlaceholderParticipant(match.id, "loser", 2, matches) : undefined);
      const integrationSize = Math.max(currentLosersAdvancers.length, droppingLosers.length);

      for (let index = 0; index < integrationSize; index += 1) {
        integrationAdvancers.push(addLosersMatch(losersRoundNumber, index + 1,
          currentLosersAdvancers[index], droppingLosers[index]));
      }

      currentLosersAdvancers = integrationAdvancers;
      losersRoundNumber += 1;

      if (winnersIndex === winnersRounds.length - 1) {
        break;
      }

      const compressionAdvancers: Array<MatchParticipant | undefined> = [];
      for (let index = 0; index < currentLosersAdvancers.length; index += 2) {
        compressionAdvancers.push(addLosersMatch(losersRoundNumber, index / 2 + 1,
          currentLosersAdvancers[index], currentLosersAdvancers[index + 1]));
      }

      currentLosersAdvancers = compressionAdvancers;
      losersRoundNumber += 1;
    }

    const winnersFinal = winnersRounds[winnersRounds.length - 1][0];
    const losersFinalist = currentLosersAdvancers[0];
    const grandFinal = this.createMatch(
      tournamentId,
      "FINALS",
      1,
      1,
      this.toWinnerAdvancer(winnersFinal, matches, 1),
      losersFinalist ? { ...losersFinalist, slot: 2 } : undefined,
      this.bestOfForBracketStage(settings, "FINALS"),
    );
    matches.push(grandFinal);
    matches.push(
      this.createMatch(
        tournamentId,
        "FINALS",
        2,
        1,
        this.createPlaceholderParticipant(grandFinal.id, "winner", 1, matches),
        this.createPlaceholderParticipant(grandFinal.id, "loser", 2, matches),
        this.bestOfForBracketStage(settings, "FINALS"),
      ),
    );

    return matches;
  }

  private ensureLocalDrawCanChange(tournament: Tournament, matches: Match[]): void {
    if (["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(tournament.status)
      || matches.some(match => this.hasRealMatchActivity(match))) {
      throw new Error("La bracket ya está iniciada o el torneo está cerrado. Reinicia el torneo antes de cambiar inscritos, seeds o regenerar los cruces");
    }
  }

  private orderLosersForCrossover(round: Match[], winnersIndex: number): Match[] {
    // A fixed routing chosen at generation time, independent of actual results.
    // Rotate reverse / reverse+half-shift / half-shift / natural across drops;
    // reversing every wave would rejoin earlier branches in larger brackets.
    const wave = (winnersIndex - 1) % 4;
    const ordered = [...round];
    if (wave < 2) ordered.reverse();
    if ((wave === 1 || wave === 2) && ordered.length > 1) {
      const middle = ordered.length / 2;
      return [...ordered.slice(middle), ...ordered.slice(0, middle)];
    }
    return ordered;
  }

  private buildMarioKartBracket(
    tournamentId: string,
    seededParticipants: TournamentParticipant[],
    settings: Tournament["settings"],
  ): Match[] {
    const advanceCount = settings.mkartAdvanceCount ?? 1;
    if (seededParticipants.length < 2) {
      throw new Error("MKART requires at least 2 participants");
    }

    const matches: Match[] = [];
    let roundNumber = 1;
    let roundParticipants = seededParticipants.map((participant, index) =>
      this.toMatchParticipant(participant, index + 1),
    );

    while (roundParticipants.length > 4) {
      const roundMatches: Match[] = [];
      for (const group of this.buildMarioKartRoundGroups(roundParticipants)) {
        const groupAdvancers = this.resolveMarioKartGroupAdvancers(group.length, advanceCount);
        roundMatches.push(
          this.createMatch(
            tournamentId,
            "WINNERS",
            roundNumber,
            roundMatches.length + 1,
            group[0],
            group[1],
            1,
            group.slice(2),
            groupAdvancers,
          ),
        );
      }

      matches.push(...roundMatches);
      roundParticipants = roundMatches.flatMap((match) =>
        this.toMarioKartAdvancers(match, matches),
      );
      roundNumber += 1;
    }

    matches.push(
      this.createMatch(
        tournamentId,
        "FINALS",
        1,
        1,
        roundParticipants[0],
        roundParticipants[1],
        1,
        roundParticipants.slice(2),
        1,
      ),
    );

    return matches;
  }

  private buildMarioKartDoubleEliminationBracket(
    tournamentId: string,
    seededParticipants: TournamentParticipant[],
    settings: Tournament["settings"],
  ): Match[] {
    const winnersAdvanceCount = settings.mkartAdvanceCount ?? 1;
    const losersAdvanceCount = settings.mkartLosersAdvanceCount ?? winnersAdvanceCount;
    if (seededParticipants.length < 2) {
      throw new Error("MKART requires at least 2 participants");
    }

    const matches: Match[] = [];
    const winnersRounds: Match[][] = [];
    let winnersRoundNumber = 1;
    let winnerParticipants = seededParticipants.map((participant, index) =>
      this.toMatchParticipant(participant, index + 1),
    );

    while (winnerParticipants.length > 2) {
      const roundMatches: Match[] = [];
      const finalWinnersRound = winnerParticipants.length <= 4;
      for (const group of this.buildMarioKartRoundGroups(winnerParticipants)) {
        const groupAdvancers = finalWinnersRound
          ? this.resolveMarioKartFinalSideAdvancers(group.length)
          : this.resolveMarioKartGroupAdvancers(group.length, winnersAdvanceCount);
        roundMatches.push(
          this.createMatch(
            tournamentId,
            "WINNERS",
            winnersRoundNumber,
            roundMatches.length + 1,
            group[0],
            group[1],
            1,
            group.slice(2),
            groupAdvancers,
          ),
        );
      }

      matches.push(...roundMatches);
      winnersRounds.push(roundMatches);
      winnerParticipants = roundMatches.flatMap((match) => this.toMarioKartAdvancers(match, matches));
      winnersRoundNumber += 1;
    }

    const losersSeeds = winnersRounds.flatMap((round) =>
      round.flatMap((match) => {
        const droppedCount = Math.max(match.participants.length - match.advancersRequired, 0);
        return Array.from({ length: droppedCount }, (_, index) =>
          this.createMarioKartDroppedPlaceholderParticipant(match.id, index + 1, index + 1, matches),
        );
      }),
    );

    if (losersSeeds.length > 0) {
      let losersRoundNumber = 1;
      let losersParticipants = losersSeeds;

      while (losersParticipants.length > 2) {
        const roundMatches: Match[] = [];
        const finalLosersRound = losersParticipants.length <= 4;
        for (const group of this.buildMarioKartRoundGroups(losersParticipants)) {
          const groupAdvancers = finalLosersRound
            ? this.resolveMarioKartFinalSideAdvancers(group.length)
            : this.resolveMarioKartGroupAdvancers(group.length, losersAdvanceCount);
          roundMatches.push(
            this.createMatch(
              tournamentId,
              "LOSERS",
              losersRoundNumber,
              roundMatches.length + 1,
              group[0],
              group[1],
              1,
              group.slice(2),
              groupAdvancers,
            ),
          );
        }

        matches.push(...roundMatches);
        losersParticipants = roundMatches.flatMap((match) => this.toMarioKartAdvancers(match, matches));
        losersRoundNumber += 1;
      }

      const losersFinalists = losersParticipants.map((participant, index) => ({
        ...participant,
        slot: winnerParticipants.length + index + 1,
      }));
      const winnersFinalists = winnerParticipants.map((participant, index) => ({
        ...participant,
        slot: index + 1,
      }));
      const finalists = [...winnersFinalists, ...losersFinalists];

      if (finalists.length > 0) {
        matches.push(
          this.createMatch(
            tournamentId,
            "FINALS",
            1,
            1,
            finalists[0],
            finalists[1],
            1,
            finalists.slice(2),
            1,
          ),
        );
      }
      return matches;
    }

    if (winnerParticipants.length > 0) {
      const finalists = winnerParticipants.map((participant, index) => ({
        ...participant,
        slot: index + 1,
      }));
      matches.push(
        this.createMatch(
          tournamentId,
          "FINALS",
          1,
          1,
          finalists[0],
          finalists[1],
          1,
          finalists.slice(2),
          1,
        ),
      );
    }

    return matches;
  }

  private buildMarioKartRoundGroups(participants: MatchParticipant[]): MatchParticipant[][] {
    if (participants.length <= 4) {
      return [participants];
    }

    const groupCount = Math.ceil(participants.length / 4);
    const baseSize = Math.floor(participants.length / groupCount);
    const remainder = participants.length % groupCount;
    const groups: MatchParticipant[][] = [];
    let cursor = 0;

    for (let index = 0; index < groupCount; index += 1) {
      const size = baseSize + (index < remainder ? 1 : 0);
      groups.push(participants.slice(cursor, cursor + size));
      cursor += size;
    }

    return groups.filter((group) => group.length > 0);
  }

  private resolveMarioKartGroupAdvancers(groupSize: number, configuredAdvanceCount: number): number {
    if (groupSize <= 1) {
      return groupSize;
    }

    return Math.min(configuredAdvanceCount, Math.max(groupSize - 1, 1));
  }

  private resolveMarioKartFinalSideAdvancers(groupSize: number): number {
    if (groupSize <= 1) {
      return groupSize;
    }

    return Math.min(2, Math.max(groupSize - 1, 1));
  }

  private createMatch(
    tournamentId: string,
    bracketStage: Match["bracketStage"],
    roundNumber: number,
    matchNumber: number,
    left?: MatchParticipant,
    right?: MatchParticipant,
    bestOf = 1,
    extras: MatchParticipant[] = [],
    advancersRequired = 1,
  ): Match {
    const now = new Date().toISOString();
    const participants = [left, right, ...extras]
      .filter((participant): participant is MatchParticipant => participant !== undefined)
      .map((participant, index) => ({
        ...participant,
        slot: index + 1,
      }));
    const singleParticipant = participants.length === 1 ? participants[0] : undefined;
    const autoAdvancingParticipants = participants.length > 0 && participants.length <= advancersRequired
      ? participants
      : singleParticipant
        ? [singleParticipant]
        : [];
    const advancingParticipantIds = autoAdvancingParticipants.map((participant) => participant.participantId);
    const effectiveWinnerParticipantId = advancersRequired === 1 && advancingParticipantIds.length > 0
      ? advancingParticipantIds[0]
      : singleParticipant?.participantId;

    return {
      id: createId("mat"),
      tournamentId,
      bracketStage,
      roundNumber,
      matchNumber,
      status: autoAdvancingParticipants.length > 0 ? "COMPLETED" : "PENDING",
      bestOf,
      advancersRequired,
      participants: participants.map((participant) => ({
        ...participant,
        score: advancingParticipantIds.includes(participant.participantId) ? 1 : 0,
      })),
      advancingParticipantIds,
      winnerParticipantId: effectiveWinnerParticipantId,
      createdAt: now,
      updatedAt: now,
    };
  }

  private toWinnerAdvancer(match: Match, matches: Match[], slot: 1 | 2 = 1): MatchParticipant {
    const resolved = match.winnerParticipantId
      ? match.participants.find((participant) => participant.participantId === match.winnerParticipantId)
      : undefined;

    return resolved
      ? {
          id: createId("mp"),
          participantId: resolved.participantId,
          displayName: resolved.displayName,
          slot,
          score: 0,
        }
      : this.createPlaceholderParticipant(match.id, "winner", slot, matches);
  }

  private toMarioKartAdvancers(match: Match, matches: Match[]): MatchParticipant[] {
    return Array.from({ length: match.advancersRequired }, (_, index) => {
      const participantId = match.advancingParticipantIds?.[index];
      const resolved = participantId
        ? match.participants.find((participant) => participant.participantId === participantId)
        : undefined;

      return resolved
        ? {
            id: createId("mp"),
            participantId: resolved.participantId,
            displayName: resolved.displayName,
            slot: index + 1,
            score: 0,
          }
        : this.createMarioKartPlaceholderParticipant(match.id, index + 1, index + 1, matches);
    });
  }

  private toMarioKartDroppedParticipants(match: Match, matches: Match[]): MatchParticipant[] {
    const droppedCount = Math.max(match.participants.length - match.advancersRequired, 0);
    const advancedIds = new Set(match.advancingParticipantIds ?? []);
    const droppedResolved = match.participants.filter((participant) => !advancedIds.has(participant.participantId));

    return Array.from({ length: droppedCount }, (_, index) => {
      const resolved = droppedResolved[index];
      return resolved
        ? {
            id: createId("mp"),
            participantId: resolved.participantId,
            displayName: resolved.displayName,
            slot: index + 1,
            score: 0,
          }
        : this.createMarioKartDroppedPlaceholderParticipant(match.id, index + 1, index + 1, matches);
    });
  }

  // A score/character correction with unchanged local advancement must not erase
  // later games, calls or an already played grand final reset.
  private async persistLocalScoreCorrection(tournament: Tournament, matches: Match[], previous: Match, updated: Match): Promise<boolean> {
    if (!this.hasLocalStandardBracket(tournament) || previous.status !== 'COMPLETED' || updated.status !== 'COMPLETED'
      || !previous.winnerParticipantId || previous.winnerParticipantId !== updated.winnerParticipantId) return false;
    await this.repository.replaceMatches(tournament.id, matches.map(match => match.id === updated.id ? updated : match));
    const corrected = { ...tournament, updatedAt: new Date().toISOString() };
    await this.repository.saveTournament(corrected);
    await this.notifySafely('match-resolved', () => this.notifier.notifyMatchResolved(corrected, updated));
    return true;
  }

  private async applyMatchResolution(
    tournamentId: string,
    tournament: Tournament,
    matches: Match[],
    resolvedMatch: Match,
    options: {
      skipExternalSync?: boolean;
    } = {},
  ): Promise<{ matches: Match[]; tournament: Tournament }> {
    const progressedMatches = matches.map((item) => (item.id === resolvedMatch.id ? resolvedMatch : item));
    const shouldActivateGrandFinalReset = this.shouldActivateGrandFinalReset(resolvedMatch);
    const baseMatches = shouldActivateGrandFinalReset
      ? progressedMatches
      : this.resetDependentMatches(progressedMatches, resolvedMatch.id, resolvedMatch.winnerParticipantId);
    const resolvedWinner = resolvedMatch.winnerParticipantId
      ? resolvedMatch.participants.find(
          (participant) => participant.participantId === resolvedMatch.winnerParticipantId,
        )
      : undefined;
    const resolvedLoser = resolvedWinner
      ? resolvedMatch.participants.find(
          (participant) => participant.participantId !== resolvedMatch.winnerParticipantId,
        )
      : undefined;
    const mkartAdvancers = resolvedMatch.advancingParticipantIds
      ?.map((participantId) => resolvedMatch.participants.find((participant) => participant.participantId === participantId))
      .filter((participant): participant is MatchParticipant => participant !== undefined)
      ?? [];
    const mkartDropped = resolvedMatch.advancingParticipantIds
      ? resolvedMatch.participants.filter(
          (participant) => !resolvedMatch.advancingParticipantIds?.includes(participant.participantId),
        )
      : [];

    const withProgression = shouldActivateGrandFinalReset && (resolvedWinner || resolvedLoser || mkartAdvancers.length > 0 || mkartDropped.length > 0)
      ? baseMatches.map((item) =>
          item.id === resolvedMatch.id
            ? item
            : {
                ...item,
                participants: item.participants.map((participant) =>
                  participant.participantId === `winner_of_${resolvedMatch.id}` && resolvedWinner
                    ? {
                        ...participant,
                        participantId: resolvedWinner.participantId,
                        displayName: resolvedWinner.displayName,
                      }
                    : participant.participantId === `loser_of_${resolvedMatch.id}` && resolvedLoser
                      ? {
                          ...participant,
                          participantId: resolvedLoser.participantId,
                          displayName: resolvedLoser.displayName,
                        }
                      : participant.participantId.startsWith("advance_") && participant.participantId.endsWith(`_of_${resolvedMatch.id}`)
                        ? (() => {
                            const placementText = participant.participantId.split("_")[1];
                            const placement = Number(placementText);
                            const advanced = mkartAdvancers[placement - 1];
                            return advanced
                              ? {
                                  ...participant,
                                  participantId: advanced.participantId,
                                  displayName: advanced.displayName,
                                }
                              : participant;
                          })()
                      : participant.participantId.startsWith("drop_") && participant.participantId.endsWith(`_of_${resolvedMatch.id}`)
                        ? (() => {
                            const placementText = participant.participantId.split("_")[1];
                            const placement = Number(placementText);
                            const dropped = mkartDropped[placement - 1];
                            return dropped
                              ? {
                                  ...participant,
                                  participantId: dropped.participantId,
                                  displayName: dropped.displayName,
                                }
                              : participant;
                          })()
                      : participant,
                ),
              },
        )
      : baseMatches;

    const locallyResolvedMatches = this.resolveDependentParticipantsFromLocalMatches(withProgression, this.hasLocalStandardBracket(tournament));
    this.logMirroredGroupProgressAfterResolution(tournament, locallyResolvedMatches, resolvedMatch);

    await this.repository.replaceMatches(tournamentId, locallyResolvedMatches);
    const updatedTournament: Tournament = {
      ...tournament,
      status: this.isTournamentComplete(locallyResolvedMatches) ? "COMPLETED" : "IN_PROGRESS",
      updatedAt: new Date().toISOString(),
    };
    await this.repository.saveTournament(updatedTournament);
    if (!options.skipExternalSync) {
      await this.syncResolvedMatchToStartgg(updatedTournament, resolvedMatch);
    }
    return {
      matches: locallyResolvedMatches,
      tournament: updatedTournament,
    };
  }

  private resolveDependentParticipantsFromLocalMatches(matches: Match[], repairLocalPasses = false): Match[] {
    const sourceMatches = new Map(matches.map((match) => [match.id, match]));
    let changed = true;
    let currentMatches = matches;
    let guard = 0;

    while (changed && guard < (repairLocalPasses ? matches.length + 1 : 4)) {
      changed = false;
      currentMatches = currentMatches.map((match) => {
        const participants = match.participants.map((participant) => {
          const resolved = this.resolveLocalDependentParticipant(participant.participantId, sourceMatches);
          if (!resolved || resolved.id === participant.participantId) {
            return participant;
          }
          changed = true;
          return {
            ...participant,
            participantId: resolved.id,
            displayName: resolved.displayName,
          };
        });
        let updated = participants.some((participant, index) => participant !== match.participants[index])
          ? { ...match, participants } : match;
        if (repairLocalPasses) updated = this.normalizeLocalAutomaticPass(updated);
        if (updated !== match) changed = true;
        return updated;
      });
      currentMatches.forEach((match) => sourceMatches.set(match.id, match));
      guard += 1;
    }

    return currentMatches;
  }

  private resolveLocalDependentParticipant(
    participantId: string,
    sourceMatches: Map<string, Match>,
  ): { id: string; displayName: string } | undefined {
    if (participantId.startsWith("winner_of_")) {
      const sourceMatchId = participantId.slice("winner_of_".length);
      const source = sourceMatches.get(sourceMatchId);
      if (!source?.winnerParticipantId) {
        return undefined;
      }
      const winner = source.participants.find((participant) => participant.participantId === source.winnerParticipantId);
      return winner ? { id: winner.participantId, displayName: winner.displayName } : undefined;
    }
    if (participantId.startsWith("loser_of_")) {
      const sourceMatchId = participantId.slice("loser_of_".length);
      const source = sourceMatches.get(sourceMatchId);
      if (!source?.winnerParticipantId) {
        return undefined;
      }
      const loser = source.participants.find((participant) => participant.participantId !== source.winnerParticipantId);
      return loser ? { id: loser.participantId, displayName: loser.displayName } : undefined;
    }
    const advanceMatch = /^advance_(\d+)_of_(.+)$/.exec(participantId);
    if (advanceMatch) {
      const placement = Number(advanceMatch[1]);
      const sourceMatchId = advanceMatch[2];
      const source = sourceMatches.get(sourceMatchId);
      const advancedParticipantId = source?.advancingParticipantIds?.[placement - 1];
      if (!advancedParticipantId) {
        return undefined;
      }
      const participant = source.participants.find((item) => item.participantId === advancedParticipantId);
      return participant ? { id: participant.participantId, displayName: participant.displayName } : undefined;
    }
    const dropMatch = /^drop_(\d+)_of_(.+)$/.exec(participantId);
    if (dropMatch) {
      const placement = Number(dropMatch[1]);
      const sourceMatchId = dropMatch[2];
      const source = sourceMatches.get(sourceMatchId);
      if (!source) {
        return undefined;
      }
      const advancedIds = new Set(source.advancingParticipantIds ?? []);
      const droppedParticipants = source.participants.filter((participant) => !advancedIds.has(participant.participantId));
      const dropped = droppedParticipants[placement - 1];
      return dropped ? { id: dropped.participantId, displayName: dropped.displayName } : undefined;
    }
    return undefined;
  }

  private logMirroredGroupProgressAfterResolution(
    tournament: Tournament,
    matches: Match[],
    resolvedMatch: Match,
  ): void {
    if (tournament.importSource?.provider !== "START_GG") {
      return;
    }
    const resolvedGroupKey = this.mirroredPhaseGroupKey(resolvedMatch);
    if (!resolvedGroupKey) {
      return;
    }

    const groupMatches = matches.filter((match) => this.mirroredPhaseGroupKey(match) === resolvedGroupKey);
    const unresolvedMatches = groupMatches
      .filter((match) => match.status !== "COMPLETED" && match.status !== "WALKOVER")
      .map((match) => ({
        ...this.describeMatchForDebug(match),
        unresolvedParticipants: match.participants
          .filter((participant) => this.isPlaceholderParticipantId(participant.participantId))
          .map((participant) => ({
            participantId: participant.participantId,
            displayName: participant.displayName,
          })),
      }));

    this.logStartggDebug("local mirrored progression state", {
      tournamentId: tournament.id,
      resolvedMatchId: resolvedMatch.id,
      groupKey: resolvedGroupKey,
      groupCompleted: groupMatches.filter((match) => match.status === "COMPLETED" || match.status === "WALKOVER").length,
      groupPending: groupMatches.filter((match) => match.status !== "COMPLETED" && match.status !== "WALKOVER").length,
      unresolvedMatches,
    });
  }

  private async refreshMirroredDownstreamProgressAfterGroupCompletion(
    tournament: Tournament,
    resolvedMatch: Match,
  ): Promise<void> {
    if (tournament.importSource?.provider !== "START_GG") {
      return;
    }
    const resolvedGroupKey = this.mirroredPhaseGroupKey(resolvedMatch);
    if (!resolvedGroupKey) {
      return;
    }

    const currentMatches = await this.repository.listMatches(tournament.id);
    const resolvedGroupMatches = currentMatches.filter((match) => this.mirroredPhaseGroupKey(match) === resolvedGroupKey);
    if (resolvedGroupMatches.length === 0) {
      return;
    }

    const groupCompleted = resolvedGroupMatches.every((match) =>
      match.status === "COMPLETED" || match.status === "WALKOVER",
    );
    if (!groupCompleted) {
      return;
    }

    const resolvedPhaseOrder = resolvedMatch.externalRef?.phaseOrder ?? Number.MAX_SAFE_INTEGER;
    const downstreamMatches = currentMatches.filter((match) =>
      hasStartggMatchRef(match)
      && (match.externalRef.phaseOrder ?? Number.MAX_SAFE_INTEGER) > resolvedPhaseOrder
      && match.participants.some((participant) => this.isPlaceholderParticipantId(participant.participantId)),
    );
    if (downstreamMatches.length === 0) {
      return;
    }
    const downstreamSources = this.collectMirroredSourcesFromMatches(downstreamMatches);
    if (downstreamSources.length === 0) {
      return;
    }

    this.logStartggDebug("downstream mirrored refresh requested after group completion", {
      tournamentId: tournament.id,
      resolvedMatchId: resolvedMatch.id,
      resolvedGroupKey,
      downstreamGroupKeys: Array.from(new Set(
        downstreamMatches
          .map((match) => this.mirroredPhaseGroupKey(match))
          .filter((key): key is string => Boolean(key)),
      )),
      downstreamMatchIds: downstreamMatches.map((match) => match.id),
      downstreamSources,
    });

    const refreshedSubset = await this.loadStableDownstreamMirroredMatches(
      tournament,
      downstreamSources,
      {
        attempts: 4,
        delayMs: 700,
        reason: "post-group-complete-downstream-refresh",
      },
    );
    if (refreshedSubset.length === 0) {
      this.logStartggDebug("downstream mirrored refresh skipped - no downstream snapshot", {
        tournamentId: tournament.id,
        resolvedMatchId: resolvedMatch.id,
        resolvedGroupKey,
      });
      return;
    }

    const latestMatches = await this.repository.listMatches(tournament.id);
    const latestDownstreamMatches = latestMatches.filter((match) =>
      hasStartggMatchRef(match)
      && (match.externalRef.phaseOrder ?? Number.MAX_SAFE_INTEGER) > resolvedPhaseOrder,
    );
    this.logStartggDebug("downstream mirrored refresh rebased on latest local state", {
      tournamentId: tournament.id,
      resolvedMatchId: resolvedMatch.id,
      resolvedGroupKey,
      previousMatchCount: currentMatches.length,
      latestMatchCount: latestMatches.length,
      latestDownstreamGroups: this.describeMirroredGroups(latestDownstreamMatches),
    });

    const refreshedMatches = await this.applyMirroredMatchSubset(
      tournament,
      refreshedSubset,
      latestMatches,
      true,
    );
    this.logStartggDebug("downstream mirrored refresh applied after group completion", {
      tournamentId: tournament.id,
      resolvedMatchId: resolvedMatch.id,
      resolvedGroupKey,
      groups: this.describeMirroredGroups(refreshedMatches),
      downstreamGroups: this.describeMirroredGroups(
        refreshedMatches.filter((match) =>
          hasStartggMatchRef(match)
          && (match.externalRef.phaseOrder ?? Number.MAX_SAFE_INTEGER) > resolvedPhaseOrder,
        ),
      ),
    });
  }

  private collectMirroredSourcesFromMatches(matches: Match[]): StartggMirroredSourceRef[] {
    return matches
      .filter(hasStartggMatchRef)
      .filter((match): match is Match & { externalRef: NonNullable<Match["externalRef"]> & {
        provider: "START_GG";
        phaseId: string;
        phaseName: string;
        phaseOrder: number;
        phaseType: string;
        entrantSize: number;
      } } =>
        Boolean(match.externalRef.phaseId)
        && Boolean(match.externalRef.phaseName)
        && match.externalRef.phaseOrder !== undefined
        && Boolean(match.externalRef.phaseType)
        && match.externalRef.entrantSize !== undefined,
      )
      .map((match) => ({
        phaseId: match.externalRef.phaseId,
        phaseGroupId: match.externalRef.phaseGroupId,
        phaseName: match.externalRef.phaseName,
        phaseOrder: match.externalRef.phaseOrder,
        phaseType: match.externalRef.phaseType,
        isPoolPhase: match.externalRef.isPoolPhase ?? false,
        phaseGroupName: match.externalRef.phaseGroupName,
        entrantSize: match.externalRef.entrantSize,
      }))
      .filter((source, index, array) =>
        array.findIndex((candidate) =>
          candidate.phaseId === source.phaseId
          && (candidate.phaseGroupId ?? "") === (source.phaseGroupId ?? "")
        ) === index,
      );
  }

  private async loadStableDownstreamMirroredMatches(
    tournament: Tournament,
    sources: StartggMirroredSourceRef[],
    options: {
      attempts?: number;
      delayMs?: number;
      reason?: string;
    } = {},
  ): Promise<StartggMirroredMatch[]> {
    const attempts = options.attempts ?? 3;
    const delayMs = options.delayMs ?? 700;
    const reason = options.reason ?? "downstream-refresh";
    let bestMatches: StartggMirroredMatch[] = [];
    let bestResolvedCount = -1;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const matches = await this.startggClient.importMatchesForSources(sources, { includeGameDetails: false });
        const resolvedCount = matches.reduce((count: number, match: StartggMirroredMatch) =>
          count + match.slots.filter((slot) => Boolean(slot.entrantId)).length, 0);
        this.logStartggDebug("downstream mirrored snapshot attempt", {
          tournamentId: tournament.id,
          attempt,
          reason,
          importedMatches: matches.length,
          resolvedCount,
        });
        if (resolvedCount > bestResolvedCount) {
          bestResolvedCount = resolvedCount;
          bestMatches = matches;
        }
        if (resolvedCount > 0) {
          return matches;
        }
      } catch (error) {
        if (this.isStartggRateLimitError(error) && attempt < attempts) {
          this.logStartggDebug("downstream mirrored snapshot rate limited - waiting", {
            tournamentId: tournament.id,
            attempt,
            reason,
          });
          await this.delay(delayMs);
          continue;
        }
        throw error;
      }
      if (attempt < attempts) {
        await this.delay(delayMs);
      }
    }

    return bestMatches;
  }

  private async applyMirroredMatchSubset(
    tournament: Tournament,
    importedMatchesSubset: StartggMirroredMatch[],
    baseMatches: Match[],
    preserveLocalProgress: boolean,
  ): Promise<Match[]> {
    return this.inTournamentTransaction(tournament.id, async () => {
    baseMatches = await this.repository.listMatches(tournament.id);
    if (importedMatchesSubset.length === 0) {
      return baseMatches;
    }

    const now = new Date().toISOString();
    const participants = await this.repository.listParticipants(tournament.id);
    const participantByEntrantId = new Map(
      participants
        .filter(hasStartggParticipantRef)
        .map((participant) => [participant.externalRef.entrantId, participant]),
    );
    const existingMatchBySetId = new Map(
      baseMatches
        .filter(hasStartggMatchRef)
        .map((match) => [match.externalRef.setId, match]),
    );

    let importedLocalMatches = importedMatchesSubset.map((importedMatch) => {
      const previousMatch = existingMatchBySetId.get(importedMatch.setId)
        ?? this.findExistingMirroredMatchFallback(baseMatches, importedMatch);
      return this.toMirroredLocalMatch(
        tournament.id,
        now,
        previousMatch?.id ?? createId("m"),
        importedMatch,
        participantByEntrantId,
        previousMatch,
        preserveLocalProgress,
      );
    });

    if (preserveLocalProgress) {
      const targetGroupKeys = new Set(
        importedLocalMatches
          .map((match) => this.mirroredPhaseGroupKey(match))
          .filter((key): key is string => Boolean(key)),
      );
      const previousTargetMatches = baseMatches.filter((match) =>
        targetGroupKeys.has(this.mirroredPhaseGroupKey(match) ?? ""),
      );
      importedLocalMatches = this.preserveMissingMirroredMatches(previousTargetMatches, importedLocalMatches);
    }

    const targetedGroupKeys = new Set(
      importedLocalMatches
        .map((match) => this.mirroredPhaseGroupKey(match))
        .filter((key): key is string => Boolean(key)),
    );
    let mergedMatches = [
      ...baseMatches.filter((match) => !targetedGroupKeys.has(this.mirroredPhaseGroupKey(match) ?? "")),
      ...importedLocalMatches,
    ];
    mergedMatches = this.resolveMirroredDependentParticipants(mergedMatches, baseMatches);
    mergedMatches = this.linkMirroredPlaceholdersToLocalMatchIds(mergedMatches);
    mergedMatches = this.resolveDependentParticipantsFromLocalMatches(mergedMatches);
    await this.repository.replaceMatches(tournament.id, mergedMatches);
    return await this.repository.listMatches(tournament.id);

    });
  }

  private async reconcileMirroredGroupAfterLocalResolution(
    tournament: Tournament,
    matches: Match[],
    resolvedMatch: Match,
  ): Promise<Match[]> {
    if (tournament.importSource?.provider !== "START_GG") {
      return matches;
    }
    const groupKey = this.mirroredPhaseGroupKey(resolvedMatch);
    if (!groupKey) {
      return matches;
    }

    const unresolvedGroupMatches = matches.filter((match) =>
      this.mirroredPhaseGroupKey(match) === groupKey
      && match.participants.some((participant) => this.isPlaceholderParticipantId(participant.participantId)),
    );

    if (unresolvedGroupMatches.length === 0) {
      return matches;
    }

    this.logStartggDebug("mirrored group reconcile requested after local progression", {
      tournamentId: tournament.id,
      resolvedMatchId: resolvedMatch.id,
      groupKey,
      unresolvedMatchIds: unresolvedGroupMatches.map((match) => match.id),
    });

    const snapshot = await this.loadStableStartggSnapshot(
      tournament,
      tournament.importSource.eventUrl,
      matches,
      {
        includeGameDetails: false,
        allowFallback: true,
        attempts: 2,
        delayMs: 700,
        retryOnRateLimit: true,
        reason: "post-report-group-reconcile",
      },
    );
    if (!snapshot) {
      return matches;
    }

    await this.applyStartggSnapshot(tournament, snapshot, {
      syncResults: tournament.importSource.syncResults,
      preserveTournamentTitle: true,
      preserveLocalProgress: true,
    });

    let refreshedMatches = await this.repository.listMatches(tournament.id);
    const resolvedMatches = this.resolveDependentParticipantsFromLocalMatches(refreshedMatches);
    if (resolvedMatches.some((match, index) => match !== refreshedMatches[index])) {
      refreshedMatches = await this.updateStoredMatches(tournament.id, matches => this.resolveDependentParticipantsFromLocalMatches(matches));
    }
    this.logStartggDebug("mirrored group reconcile applied after local progression", {
      tournamentId: tournament.id,
      resolvedMatchId: resolvedMatch.id,
      groupKey,
      groups: this.describeMirroredGroups(refreshedMatches),
    });
    return refreshedMatches;
  }

  private resetDependentMatches(
    matches: Match[],
    sourceMatchId: string,
    previousWinnerId?: string,
  ): Match[] {
    const sourceMatch = matches.find((item) => item.id === sourceMatchId);
    if (sourceMatch && this.isRoundRobinMirroredMatch(sourceMatch)) {
      return matches;
    }
    const previousAdvancers = sourceMatch?.advancingParticipantIds ?? [];
    const previousDropped = sourceMatch?.participants
      .filter((participant) => !previousAdvancers.includes(participant.participantId))
      .map((participant) => participant.participantId)
      ?? [];
    const previousLoserId = previousWinnerId !== undefined
      ? sourceMatch?.participants.find((participant) => participant.participantId !== previousWinnerId)?.participantId
      : undefined;
    const dependencyMap = new Map<string, {
      triggerMatchId: string;
      triggerWinnerId?: string;
      triggerLoserId?: string;
      triggerAdvancers: string[];
      triggerDropped: string[];
    }>();
    const queue: Array<{ matchId: string; winnerId?: string; loserId?: string; advancers: string[]; dropped: string[] }> = [
      {
        matchId: sourceMatchId,
        winnerId: previousWinnerId,
        loserId: previousLoserId,
        advancers: previousAdvancers,
        dropped: previousDropped,
      },
    ];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const winnerPlaceholder = `winner_of_${current.matchId}`;
      const loserPlaceholder = `loser_of_${current.matchId}`;
      const advancePlaceholders = current.advancers.map((_, index) => `advance_${index + 1}_of_${current.matchId}`);
      const dropPlaceholders = current.dropped.map((_, index) => `drop_${index + 1}_of_${current.matchId}`);

      for (const match of matches) {
        if (match.id === current.matchId || dependencyMap.has(match.id)) {
          continue;
        }
        if (!sourceMatch || !this.isPotentialDependentMatch(sourceMatch, match)) {
          continue;
        }

        const dependsOnCurrent = match.participants.some(
          (participant) =>
            participant.participantId === winnerPlaceholder
            || participant.participantId === loserPlaceholder
            || advancePlaceholders.includes(participant.participantId)
            || dropPlaceholders.includes(participant.participantId)
            || (current.winnerId !== undefined && participant.participantId === current.winnerId)
            || (current.loserId !== undefined && participant.participantId === current.loserId)
            || current.advancers.includes(participant.participantId)
            || current.dropped.includes(participant.participantId),
        );

        if (dependsOnCurrent) {
          const nextAdvancers = match.advancingParticipantIds ?? [];
          const matchHasResolvedOutcome =
            match.status === "COMPLETED"
            || match.status === "WALKOVER"
            || match.winnerParticipantId !== undefined
            || nextAdvancers.length > 0;
          dependencyMap.set(match.id, {
            triggerMatchId: current.matchId,
            triggerWinnerId: current.winnerId,
            triggerLoserId: current.loserId,
            triggerAdvancers: current.advancers,
            triggerDropped: current.dropped,
          });
          const nextLoserId = matchHasResolvedOutcome && match.winnerParticipantId !== undefined
            ? match.participants.find(
                (participant) => participant.participantId !== match.winnerParticipantId,
              )?.participantId
            : undefined;
          const nextDropped = matchHasResolvedOutcome
            ? match.participants
                .filter((participant) => !nextAdvancers.includes(participant.participantId))
                .map((participant) => participant.participantId)
            : [];
          queue.push({
            matchId: match.id,
            winnerId: match.winnerParticipantId,
            loserId: nextLoserId,
            advancers: nextAdvancers,
            dropped: nextDropped,
          });
        }
      }
    }

    return matches.map((match) => {
      const dependency = dependencyMap.get(match.id);
      if (!dependency) {
        return match;
      }

      const winnerPlaceholder = `winner_of_${dependency.triggerMatchId}`;
      const loserPlaceholder = `loser_of_${dependency.triggerMatchId}`;
      const winnerDisplayName = this.placeholderDisplayName(dependency.triggerMatchId, matches, "winner");
      const loserDisplayName = this.placeholderDisplayName(dependency.triggerMatchId, matches, "loser");

      return {
        ...match,
        status: "PENDING",
        gameResults: [],
        gameCharacterSelections: [],
        characterSelections: [],
        advancingParticipantIds: [],
        winnerParticipantId: undefined,
        call: undefined,
        participants: match.participants.map((participant) => {
          const resetToWinnerPlaceholder =
            participant.participantId === winnerPlaceholder
            || (dependency.triggerWinnerId !== undefined && participant.participantId === dependency.triggerWinnerId);
          const resetToLoserPlaceholder =
            participant.participantId === loserPlaceholder
            || (dependency.triggerLoserId !== undefined && participant.participantId === dependency.triggerLoserId);
          const mkartPlacement = participant.participantId.startsWith("advance_") && participant.participantId.endsWith(`_of_${dependency.triggerMatchId}`)
            ? this.extractMarioKartPlacement(participant.participantId)
            : dependency.triggerAdvancers.findIndex((item) => item === participant.participantId) + 1;
          const resetToMkartPlaceholder = mkartPlacement > 0;
          const droppedPlacement = participant.participantId.startsWith("drop_") && participant.participantId.endsWith(`_of_${dependency.triggerMatchId}`)
            ? this.extractMarioKartDroppedPlacement(participant.participantId)
            : dependency.triggerDropped.findIndex((item) => item === participant.participantId) + 1;
          const resetToMarioKartDroppedPlaceholder = droppedPlacement > 0;

          return resetToWinnerPlaceholder
            ? {
                ...participant,
                participantId: winnerPlaceholder,
                displayName: winnerDisplayName,
                score: 0,
              }
            : resetToLoserPlaceholder
              ? {
                  ...participant,
                  participantId: loserPlaceholder,
                  displayName: loserDisplayName,
                  score: 0,
                }
              : resetToMkartPlaceholder
                ? {
                    ...participant,
                    participantId: `advance_${mkartPlacement}_of_${dependency.triggerMatchId}`,
                    displayName: this.marioKartPlaceholderDisplayName(
                      dependency.triggerMatchId,
                      mkartPlacement,
                      matches,
                    ),
                    score: 0,
                  }
                : resetToMarioKartDroppedPlaceholder
                  ? {
                      ...participant,
                      participantId: `drop_${droppedPlacement}_of_${dependency.triggerMatchId}`,
                      displayName: this.marioKartDroppedPlaceholderDisplayName(
                        dependency.triggerMatchId,
                        droppedPlacement,
                        matches,
                      ),
                      score: 0,
                    }
            : {
                ...participant,
                score: 0,
              };
        }),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  private placeholderDisplayName(matchId: string, matches: Match[], kind: "winner" | "loser" = "winner"): string {
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      return kind === "winner" ? "Ganador pendiente" : "Perdedor pendiente";
    }

    const stagePrefix = match.bracketStage === "LOSERS"
      ? "L"
      : match.bracketStage === "FINALS"
        ? "F"
        : "W";
    return kind === "winner"
      ? `Ganador ${stagePrefix}${match.roundNumber}M${match.matchNumber}`
      : `Perdedor ${stagePrefix}${match.roundNumber}M${match.matchNumber}`;
  }

  private marioKartPlaceholderDisplayName(matchId: string, placement: number, matches: Match[]): string {
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      return `Clasificado ${placement} pendiente`;
    }

    return `Clasificado ${placement} ${match.bracketStage === "FINALS" ? "Final" : `R${match.roundNumber}M${match.matchNumber}`}`;
  }

  private marioKartDroppedPlaceholderDisplayName(matchId: string, placement: number, matches: Match[]): string {
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      return `Repesca ${placement} pendiente`;
    }

    return `Repesca ${placement} ${match.bracketStage === "FINALS" ? "Final" : `R${match.roundNumber}M${match.matchNumber}`}`;
  }

  private hasRealMatchActivity(match: Match): boolean {
    if (this.isAutomaticallyAdvancedMatch(match)) {
      return false;
    }
    if (match.status === "CALLED" || match.status === "PLAYING" || match.status === "WALKOVER") {
      return true;
    }

    if (match.call?.calledAt || match.call?.startedAt) {
      return true;
    }

    if (match.participants.some((participant) => participant.score > 0)) {
      return true;
    }

    return match.status === "COMPLETED" && match.participants.length > 1;
  }

  private matchCanProduceLoser(match: Match): boolean {
    return match.participants.length > match.advancersRequired;
  }

  private isAutomaticallyAdvancedMatch(match: Match): boolean {
    if (match.status !== "COMPLETED") {
      return false;
    }
    if (match.call?.calledAt || match.call?.startedAt) {
      return false;
    }
    if ((match.gameResults?.length ?? 0) > 0) {
      return false;
    }
    if ((match.gameCharacterSelections?.length ?? 0) > 0) {
      return false;
    }
    if ((match.characterSelections?.length ?? 0) > 0) {
      return false;
    }

    const advancedIds = new Set(match.advancingParticipantIds ?? []);
    if (match.winnerParticipantId) {
      advancedIds.add(match.winnerParticipantId);
    }
    if (advancedIds.size === 0) {
      return false;
    }

    return match.participants.every((participant) =>
      participant.score === (advancedIds.has(participant.participantId) ? 1 : 0),
    );
  }

  private ensureImportFinished(tournament: Tournament): void {
    if (tournament.settings.importJob?.state === "RUNNING") {
      throw new Error("Espera a que termine la importacion");
    }
  }

  private ensureStartggImportAllowed(tournament: Tournament, matches: Match[]): void {
    assertTournamentWritable(tournament);
    if ((tournament.settings.teamSize ?? 1) > 1 || tournament.settings.bracketMode === 'FORTNITE') {
      throw new Error('Crea otro torneo para importar start.gg; este torneo usa plantillas locales o grupos Fortnite');
    }
    if (tournament.importSource?.provider !== "START_GG") this.ensureLocalDrawCanChange(tournament, matches);
  }

  private ensureTournamentStarted(tournament: Tournament): void {
    this.ensureImportFinished(tournament);
    const canOperateMirroredStartgg =
      tournament.importSource?.provider === "START_GG"
      && tournament.status === "READY";
    if (!canOperateMirroredStartgg && tournament.status !== "IN_PROGRESS" && tournament.status !== "COMPLETED") {
      throw new Error("Start the tournament before operating matches");
    }
  }

  private async updateMirroredStartggTournament(
    tournament: Tournament,
    input: UpdateTournamentInput,
  ): Promise<Tournament> {
    const nextSettings = this.normalizeSettings({
      ...input.settings,
      streamCount: input.settings.streamCount ?? tournament.settings.streamCount ?? 0,
      playAreaName: input.settings.playAreaName === undefined
        ? tournament.settings.playAreaName
        : input.settings.playAreaName,
    });
    const currentSettings = this.normalizeSettings(tournament.settings);
    const matches = await this.repository.listMatches(tournament.id);
    const onlyOperationalSettingsChanged =
      input.title === tournament.title
      && input.gameTitle === tournament.gameTitle
      && input.description === tournament.description
      && input.platform === tournament.platform
      && input.maxParticipants === tournament.maxParticipants
      && currentSettings.format === nextSettings.format
      && currentSettings.bracketMode === nextSettings.bracketMode
      && currentSettings.mkartAdvanceCount === nextSettings.mkartAdvanceCount
      && currentSettings.mkartLosersAdvanceCount === nextSettings.mkartLosersAdvanceCount
      && currentSettings.playAreaName === nextSettings.playAreaName
      && currentSettings.bestOf === nextSettings.bestOf
      && currentSettings.winnersBestOf === nextSettings.winnersBestOf
      && currentSettings.losersBestOf === nextSettings.losersBestOf
      && currentSettings.hasThirdPlaceMatch === nextSettings.hasThirdPlaceMatch
      && currentSettings.checkInRequired === nextSettings.checkInRequired
      && currentSettings.allowRematchReview === nextSettings.allowRematchReview
      && currentSettings.seedingMethod === nextSettings.seedingMethod
      && currentSettings.autoCallMatches === nextSettings.autoCallMatches
      && currentSettings.autoDisqualifyAfterMinutes === nextSettings.autoDisqualifyAfterMinutes
      && currentSettings.manualSeedingLocked === nextSettings.manualSeedingLocked;

    if (!onlyOperationalSettingsChanged) {
      throw new Error("Mirrored start.gg tournaments only allow changing the match call timer, player reporting and setup count");
    }
    this.ensureSetupCountCanBeApplied(nextSettings, matches);

    const updatedTournament: Tournament = {
      ...tournament,
      settings: {
        ...tournament.settings,
        callTimeoutMinutes: nextSettings.callTimeoutMinutes,
        playerMatchReportingEnabled: nextSettings.playerMatchReportingEnabled,
        setupCount: nextSettings.setupCount,
        streamCount: nextSettings.streamCount,
      },
      updatedAt: new Date().toISOString(),
    };
    await this.repository.saveTournament(updatedTournament);
    return updatedTournament;
  }

  private ensureMatchHasResolvedContenders(match: Match): void {
    if (!this.matchHasResolvedContenders(match)) {
      throw new Error("Resolve previous matches before operating this match");
    }
  }

  private normalizeUnresolvedMatches(matches: Match[]): Match[] {
    return matches.map((match) => {
      const automatic = this.normalizeLocalAutomaticPass(match);
      if (automatic !== match || (!hasStartggMatchRef(match) && this.isAutomaticallyAdvancedMatch(match)
        && match.participants.every(participant => !this.isPlaceholderParticipantId(participant.participantId)))) {
        return automatic;
      }
      if (this.matchHasResolvedContenders(match)) {
        return match;
      }

      const alreadyPending =
        match.status === "PENDING"
        && (match.advancingParticipantIds?.length ?? 0) === 0
        && match.winnerParticipantId === undefined
        && match.call === undefined
        && match.participants.every((participant) => participant.score === 0);

      if (alreadyPending) {
        return match;
      }

      return {
        ...match,
        status: "PENDING",
        advancingParticipantIds: [],
        winnerParticipantId: undefined,
        call: undefined,
        participants: match.participants.map((participant) => ({
          ...participant,
          score: 0,
        })),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  private hasLocalStandardBracket(tournament: Tournament): boolean {
    return !tournament.importSource && (!tournament.settings.bracketMode || tournament.settings.bracketMode === 'STANDARD')
      && ['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION'].includes(tournament.settings.format);
  }

  private isLocalDrawParticipant(tournament: Tournament, participant: TournamentParticipant): boolean {
    return participant.status === 'ACTIVE' && (!tournament.settings.checkInRequired || participant.checkedIn);
  }

  private normalizeLocalAutomaticPass(match: Match): Match {
    if (hasStartggMatchRef(match) || !['PENDING', 'COMPLETED'].includes(match.status)
      || match.participants.length !== 1 || (match.advancersRequired ?? 1) !== 1
      || (match.bracketStage === 'FINALS' && match.roundNumber > 1)
      || match.call || match.gameResults?.length || match.gameCharacterSelections?.length || match.characterSelections?.length) return match;
    const participant = match.participants[0];
    if (this.isPlaceholderParticipantId(participant.participantId) || participant.score > 1) return match;
    if (match.status === 'COMPLETED' && match.winnerParticipantId === participant.participantId
      && match.advancingParticipantIds?.length === 1 && match.advancingParticipantIds[0] === participant.participantId
      && participant.score === 1) return match;
    return { ...match, status: 'COMPLETED', winnerParticipantId: participant.participantId,
      advancingParticipantIds: [participant.participantId], participants: [{ ...participant, score: 1 }],
      updatedAt: new Date().toISOString() };
  }

  private matchHasResolvedContenders(match: Match): boolean {
    return match.participants.length >= 2
      && match.participants.every((participant) => !this.isPlaceholderParticipantId(participant.participantId));
  }

  private isPotentialDependentMatch(source: Match, candidate: Match): boolean {
    if (candidate.id === source.id) {
      return false;
    }

    if (this.isRoundRobinMirroredMatch(source)) {
      return false;
    }

    if (hasStartggMatchRef(source) && hasStartggMatchRef(candidate)) {
      const sourcePhaseOrder = source.externalRef.phaseOrder ?? Number.MAX_SAFE_INTEGER;
      const candidatePhaseOrder = candidate.externalRef.phaseOrder ?? Number.MAX_SAFE_INTEGER;
      if (candidatePhaseOrder < sourcePhaseOrder) {
        return false;
      }

      const sourceGroupKey = this.mirroredPhaseGroupKey(source);
      const candidateGroupKey = this.mirroredPhaseGroupKey(candidate);
      if (candidatePhaseOrder === sourcePhaseOrder && sourceGroupKey !== candidateGroupKey) {
        return false;
      }
    }

    if (source.bracketStage === "FINALS") {
      return candidate.bracketStage === 'FINALS'
        && candidate.roundNumber > source.roundNumber
        && candidate.matchNumber === source.matchNumber;
    }

    if (source.bracketStage === "WINNERS") {
      return candidate.bracketStage === "LOSERS"
        || candidate.bracketStage === "FINALS"
        || (candidate.bracketStage === "WINNERS" && candidate.roundNumber > source.roundNumber);
    }

    if (source.bracketStage === "LOSERS") {
      return candidate.bracketStage === "FINALS"
        || (candidate.bracketStage === "LOSERS" && candidate.roundNumber > source.roundNumber);
    }

    if (source.bracketStage === "POOLS") {
      return true;
    }

    return false;
  }

  private isPlaceholderParticipantId(participantId: string): boolean {
    return participantId.startsWith("winner_of_")
      || participantId.startsWith("loser_of_")
      || participantId.startsWith("advance_")
      || participantId.startsWith("drop_");
  }

  private normalizeSettings(settings: Tournament["settings"]): Tournament["settings"] {
    teamSettings(settings);
    if (settings.bracketMode === 'FORTNITE') fortniteConfig(settings);
    const winnersBestOf = settings.winnersBestOf ?? settings.bestOf;
    const losersBestOf = settings.losersBestOf ?? winnersBestOf;
    const bracketMode = settings.bracketMode ?? "STANDARD";
    const mkartAdvanceCount = settings.mkartAdvanceCount ?? 1;
    const mkartLosersAdvanceCount = settings.mkartLosersAdvanceCount ?? mkartAdvanceCount;
    const setupCount = Math.max(1, Math.trunc(settings.setupCount ?? 1));
    const streamCount = settings.streamCount ?? 0;
    if (!Number.isInteger(streamCount) || streamCount < 0 || streamCount > 2) throw new Error("El numero de streams debe ser 0, 1 o 2");
    const playAreaName = settings.playAreaName?.trim() || undefined;

    return {
      ...settings,
      bracketMode,
      mkartAdvanceCount,
      mkartLosersAdvanceCount,
      setupCount,
      streamCount,
      playAreaName,
      bestOf: winnersBestOf,
      winnersBestOf,
      losersBestOf,
      playerMatchReportingEnabled: settings.playerMatchReportingEnabled ?? true,
    };
  }

  private onlyOperationalTournamentSettingsChanged(
    tournament: Tournament,
    input: UpdateTournamentInput,
    nextSettings: Tournament["settings"],
  ): boolean {
    const currentSettings = this.normalizeSettings(tournament.settings);
    return input.title === tournament.title
      && input.gameTitle === tournament.gameTitle
      && input.description === tournament.description
      && input.platform === tournament.platform
      && input.maxParticipants === tournament.maxParticipants
      && currentSettings.format === nextSettings.format
      && currentSettings.bracketMode === nextSettings.bracketMode
      && currentSettings.mkartAdvanceCount === nextSettings.mkartAdvanceCount
      && currentSettings.mkartLosersAdvanceCount === nextSettings.mkartLosersAdvanceCount
      && currentSettings.bestOf === nextSettings.bestOf
      && currentSettings.winnersBestOf === nextSettings.winnersBestOf
      && currentSettings.losersBestOf === nextSettings.losersBestOf
      && currentSettings.hasThirdPlaceMatch === nextSettings.hasThirdPlaceMatch
      && currentSettings.checkInRequired === nextSettings.checkInRequired
      && currentSettings.allowRematchReview === nextSettings.allowRematchReview
      && currentSettings.seedingMethod === nextSettings.seedingMethod
      && currentSettings.autoCallMatches === nextSettings.autoCallMatches
      && currentSettings.autoDisqualifyAfterMinutes === nextSettings.autoDisqualifyAfterMinutes
      && currentSettings.manualSeedingLocked === nextSettings.manualSeedingLocked;
  }

  private normalizeSetupLabel(stationLabel?: string): string | undefined {
    const normalized = stationLabel?.trim();
    if (!normalized) {
      return undefined;
    }
    const streamNumber = /^stream\s*(\d+)$/i.exec(normalized)?.[1];
    if (streamNumber) return `Stream ${Number(streamNumber)}`;
    const setupNumber = this.parseSetupNumber(normalized);
    return setupNumber ? `Setup ${setupNumber}` : normalized;
  }

  private parseSetupNumber(stationLabel?: string): number | undefined {
    const normalized = stationLabel?.trim();
    if (!normalized) {
      return undefined;
    }
    if (/^stream/i.test(normalized)) return undefined;
    const digits = normalized.replace(/\D+/g, "");
    if (!digits) {
      return undefined;
    }
    const setupNumber = Number.parseInt(digits, 10);
    return Number.isInteger(setupNumber) ? setupNumber : undefined;
  }

  private ensureSetupAvailable(
    tournament: Tournament,
    matches: Match[],
    targetMatchId: string,
    stationLabel?: string,
  ): void {
    if (!stationLabel) {
      return;
    }
    const normalizedStationLabel = this.normalizeSetupLabel(stationLabel);
    if (!normalizedStationLabel) {
      return;
    }
    const setupCount = this.normalizeSettings(tournament.settings).setupCount ?? 1;
    const stationNumber = this.parseSetupNumber(normalizedStationLabel);
    const streamNumber = /^Stream (\d+)$/.exec(normalizedStationLabel)?.[1];
    const available = streamNumber
      ? Number(streamNumber) >= 1 && Number(streamNumber) <= (tournament.settings.streamCount ?? 0)
      : stationNumber !== undefined && stationNumber >= 1 && stationNumber <= setupCount;
    if (!available) {
      throw new Error(`Setup ${stationLabel} is not available in this tournament`);
    }
    const occupiedByOtherMatch = matches.some((match) =>
      match.id !== targetMatchId
      && this.isSetupOccupyingMatch(match)
      && this.normalizeSetupLabel(match.call?.stationLabel) === normalizedStationLabel,
    );
    if (occupiedByOtherMatch) {
      throw new Error(`Setup ${stationLabel} is already in use`);
    }
  }

  private ensureSetupCountCanBeApplied(
    settings: Tournament["settings"],
    matches: Match[],
  ): void {
    const setupCount = this.normalizeSettings(settings).setupCount ?? 1;
    const activeStreamNumbers = matches.filter(match => this.isSetupOccupyingMatch(match))
      .map(match => Number(/^Stream (\d+)$/.exec(this.normalizeSetupLabel(match.call?.stationLabel) ?? "")?.[1] ?? 0));
    if (activeStreamNumbers.some(n => n > (settings.streamCount ?? 0))) throw new Error("No se puede quitar un stream mientras esta en uso");
    const highestActiveSetup = matches.reduce((highest, match) => {
      if (!this.isSetupOccupyingMatch(match)) {
        return highest;
      }
      const stationNumber = this.parseSetupNumber(match.call?.stationLabel);
      return stationNumber !== undefined ? Math.max(highest, stationNumber) : highest;
    }, 0);
    if (highestActiveSetup > setupCount) {
      throw new Error("Cannot reduce setup count while higher-numbered setups are still in use");
    }
  }

  private isSetupOccupyingMatch(match: Match): boolean {
    return (
      !!this.normalizeSetupLabel(match.call?.stationLabel)
      && (
        match.status === "CALLED"
        || match.status === "CHECKED_IN"
        || match.status === "PLAYING"
        || match.status === "RESULT_REPORTED"
        || match.status === "UNDER_REVIEW"
      )
    );
  }

  private hasBracketStructureChange(
    currentSettings: Tournament["settings"],
    nextSettings: Tournament["settings"],
  ): boolean {
    const current = this.normalizeSettings(currentSettings);
    const next = this.normalizeSettings(nextSettings);

    return current.format !== next.format
      || current.checkInRequired !== next.checkInRequired
      || current.bracketMode !== next.bracketMode
      || current.mkartAdvanceCount !== next.mkartAdvanceCount
      || current.mkartLosersAdvanceCount !== next.mkartLosersAdvanceCount
      || current.seedingMethod !== next.seedingMethod
      || current.manualSeedingLocked !== next.manualSeedingLocked;
  }

  private bestOfForBracketStage(
    settings: Tournament["settings"],
    bracketStage: Match["bracketStage"],
  ): number {
    if (bracketStage === "LOSERS") {
      return settings.losersBestOf ?? settings.bestOf;
    }

    return settings.winnersBestOf ?? settings.bestOf;
  }

  private nextPowerOfTwo(value: number): number {
    let result = 1;
    while (result < value) {
      result *= 2;
    }
    return result;
  }

  private isTournamentComplete(matches: Match[]): boolean {
    const relevantMatches = matches.filter((match) => !this.shouldIgnoreDormantGrandFinalReset(matches, match));
    return relevantMatches.length > 0 && relevantMatches.every((match) =>
      match.status === "COMPLETED" || match.status === "WALKOVER",
    );
  }

  private shouldActivateGrandFinalReset(match: Match): boolean {
    if (match.bracketStage !== "FINALS" || match.roundNumber !== 1 || !match.winnerParticipantId) {
      return true;
    }

    const losersSideParticipant = match.participants.find((participant) => participant.slot === 2)
      ?? match.participants[1];
    if (!losersSideParticipant) {
      return true;
    }

    return losersSideParticipant.participantId === match.winnerParticipantId;
  }

  private shouldIgnoreDormantGrandFinalReset(matches: Match[], match: Match): boolean {
    if (match.bracketStage !== "FINALS" || match.roundNumber <= 1) {
      return false;
    }

    const hasResetActivity = this.hasRealMatchActivity(match)
      || match.winnerParticipantId !== undefined
      || (match.advancingParticipantIds?.length ?? 0) > 0;
    if (hasResetActivity) {
      return false;
    }

    const grandFinal = matches.find((candidate) =>
      candidate.bracketStage === "FINALS"
      && candidate.roundNumber === 1
      && candidate.matchNumber === match.matchNumber,
    );
    if (!grandFinal) {
      return true;
    }

    const losersSideParticipant = grandFinal.participants.find((participant) => participant.slot === 2)
      ?? grandFinal.participants[1];
    if (!grandFinal.winnerParticipantId || !losersSideParticipant) {
      return true;
    }

    return losersSideParticipant.participantId !== grandFinal.winnerParticipantId;
  }

  private isRoundComplete(matches: Match[], resolvedMatch: Match): boolean {
    const roundMatches = matches.filter((match) =>
      match.bracketStage === resolvedMatch.bracketStage
      && match.roundNumber === resolvedMatch.roundNumber
      && this.matchesShareRoundNotificationScope(match, resolvedMatch),
    );
    return roundMatches.length > 0 && roundMatches.every((match) =>
      match.status === "COMPLETED" || match.status === "WALKOVER",
    );
  }

  private matchesShareRoundNotificationScope(candidate: Match, reference: Match): boolean {
    const referencePhaseGroupId = reference.externalRef?.phaseGroupId?.trim();
    if (referencePhaseGroupId) {
      return candidate.externalRef?.phaseGroupId?.trim() === referencePhaseGroupId;
    }

    const referencePhaseId = reference.externalRef?.phaseId?.trim();
    if (reference.externalRef?.provider === "START_GG" && referencePhaseId) {
      return candidate.externalRef?.phaseId?.trim() === referencePhaseId;
    }

    return true;
  }

  private resolveTournamentWinnerName(matches: Match[]): string | undefined {
    const finalMatch = [...matches]
      .sort((left, right) => {
        const stageWeight = (match: Match) => match.bracketStage === "FINALS" ? 2 : match.bracketStage === "LOSERS" ? 1 : 0;
        return stageWeight(right) - stageWeight(left) || right.roundNumber - left.roundNumber || right.matchNumber - left.matchNumber;
      })
      .find((match) => match.winnerParticipantId);

    if (!finalMatch?.winnerParticipantId) {
      return undefined;
    }

    return finalMatch.participants.find((participant) => participant.participantId === finalMatch.winnerParticipantId)?.displayName;
  }

  private async notifyResolutionEffects(
    tournament: Tournament,
    matches: Match[],
    resolvedMatch: Match,
  ): Promise<void> {
    await this.notifySafely("match-resolved", () => this.notifier.notifyMatchResolved(tournament, resolvedMatch));

    if (this.isRoundComplete(matches, resolvedMatch)) {
      await this.notifySafely("round-completed", () => this.notifier.notifyRoundCompleted(tournament, matches, resolvedMatch));
    }

    if (tournament.status === "COMPLETED") {
      const winnerName = this.resolveTournamentWinnerName(matches);
      if (winnerName) {
        await this.notifySafely("tournament-completed", () =>
          this.notifier.notifyTournamentCompleted(tournament, matches, winnerName),
        );
      }
    }
  }

  private async notifySafely(label: string, action: () => Promise<void>): Promise<void> {
    if (this.repository.inTransaction) {
      this.repository.afterCommit(() => { void this.notifySafely(label, action); });
      return;
    }
    try {
      await action();
    } catch (error) {
      console.error(`[notifier:${label}]`, error);
    }
  }

  private validateReportedScores(match: Match, input: ReportResultInput): void {
    const ids = new Set(match.participants.map(participant => participant.participantId));
    if (ids.size !== 2 || match.participants.length !== 2 || !ids.has(input.winnerParticipantId)) {
      throw new Error("Selecciona un ganador de este match de dos participantes");
    }
    if (input.scores.length !== ids.size || new Set(input.scores.map(score => score.participantId)).size !== ids.size
      || input.scores.some(score => !ids.has(score.participantId) || !Number.isInteger(score.score) || score.score < 0)) {
      throw new Error("Indica un marcador entero y no negativo para cada participante, sin repetir jugadores");
    }
    const needed = Math.floor((match.reportedBestOf ?? match.bestOf) / 2) + 1;
    if (input.scores.some(score => score.participantId === input.winnerParticipantId ? score.score !== needed : score.score >= needed)) {
      throw new Error("El ganador debe alcanzar las victorias necesarias y el rival debe quedar por debajo");
    }
  }

  private buildGameResultsFromScores(
    match: Match,
    scores: ReportResultInput["scores"],
    winnerParticipantId: string,
  ): string[] {
    const scoreByParticipantId = new Map(scores.map((score) => [score.participantId, score.score]));
    const winnerScore = scoreByParticipantId.get(winnerParticipantId) ?? 0;
    const loserParticipantId = match.participants
      .map((participant) => participant.participantId)
      .find((participantId) => participantId !== winnerParticipantId);
    const loserScore = loserParticipantId ? (scoreByParticipantId.get(loserParticipantId) ?? 0) : 0;
    return [
      // The exact order is unknown for a summary; construct a valid sequence
      // whose final game is the deciding victory, never one played after it.
      ...Array.from({ length: Math.max(0, winnerScore - 1) }, () => winnerParticipantId),
      ...Array.from({ length: loserScore }, () => loserParticipantId).filter((participantId): participantId is string => Boolean(participantId)),
      ...(winnerScore > 0 ? [winnerParticipantId] : []),
    ];
  }

  private normalizeDetailedGameSelections(
    tournament: Tournament,
    match: Match,
    selections: ReportDetailedResultInput["games"][number]["selections"],
  ): MatchCharacterSelection[] {
    if (!selections?.length) {
      throw new Error("Each reported game must include both characters");
    }

    const allowedIds = new Set(match.participants.map((participant) => participant.participantId));
    const teamSize = Math.max(1, tournament.importSource?.entrantSize ?? 1);
    const seen = new Set<string>();
    const normalizedSelections = selections.flatMap((selection) => {
      if (!allowedIds.has(selection.participantId) || seen.has(selection.participantId)) {
        throw new Error("Each entrant must be reported exactly once");
      }
      seen.add(selection.participantId);
      const names = selection.characterName.split("/").map((name) => name.trim());
      if (names.length !== teamSize || names.some((name) => !name)) {
        throw new Error("Selecciona los " + teamSize + " personajes de cada equipo/jugador");
      }
      return names.map((name) => {
        const character = this.resolveSupportedCharacter(tournament, name);
        if (!character) throw new Error("Unknown character for " + tournament.gameTitle + ": " + name);
        return { participantId: selection.participantId, characterId: character.id, characterName: character.name };
      });
    });
    if (seen.size !== allowedIds.size) throw new Error("Each reported game must include all player characters");

    return normalizedSelections;
  }

  private toStartggGameData(
    match: Match,
    participants: TournamentParticipant[],
  ): Array<{
    winnerId: string;
    gameNum: number;
    entrant1Score: number;
    entrant2Score: number;
    selections?: Array<{
      entrantId: string;
      characterId: number;
    }>;
  }> | undefined {
    if (!match.gameResults?.length || match.participants.length < 2) {
      return undefined;
    }

    const participantById = new Map(participants.map((participant) => [participant.id, participant]));
    const entrant1 = participantById.get(match.participants[0]?.participantId ?? "");
    const entrant2 = participantById.get(match.participants[1]?.participantId ?? "");
    const entrant1Id = entrant1?.externalRef?.provider === "START_GG" ? entrant1.externalRef.entrantId : undefined;
    const entrant2Id = entrant2?.externalRef?.provider === "START_GG" ? entrant2.externalRef.entrantId : undefined;
    if (!entrant1Id || !entrant2Id) {
      return undefined;
    }
    const gameSelectionsByGameNum = new Map(
      (match.gameCharacterSelections ?? []).map((entry) => [entry.gameNum, entry.selections]),
    );

    return match.gameResults
      .map((winnerParticipantId, index) => {
        const winner = participantById.get(winnerParticipantId);
        const winnerEntrantId = winner?.externalRef?.provider === "START_GG" ? winner.externalRef.entrantId : undefined;
        if (!winnerEntrantId) {
          return undefined;
        }
        const selections = (gameSelectionsByGameNum.get(index + 1) ?? match.characterSelections ?? [])
          .flatMap((selection) => {
            const entrantId = participantById.get(selection.participantId)?.externalRef?.entrantId;
            return entrantId ? [{ entrantId, characterId: selection.characterId }] : [];
          });
        return {
          winnerId: winnerEntrantId,
          gameNum: index + 1,
          entrant1Score: winnerEntrantId === entrant1Id ? 1 : 0,
          entrant2Score: winnerEntrantId === entrant2Id ? 1 : 0,
          selections: selections.length > 0 ? selections : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== undefined);
  }

  private extractMarioKartPlacement(participantId: string): number {
    const parts = participantId.split("_");
    return Number(parts[1] ?? "1");
  }

  private extractMarioKartDroppedPlacement(participantId: string): number {
    const parts = participantId.split("_");
    return Number(parts[1] ?? "1");
  }

  private resetMarioKartPlaceholder(participantId: string): string {
    const parts = participantId.split("_");
    const placement = parts[1] ?? "1";
    const matchId = parts.slice(3).join("_");
    return `advance_${placement}_of_${matchId}`;
  }
}
