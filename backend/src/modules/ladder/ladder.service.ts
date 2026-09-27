import { resolveRoa2Character } from "../tournaments/roa2.characters.js";
import { assertTournamentWritable } from '../tournaments/tournament-archive.js';
import { resolveSmashUltimateCharacter } from "../tournaments/smash-ultimate.characters.js";
import { createId } from "../../shared/id.js";
import type { Match, MatchCharacterSelection, MatchGameCharacterSelections, MatchParticipant, Tournament, TournamentParticipant } from "../../shared/types.js";
import type { PoolClient } from "pg";
import type { TournamentNotifier } from "../tournaments/tournament-notifier.js";
import { TournamentsPostgresRepository } from "../tournaments/tournaments.postgres-repository.js";
import { LadderPostgresRepository } from "./ladder.postgres-repository.js";
import type { LadderMatch, LadderOverview, LadderSession, LadderSettings } from "./ladder.types.js";
import type { LadderControlInput } from "./ladder.schemas.js";
import { defaultLadderSettings, ladderStandings, occupiesBracket, occupiesLadderSetup, openLadderStatuses, selectLadderPair, setupNumber } from "./ladder.rules.js";

export type LadderDetailedGameInput = { winnerParticipantId: string; selections?: Array<{ participantId: string; characterName: string }> };
const nowIso = () => new Date().toISOString();

export class LadderService {
  private ticking = false;
  constructor(private readonly repository: LadderPostgresRepository, private readonly tournamentsRepository: TournamentsPostgresRepository, private readonly notifier: TournamentNotifier) {}

  // Share the bracket's advisory lock and connection: one tournament, one atomic change.
  private transaction<T>(id: string, action: (client: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
    if (!this.tournamentsRepository.withTournamentTransaction) return this.repository.runInTransaction(action);
    return this.tournamentsRepository.withTournamentTransaction(id, async () => {
      if (!readOnly) assertTournamentWritable(await this.tournamentsRepository.getTournament(id));
      return action(this.tournamentsRepository.transactionClient!);
    });
  }
  private settings(session: LadderSession): LadderSettings { return { ...defaultLadderSettings, ...session.options?.settings }; }
  private async saveSession(session: LadderSession, client: PoolClient): Promise<void> {
    session.options = { ...session.options, settings: this.settings(session), revision: createId("lrev") };
    await this.repository.saveSession(session, client);
  }
  private async audit(session: LadderSession, client: PoolClient, actor: string, action: string, before?: unknown, after?: unknown, matchId?: string, reason?: string): Promise<void> {
    await this.repository.appendActivity(session.tournamentId, session.id, { id: createId("lae"), createdAt: nowIso(), actor, action, before, after, matchId, reason }, client);
  }
  private assertMember(match: LadderMatch, participantId: string): void {
    if (!match.participants.some(p => p.participantId === participantId)) throw new Error("This match does not belong to the current player");
  }
  private checkRevision(expected: string | undefined, actual?: string): void {
    if (expected && expected !== actual) throw new Error("The ladder has changed. Refresh before saving");
  }
  async getOverview(tournamentId: string): Promise<LadderOverview> {
    await this.requireEligibleTournament(tournamentId);
    return this.transaction(tournamentId, client => this.readOverview(tournamentId, client), true);
  }
  async startLadder(tournamentId: string, actor: string): Promise<LadderOverview> {
    await this.transaction(tournamentId, async client => {
      const tournament = await this.requireEligibleTournament(tournamentId);
      if (tournament.status === "CANCELLED") throw new Error("The tournament is cancelled");
      if (await this.repository.getActiveSessionForTournament(tournamentId, client, true)) return;
      const now = nowIso();
      const session: LadderSession = { id: createId("lad"), tournamentId, status: "ACTIVE", createdAt: now, startedAt: now,
        options: { startedByUserId: actor, settings: { ...defaultLadderSettings, setupNumbers: tournament.settings.setupCount ? [tournament.settings.setupCount] : [] } } };
      await this.saveSession(session, client);
      await this.audit(session, client, actor, "START", undefined, session.options);
    });
    return this.getOverview(tournamentId);
  }
  async finalizeLadder(tournamentId: string, actor: string): Promise<LadderOverview> {
    return this.control(tournamentId, { action: "CLOSE", actor });
  }
  async control(tournamentId: string, input: LadderControlInput): Promise<LadderOverview> {
    const notifications = await this.transaction(tournamentId, async client => {
      const tournament = await this.requireEligibleTournament(tournamentId);
      const session = await this.requireActiveSession(tournamentId, client);
      const before = structuredClone(session.options);
      session.options = { ...session.options, settings: this.settings(session) };
      if (!input.matchId) this.checkRevision(input.expectedRevision, session.options.revision);
      switch (input.action) {
        case "PAUSE": session.options.paused = true; break;
        case "RESUME": session.options.paused = false; break;
        case "CLOSE": session.options.paused = false; session.options.closing = true; session.completedByUserId = input.actor; await this.repository.clearQueue(session.id, client); break;
        case "SETTINGS":
          if (!input.settings) throw new Error("Ladder settings missing");
          if (input.settings.setupNumbers.some(n => n > (tournament.settings.setupCount ?? 0))) throw new Error("Some setups do not exist in this tournament");
          session.options.settings = input.settings; break;
        case "ADD_PLAYER": case "REMOVE_PLAYER": {
          const participant = (await this.tournamentsRepository.listParticipants(tournamentId)).find(p => p.id === input.participantId);
          if (!participant) throw new Error("Participant not found");
          const excluded = new Set(session.options.excludedParticipantIds ?? []);
          if (input.action === "REMOVE_PLAYER") {
            excluded.add(participant.id);
            await this.repository.deleteQueueEntryByParticipant(session.id, participant.id, client);
            const match = await this.repository.getOpenMatchForParticipant(session.id, participant.id, client, true);
            if (match) {
              await this.cancelMatch(session, match, client, "Removed by staff", input.actor);
              for (const other of match.participants.filter(p => p.participantId !== participant.id)) await this.enqueueParticipant(session, other, client, match.details?.queueEnteredAt?.[other.participantId]);
            }
          } else {
            if (session.options.closing) throw new Error("Registration is closed");
            excluded.delete(participant.id);
            session.options.excludedParticipantIds = [...excluded];
            await this.enqueueParticipant(session, { ...participant, participantId: participant.id, score: 0, slot: 1 }, client);
          }
          session.options.excludedParticipantIds = [...excluded]; break;
        }
        case "CANCEL_MATCH": case "RESOLVE_RESULT": case "REOPEN_MATCH": {
          const match = input.matchId ? await this.repository.getMatchById(input.matchId, client, true) : undefined;
          if (!match || match.ladderSessionId !== session.id) throw new Error("Ladder match not found");
          this.checkRevision(input.expectedRevision, match.details?.revision);
          if (!input.reason?.trim()) throw new Error("Enter the reason for this change");
          if (input.action === "CANCEL_MATCH") {
            if (!openLadderStatuses.includes(match.status)) throw new Error("The set is already closed");
            await this.cancelMatch(session, match, client, input.reason, input.actor);
            for (const p of match.participants) await this.enqueueParticipant(session, p, client, match.details?.queueEnteredAt?.[p.participantId]);
          } else if (input.action === "REOPEN_MATCH") {
            if (!["COMPLETED", "DISPUTED", "AWAITING_CONFIRMATION"].includes(match.status)) throw new Error("This set cannot be reopened");
            for (const p of match.participants) {
              const other = await this.repository.getOpenMatchForParticipant(session.id, p.participantId, client, true);
              if (other && other.id !== match.id) throw new Error("A player has another open set");
              await this.repository.deleteQueueEntryByParticipant(session.id, p.participantId, client);
            }
            const reopened: LadderMatch = { ...match, status: "SUSPENDED", winnerParticipantId: undefined, completedAt: undefined, gameResults: undefined,
              startedAt: undefined, readyDeadlineAt: undefined, participantOneReadyAt: undefined, participantTwoReadyAt: undefined,
              characterSelections: undefined, gameCharacterSelections: undefined, participants: match.participants.map(p => ({ ...p, score: 0 })),
              details: { ...match.details, stationNumber: undefined, reportedAt: undefined, reportedByParticipantId: undefined, confirmedByParticipantId: undefined, disputeReason: undefined, suspensionReason: "Reopened by staff" }, updatedAt: nowIso() };
            await this.repository.saveMatch(reopened, client);
            await this.audit(session, client, input.actor, input.action, match, reopened, match.id, input.reason);
          } else {
            if (!["PLAYING", "SUSPENDED", "COMPLETED", "DISPUTED", "AWAITING_CONFIRMATION"].includes(match.status)) throw new Error("This set does not accept results");
            const scores = input.scores;
            const needed = Math.floor(match.bestOf / 2) + 1;
            if (!scores || new Set(scores.map(s => s.participantId)).size !== 2 || scores.some(s => !match.participants.some(p => p.participantId === s.participantId))) throw new Error("Review result participants");
            const winner = scores.find(s => s.participantId === input.winnerParticipantId);
            if (!winner || winner.score !== needed || scores.some(s => s !== winner && s.score >= needed)) throw new Error("The result must finish the set without a tie");
            const completed: LadderMatch = { ...match, status: "COMPLETED", winnerParticipantId: winner.participantId, participants: match.participants.map(p => ({ ...p, score: scores.find(s => s.participantId === p.participantId)!.score })),
              gameResults: undefined, characterSelections: undefined, gameCharacterSelections: undefined, completedAt: match.completedAt ?? nowIso(), updatedAt: nowIso(), details: { ...match.details, stationNumber: undefined, disputeReason: undefined } };
            await this.repository.saveMatch(completed, client);
            await this.audit(session, client, input.actor, input.action, match, completed, match.id, input.reason);
          }
          break;
        }
      }
      await this.saveSession(session, client);
      if (!input.matchId) await this.audit(session, client, input.actor, input.action, before, { options: session.options, participantId: input.participantId }, undefined, input.reason);
      return this.refreshTournamentSession(tournamentId, client, session);
    });
    await this.notifyLadderMatchesFound(await this.requireEligibleTournament(tournamentId), notifications);
    return this.getOverview(tournamentId);
  }
  async joinQueue(tournamentId: string, participant: TournamentParticipant): Promise<LadderOverview> {
    const notifications = await this.transaction(tournamentId, async client => {
      await this.requireEligibleTournament(tournamentId);
      const session = await this.requireActiveSession(tournamentId, client);
      const settings = this.settings(session);
      if (session.options?.closing || (settings.closesAt && Date.parse(settings.closesAt) <= Date.now())) throw new Error("Registration is closed");
      if (session.options?.excludedParticipantIds?.includes(participant.id)) throw new Error("Staff removed you from this ladder");
      if (!(await this.tournamentsRepository.listParticipants(tournamentId)).some(p => p.id === participant.id)) throw new Error("Participant not found");
      await this.enqueueParticipant(session, { ...participant, participantId: participant.id, slot: 1, score: 0 }, client);
      return this.refreshTournamentSession(tournamentId, client, session);
    });
    await this.notifyLadderMatchesFound(await this.requireEligibleTournament(tournamentId), notifications);
    return this.getOverview(tournamentId);
  }
  async leaveQueue(tournamentId: string, participantId: string): Promise<LadderOverview> {
    await this.transaction(tournamentId, async client => {
      const session = await this.repository.getActiveSessionForTournament(tournamentId, client, true);
      if (session) await this.repository.deleteQueueEntryByParticipant(session.id, participantId, client);
    });
    return this.getOverview(tournamentId);
  }
  async readyUp(tournamentId: string, matchId: string, participantId: string): Promise<LadderOverview> {
    await this.transaction(tournamentId, async client => {
      const session = await this.requireActiveSession(tournamentId, client);
      const match = await this.requireEditableMatch(session.id, matchId, client, "READY_CHECK");
      this.assertMember(match, participantId);
      if (Date.parse(match.readyDeadlineAt ?? "") <= Date.now()) throw new Error("Confirmation time expired");
      const busy = await this.bracketOccupancy(tournamentId);
      if (match.participants.some(p => busy.players.has(p.participantId)) || (match.details?.stationNumber && busy.stations.has(match.details.stationNumber))) throw new Error("The main bracket takes priority. Refresh the ladder");
      if (match.participants[0]?.participantId === participantId) match.participantOneReadyAt ??= nowIso();
      if (match.participants[1]?.participantId === participantId) match.participantTwoReadyAt ??= nowIso();
      if (match.participantOneReadyAt && match.participantTwoReadyAt) { match.status = "PLAYING"; match.startedAt ??= nowIso(); }
      match.updatedAt = nowIso();
      await this.repository.saveMatch(match, client);
    });
    return this.getOverview(tournamentId);
  }
  async cancelReadyCheck(tournamentId: string, matchId: string, participantId: string): Promise<LadderOverview> {
    const notifications = await this.transaction(tournamentId, async client => {
      const session = await this.requireActiveSession(tournamentId, client);
      const match = await this.requireEditableMatch(session.id, matchId, client, "READY_CHECK");
      this.assertMember(match, participantId);
      await this.cancelMatch(session, match, client, "Cancelled by participant", participantId);
      for (const p of match.participants.filter(p => p.participantId !== participantId)) await this.enqueueParticipant(session, p, client, match.details?.queueEnteredAt?.[p.participantId]);
      return this.refreshTournamentSession(tournamentId, client, session);
    });
    await this.notifyLadderMatchesFound(await this.requireEligibleTournament(tournamentId), notifications);
    return this.getOverview(tournamentId);
  }
  async reportDetailedResult(tournamentId: string, matchId: string, games: LadderDetailedGameInput[], options: { bestOfOverride?: 1 | 3 | 5; reporterParticipantId?: string } = {}): Promise<LadderOverview> {
    const tournament = await this.requireEligibleTournament(tournamentId);
    const notifications = await this.transaction(tournamentId, async client => {
      const session = await this.requireActiveSession(tournamentId, client);
      const match = await this.requireEditableMatch(session.id, matchId, client, "PLAYING");
      if (options.reporterParticipantId) this.assertMember(match, options.reporterParticipantId);
      const supportsCharacters = this.supportsCharacterReporting(tournament);
      const bestOf = options.bestOfOverride ?? match.bestOf;
      if (![1,3,5].includes(bestOf)) throw new Error("Invalid set format");
      const needed = Math.floor(bestOf / 2) + 1;
      const scores = new Map<string, number>();
      const gameResults: string[] = [];
      const gameCharacterSelections: MatchGameCharacterSelections[] = [];
      for (const [index, game] of games.entries()) {
        if ([...scores.values()].some(score => score >= needed)) throw new Error("Games cannot be reported after the set is closed");
        if (!match.participants.some(p => p.participantId === game.winnerParticipantId)) throw new Error("The game winner is not part of this ladder match");
        gameResults.push(game.winnerParticipantId);
        scores.set(game.winnerParticipantId, (scores.get(game.winnerParticipantId) ?? 0) + 1);
        if (supportsCharacters) gameCharacterSelections.push({ gameNum: index+1, selections: this.normalizeSelections(match, game.selections, tournament) });
      }
      const winner = [...scores].find(([,score]) => score === needed)?.[0];
      if (!winner) throw new Error("The detailed result must finish the full set");
      const pending = this.settings(session).requireConfirmation && !!options.reporterParticipantId;
      const completed: LadderMatch = { ...match, bestOf, status: pending ? "AWAITING_CONFIRMATION" : "COMPLETED", winnerParticipantId: winner,
        participants: match.participants.map(p => ({ ...p, score: scores.get(p.participantId) ?? 0 })), gameResults,
        characterSelections: gameCharacterSelections.at(-1)?.selections, gameCharacterSelections: supportsCharacters ? gameCharacterSelections : undefined,
        completedAt: pending ? undefined : nowIso(), updatedAt: nowIso(), details: { ...match.details, stationNumber: undefined, reportedByParticipantId: options.reporterParticipantId, reportedAt: nowIso() } };
      await this.repository.saveMatch(completed, client);
      await this.audit(session, client, options.reporterParticipantId ?? "staff", "REPORT", match, completed, match.id);
      return this.refreshTournamentSession(tournamentId, client, session);
    });
    await this.notifyLadderMatchesFound(tournament, notifications);
    return this.readOverview(tournamentId);
  }
  async reviewResult(tournamentId: string, matchId: string, participantId: string, input: { action: "CONFIRM" | "DISPUTE"; expectedRevision: string; reason?: string }): Promise<LadderOverview> {
    const notifications = await this.transaction(tournamentId, async client => {
      const session = await this.requireActiveSession(tournamentId, client);
      const match = await this.requireEditableMatch(session.id, matchId, client, "AWAITING_CONFIRMATION");
      this.assertMember(match, participantId);
      this.checkRevision(input.expectedRevision, match.details?.revision);
      if (match.details?.reportedByParticipantId === participantId) throw new Error("The opponent must review your result");
      if (input.action === "DISPUTE" && !input.reason?.trim()) throw new Error("Enter the dispute reason");
      const updated: LadderMatch = { ...match, status: input.action === "CONFIRM" ? "COMPLETED" : "DISPUTED", updatedAt: nowIso(), completedAt: input.action === "CONFIRM" ? nowIso() : undefined,
        details: { ...match.details, confirmedByParticipantId: input.action === "CONFIRM" ? participantId : undefined, disputeReason: input.reason } };
      await this.repository.saveMatch(updated, client);
      await this.audit(session, client, participantId, input.action, match, updated, match.id, input.reason);
      return this.refreshTournamentSession(tournamentId, client, session);
    });
    await this.notifyLadderMatchesFound(await this.requireEligibleTournament(tournamentId), notifications);
    return this.getOverview(tournamentId);
  }
  /** Called before a bracket call/start, inside the same tournament transaction. */
  async reserveForBracket(tournamentId: string, match: Match, stationLabel?: string): Promise<void> {
    await this.transaction(tournamentId, async client => {
      const session = await this.repository.getActiveSessionForTournament(tournamentId, client, true);
      if (!session) return;
      const players = new Set(match.participants.map(p => p.participantId));
      const station = setupNumber(stationLabel);
      for (const ladder of await this.repository.listMatches(session.id, client, true)) {
        if (occupiesLadderSetup(ladder) && (ladder.participants.some(p => players.has(p.participantId)) || (station && ladder.details?.stationNumber === station))) await this.suspend(session, ladder, client);
      }
    });
  }
  private async suspend(session: LadderSession, match: LadderMatch, client: PoolClient): Promise<void> {
    const updated: LadderMatch = { ...match, status: "SUSPENDED", readyDeadlineAt: undefined, participantOneReadyAt: undefined, participantTwoReadyAt: undefined, updatedAt: nowIso(),
      details: { ...match.details, stationNumber: undefined, previousStatus: match.status === "PLAYING" ? "PLAYING" : "READY_CHECK", suspensionReason: "Waiting for available players and setups from the main bracket" } };
    await this.repository.saveMatch(updated, client);
    await this.audit(session, client, "sistema", "SUSPEND", match.status, updated.status, match.id, updated.details?.suspensionReason);
  }
  private async bracketOccupancy(id: string): Promise<{ players: Set<string>; stations: Set<number> }> {
    const matches = (await this.tournamentsRepository.listMatches(id)).filter(m => occupiesBracket(m.status));
    return { players: new Set(matches.flatMap(m => m.participants.map(p => p.participantId))), stations: new Set(matches.map(m => setupNumber(m.call?.stationLabel)).filter((n): n is number => !!n)) };
  }
  private async refreshTournamentSession(tournamentId: string, client: PoolClient, currentSession?: LadderSession): Promise<LadderMatch[]> {
    const session = currentSession ?? await this.repository.getActiveSessionForTournament(tournamentId, client, true);
    if (!session || session.status !== "ACTIVE") return [];
    const settings = this.settings(session);
    if (!session.options?.closing && settings.closesAt && Date.parse(settings.closesAt) <= Date.now()) {
      session.options = { ...session.options, settings, closing: true, paused: false };
      await this.repository.clearQueue(session.id, client);
      await this.saveSession(session, client);
      await this.audit(session, client, "sistema", "SCHEDULED_CLOSE");
    }
    const busy = await this.bracketOccupancy(tournamentId);
    const tournament = await this.tournamentsRepository.getTournament(tournamentId);
    const registered = new Set((await this.tournamentsRepository.listParticipants(tournamentId)).map(p => p.id));
    if (tournament?.status === "CANCELLED") {
      session.options = { ...session.options, settings, closing: true, paused: false };
      await this.repository.clearQueue(session.id, client);
      await this.saveSession(session, client);
    }
    for (const entry of await this.repository.listQueueEntries(session.id, client)) {
      if (!registered.has(entry.participantId)) await this.repository.deleteQueueEntryByParticipant(session.id, entry.participantId, client);
    }
    for (const match of await this.repository.listMatches(session.id, client, true)) {
      if (openLadderStatuses.includes(match.status) && (tournament?.status === "CANCELLED" || match.participants.some(p => !registered.has(p.participantId)))) {
        await this.cancelMatch(session, match, client, tournament?.status === "CANCELLED" ? "Tournament cancelled" : "Participant withdrawn from tournament", "sistema");
        for (const participant of match.participants.filter(p => registered.has(p.participantId))) await this.enqueueParticipant(session, participant, client, match.details?.queueEnteredAt?.[participant.participantId]);
        continue;
      }
      if (occupiesLadderSetup(match) && (match.participants.some(p => busy.players.has(p.participantId)) || (match.details?.stationNumber && (busy.stations.has(match.details.stationNumber) || match.details.stationNumber > (tournament?.settings.setupCount ?? 0))))) {
        await this.suspend(session, match, client); continue;
      }
      if (match.status !== "READY_CHECK" || !match.readyDeadlineAt || Date.parse(match.readyDeadlineAt) > Date.now()) continue;
      const readyIds = [match.participantOneReadyAt ? match.participants[0]?.participantId : undefined, match.participantTwoReadyAt ? match.participants[1]?.participantId : undefined];
      const expired: LadderMatch = { ...match, status: "EXPIRED", completedAt: nowIso(), updatedAt: nowIso(), details: { ...match.details, stationNumber: undefined, absenceParticipantIds: match.participants.filter(p => !readyIds.includes(p.participantId)).map(p => p.participantId) } };
      await this.repository.saveMatch(expired, client);
      await this.audit(session, client, "sistema", "READY_TIMEOUT", match.status, expired.details, match.id);
      for (const p of match.participants.filter(p => readyIds.includes(p.participantId))) await this.enqueueParticipant(session, p, client, match.details?.queueEnteredAt?.[p.participantId]);
    }
    const notifications = await this.attemptMatchmaking(session, client);
    const open = (await this.repository.listMatches(session.id, client)).filter(m => openLadderStatuses.includes(m.status));
    if (session.options?.closing && open.length === 0) {
      session.status = "COMPLETED"; session.completedAt = nowIso();
      await this.saveSession(session, client);
      await this.audit(session, client, session.completedByUserId ?? "sistema", "COMPLETE");
      const standings = ladderStandings(await this.repository.listMatches(session.id, client), settings);
      const winner = standings.find(s => settings.mode === "CASUAL" || s.eligible);
      if (tournament && winner) {
        const matches = await this.tournamentsRepository.listMatches(tournamentId);
        this.tournamentsRepository.afterCommit(() => { void this.notifySafely(() => this.notifier.notifyLadderCompleted(tournament, matches, winner.displayName, standings)); });
      }
    }
    return notifications;
  }
  private async attemptMatchmaking(session: LadderSession, client: PoolClient): Promise<LadderMatch[]> {
    const settings = this.settings(session);
    if (session.options?.paused || (settings.opensAt && Date.parse(settings.opensAt) > Date.now())) return [];
    const notifications: LadderMatch[] = [];
    const busy = await this.bracketOccupancy(session.tournamentId);
    const tournament = await this.tournamentsRepository.getTournament(session.tournamentId);
    const stations = settings.setupNumbers.filter(n => n <= (tournament?.settings.setupCount ?? 0));
    const matches = await this.repository.listMatches(session.id, client, true);
    const occupied = new Set([...busy.stations, ...matches.filter(occupiesLadderSetup).map(m => m.details?.stationNumber).filter((n): n is number => !!n)]);
    const freeStation = () => stations.find(n => !occupied.has(n));
    // Resume interrupted sets before assigning new ones, including during graceful closure.
    for (const match of [...matches].reverse().filter(m => m.status === "SUSPENDED")) {
      if (match.participants.some(p => busy.players.has(p.participantId))) continue;
      const station = freeStation();
      if (settings.setupNumbers.length && !station) break;
      const resumed = await this.repository.saveMatch({ ...match, status: "READY_CHECK", readyDeadlineAt: new Date(Date.now()+settings.readySeconds*1000).toISOString(), updatedAt: nowIso(),
        participantOneReadyAt: undefined, participantTwoReadyAt: undefined,
        details: { ...match.details, stationNumber: station, suspensionReason: undefined } }, client);
      if (station) occupied.add(station);
      notifications.push(resumed);
    }
    if (session.options?.closing) return notifications;
    let queue = (await this.repository.listQueueEntries(session.id, client, true)).filter(q => !busy.players.has(q.participantId) && !session.options?.excludedParticipantIds?.includes(q.participantId) && !matches.some(m => openLadderStatuses.includes(m.status) && m.participants.some(p => p.participantId === q.participantId)));
    while (queue.length >= 2) {
      const station = freeStation();
      if (settings.setupNumbers.length && !station) break;
      const pair = selectLadderPair(queue, [...matches, ...notifications], settings);
      if (!pair) break;
      const now = nowIso();
      const created = await this.repository.saveMatch({ id: createId("lam"), ladderSessionId: session.id, tournamentId: session.tournamentId, status: "READY_CHECK", bestOf: settings.bestOf,
        participants: pair.map((p,index) => ({ id: createId("lmp"), participantId: p.participantId, displayName: p.displayName, slot: index+1, score: 0 })),
        readyDeadlineAt: new Date(Date.now()+settings.readySeconds*1000).toISOString(), createdAt: now, updatedAt: now,
        details: { stationNumber: station, queueEnteredAt: Object.fromEntries(pair.map(p => [p.participantId,p.queuedAt])) } }, client);
      for (const p of pair) await this.repository.deleteQueueEntryByParticipant(session.id, p.participantId, client);
      queue = queue.filter(q => !pair.some(p => p.participantId === q.participantId));
      if (station) occupied.add(station);
      notifications.push(created);
    }
    return notifications;
  }
  /** Timer recovers after restart; the tournament advisory lock also coordinates multiple workers. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const id of await this.repository.listActiveTournamentIds()) {
        try {
          const matches = await this.transaction(id, client => this.refreshTournamentSession(id, client));
          if (matches.length) await this.notifyLadderMatchesFound(await this.requireEligibleTournament(id), matches);
        } catch (error) { console.error("[ladder-worker]", id, error); }
      }
    } finally { this.ticking = false; }
  }
  private async cancelMatch(session: LadderSession, match: LadderMatch, client: PoolClient, reason: string, actor: string): Promise<void> {
    const cancelled: LadderMatch = { ...match, status: "CANCELLED", completedAt: nowIso(), updatedAt: nowIso(), cancelledByParticipantId: actor, details: { ...match.details, stationNumber: undefined, cancellationReason: reason } };
    await this.repository.saveMatch(cancelled, client);
    await this.audit(session, client, actor, "CANCEL", match, cancelled, match.id, reason);
  }
  private async enqueueParticipant(session: LadderSession, participant: MatchParticipant, client: PoolClient, queuedAt?: string): Promise<void> {
    if (session.options?.closing || session.options?.excludedParticipantIds?.includes(participant.participantId)) return;
    if (await this.repository.getOpenMatchForParticipant(session.id, participant.participantId, client, true)) return;
    if (await this.repository.getQueueEntryForParticipant(session.id, participant.participantId, client, true)) return;
    const now = nowIso();
    await this.repository.saveQueueEntry({ id: createId("laq"), ladderSessionId: session.id, tournamentId: session.tournamentId, participantId: participant.participantId, displayName: participant.displayName, queuedAt: queuedAt ?? now, createdAt: now, updatedAt: now }, client);
  }
  private async readOverview(tournamentId: string, client?: PoolClient): Promise<LadderOverview> {
    const session = await this.repository.getLatestSessionForTournament(tournamentId, client);
    if (!session) return { queue: [], activeMatches: [], completedMatches: [], standings: [], serverTime: nowIso() };
    const matches = await this.repository.listMatches(session.id, client);
    const settings = this.settings(session);
    const queue = session.status === "ACTIVE" ? await this.repository.listQueueEntries(session.id, client) : [];
    const busy = await this.bracketOccupancy(tournamentId);
    const occupied = new Set([...busy.stations, ...matches.filter(occupiesLadderSetup).map(m => m.details?.stationNumber)]);
    const tournament = await this.tournamentsRepository.getTournament(tournamentId);
    const free = !settings.setupNumbers.length || settings.setupNumbers.some(n => n <= (tournament?.settings.setupCount ?? 0) && !occupied.has(n));
    return { session: { ...session, options: { ...session.options, settings } },
      queue: queue.map(q => ({ ...q, waitingReason: busy.players.has(q.participantId) ? "Playing in the main bracket" : session.options?.paused ? "Ladder paused" : settings.opensAt && Date.parse(settings.opensAt)>Date.now() ? "Waiting for opening time" : !free ? "Waiting for an available setup" : "Waiting for a compatible opponent" })),
      activeMatches: matches.filter(m => openLadderStatuses.includes(m.status)), completedMatches: matches.filter(m => !openLadderStatuses.includes(m.status)),
      standings: ladderStandings(matches, settings), activity: await this.repository.listActivity(session.id, client), serverTime: nowIso() };
  }
  private async requireEligibleTournament(id: string): Promise<Tournament> {
    const tournament = await this.tournamentsRepository.getTournament(id);
    if (!tournament) throw new Error("Tournament not found");
    if (tournament.importSource?.provider !== "START_GG") throw new Error("The ladder is only available for tournaments imported from start.gg");
    return tournament;
  }
  private async requireActiveSession(id: string, client: PoolClient): Promise<LadderSession> {
    const session = await this.repository.getActiveSessionForTournament(id, client, true);
    if (!session) throw new Error("The ladder is not active in this tournament");
    return session;
  }
  private async requireEditableMatch(sessionId: string, id: string, client: PoolClient, status: LadderMatch["status"]): Promise<LadderMatch> {
    const match = await this.repository.getMatchById(id, client, true);
    if (!match || match.ladderSessionId !== sessionId) throw new Error("Ladder match not found");
    if (match.status !== status) throw new Error("The ladder match is no longer editable");
    return match;
  }
  private async notifyLadderMatchesFound(tournament: Tournament, matches: LadderMatch[]): Promise<void> {
    for (const match of matches) void this.notifySafely(() => this.notifier.notifyLadderMatchFound(tournament, match));
  }
  private async notifySafely(action: () => Promise<void>): Promise<void> {
    try { await action(); } catch (error) { console.error("[ladder-notifier]", error); }
  }
  private supportsCharacterReporting(tournament: Tournament): boolean {
    return /smash|ultimate|rivals|roa2/i.test(tournament.gameTitle);
  }

  private normalizeSelections(
    match: LadderMatch,
    selections: LadderDetailedGameInput["selections"],
    tournament: Tournament,
  ): MatchCharacterSelection[] {
    if (!selections?.length) {
      throw new Error("Each ladder game requires characters for both players");
    }
    const allowedIds = new Set(match.participants.map((participant) => participant.participantId));
    const seen = new Set<string>();
    const size = Math.max(1, tournament.importSource?.entrantSize ?? 1);
    const normalizedSelections = selections.flatMap(selection => {
      if (!allowedIds.has(selection.participantId) || seen.has(selection.participantId)) throw new Error("Each team must be included exactly once");
      seen.add(selection.participantId);
      const names = selection.characterName.split("/").map(name => name.trim());
      if (names.length !== size || names.some(name => !name)) throw new Error("Select characters for all team members");
      return names.map(name => {
        const character = /rivals|roa/i.test(tournament.gameTitle) ? resolveRoa2Character(name) : resolveSmashUltimateCharacter(name);
        if (!character) throw new Error("Personaje desconocido: " + name);
        return { participantId: selection.participantId, characterId: character.id, characterName: character.name };
      });
    });
    if (seen.size !== allowedIds.size) throw new Error("Each game must include both teams");
    return normalizedSelections;
  }

}
