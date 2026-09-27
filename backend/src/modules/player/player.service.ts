import { withBracketLabels } from "../tournaments/bracket-labels.js";
import crypto from "crypto";
import { createId } from "../../shared/id.js";
import type { Match, Tournament, TournamentParticipant } from "../../shared/types.js";
import { LadderService } from "../ladder/ladder.service.js";
import type { LadderSessionOptions, LadderOverview } from "../ladder/ladder.types.js";
import { TournamentsPostgresRepository } from "../tournaments/tournaments.postgres-repository.js";
import { TournamentsService } from "../tournaments/tournaments.service.js";
import type {
  PlayerLadderDetailedReportInput,
  PlayerReportDetailedResultInput,
  PlayerLadderQueueInput,
  PlayerPushTokenInput,
  PlayerLadderReadyInput,
  PlayerRecordGameWinInput,
  PlayerReportResultInput,
  PlayerResolveAbsenceInput,
  PlayerUpdateCharactersInput,
} from "./player.schemas.js";
import { PlayerPostgresRepository, type PlayerAccountRecord } from "./player.postgres-repository.js";
import { StartggOAuthClient, type StartggCurrentUserIdentity } from "./startgg-oauth.client.js";

type PlayerSessionContext = {
  sessionId: string;
  sessionToken: string;
  account: PlayerAccountRecord;
  identity: StartggCurrentUserIdentity;
};

type PlayerMatchView = {
  ladderRevision?: string;
  canReviewLadderResult?: boolean;
  ladderMessage?: string;
  entrantSize: number;
  gameTitle: string;
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  tournamentStatus: string;
  startsAt: string;
  roundLabel: string;
  bracketStage: string;
  status: string;
  bestOf: number;
  reportedBestOf?: number;
  stationLabel?: string;
  calledAt?: string;
  startedAt?: string;
  callTimeoutSeconds?: number;
  readyDeadlineAt?: string;
  participantOneReadyAt?: string;
  participantTwoReadyAt?: string;
  myParticipantId: string;
  mySlot: number;
  myDisplayName: string;
  myScore: number;
  opponentParticipantId?: string;
  opponentSlot?: number;
  opponentDisplayName?: string;
  opponentScore?: number;
  winnerParticipantId?: string;
  canPlayerReportMatch: boolean;
  canReportCharacters: boolean;
  characterSelections: Match["characterSelections"];
  gameCharacterSelections: Match["gameCharacterSelections"];
  gameResults: Match["gameResults"];
};

type PlayerBracketMatchParticipantView = {
  participantId: string;
  displayName: string;
  slot: number;
  score: number;
};

type PlayerBracketMatchView = {
  displayIdentifier?: string;
  startggStreamLabel?: string;
  id: string;
  tournamentId: string;
  bracketStage: string;
  roundNumber: number;
  matchNumber: number;
  label: string;
  status: string;
  bestOf: number;
  reportedBestOf?: number;
  advancersRequired: number;
  participants: PlayerBracketMatchParticipantView[];
  advancingParticipantIds: string[];
  winnerParticipantId?: string;
  stationLabel?: string;
  calledAt?: string;
  startedAt?: string;
  callTimeoutSeconds?: number;
  characterSelections: Match["characterSelections"];
  gameCharacterSelections: Match["gameCharacterSelections"];
  gameResults: Match["gameResults"];
  phaseId?: string;
  phaseName?: string;
  phaseOrder?: number;
  phaseGroupId?: string;
  phaseGroupName?: string;
  phaseType?: string;
  isPoolPhase: boolean;
  fullRoundText?: string;
};

type PlayerTournamentView = {
  callTimeoutMinutes: number;
  tournamentId: string;
  title: string;
  gameTitle: string;
  status: string;
  startsAt: string;
  myParticipantId: string;
  myDisplayName: string;
  pendingMatches: PlayerMatchView[];
  activeMatches: PlayerMatchView[];
  completedMatches: PlayerMatchView[];
  bracketMatches: PlayerBracketMatchView[];
  ladder?: PlayerLadderView;
};

type PlayerLadderStandingView = {
  rating?: number; eligible?: boolean; winRate?: number;
  participantId: string;
  displayName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameDifferential: number;
};

type PlayerLadderView = {
  options?: LadderSessionOptions;
  waitingReason?: string;
  queuePosition?: number;
  serverTime?: string;
  canJoin?: boolean;
  status: "ACTIVE" | "COMPLETED";
  queuedAt?: string;
  readyCheckMatch?: PlayerMatchView;
  activeMatch?: PlayerMatchView;
  history: PlayerMatchView[];
  standings: PlayerLadderStandingView[];
};

export class PlayerService {
  private readonly entrantCache = new Map<string, { entrantId?: string; expiresAt: number }>();
  private readonly accountRefreshes = new Map<string, Promise<PlayerAccountRecord>>();
  private readonly oauthCallbackPath = "/api/player/auth/startgg/callback";

  constructor(
    private readonly playerRepository: PlayerPostgresRepository,
    private readonly tournamentsRepository: TournamentsPostgresRepository,
    private readonly tournamentsService: TournamentsService,
    private readonly ladderService: LadderService,
    private readonly startggOAuthClient: StartggOAuthClient,
    private readonly publicBaseUrl: string | undefined,
  ) {}

  async createMobileStartggAuth(redirectUri: string) {
    const state = randomToken(24);
    const now = new Date();
    await this.playerRepository.saveAuthState({
      id: createId("pst"),
      state,
      redirectUri,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    });
    return {
      authorizationUrl: this.startggOAuthClient.createAuthorizationUrl(this.oauthCallbackUrl(), state),
    };
  }

  async finishStartggOAuth(code: string, stateValue: string): Promise<string> {
    const state = await this.playerRepository.findAuthState(stateValue);
    if (!state || new Date(state.expiresAt).getTime() < Date.now()) {
      throw new Error("The login request is no longer valid");
    }
    if (state.completedRedirectUrl) {
      return state.completedRedirectUrl;
    }
    if (state.usedAt) {
      throw new Error("The login request is no longer valid");
    }
    const usedAt = new Date().toISOString();
    const claimed = await this.playerRepository.markAuthStateUsed(state.id, usedAt);
    if (!claimed) {
      const refreshedState = await this.playerRepository.findAuthState(stateValue);
      if (refreshedState?.completedRedirectUrl) {
        return refreshedState.completedRedirectUrl;
      }
      throw new Error("The login request is no longer valid");
    }

    const tokens = await this.startggOAuthClient.exchangeAuthorizationCode(code, this.oauthCallbackUrl());
    const identity = await this.startggOAuthClient.fetchCurrentUserIdentity(tokens.accessToken);
    const now = new Date().toISOString();
    const existing = await this.playerRepository.findAccountByStartggUserId(identity.userId);
    const account = await this.playerRepository.saveAccount({
      id: existing?.id ?? createId("pla"),
      provider: "START_GG",
      startggUserId: identity.userId,
      startggPlayerId: identity.playerId,
      gamerTag: identity.gamerTag,
      displayName: identity.displayName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      scope: tokens.scope,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    const sessionToken = randomToken(48);
    await this.playerRepository.createSession({
      id: createId("pls"),
      accountId: account.id,
      sessionTokenHash: hashToken(sessionToken),
      createdAt: now,
      lastSeenAt: now,
    });

    const redirect = new URL(state.redirectUri);
    redirect.searchParams.set("sessionToken", sessionToken);
    redirect.searchParams.set("gamerTag", account.gamerTag);
    redirect.searchParams.set("displayName", account.displayName);
    const redirectUrl = redirect.toString();
    await this.playerRepository.completeAuthState(state.id, now, redirectUrl);
    return redirectUrl;
  }

  async buildFailedOAuthRedirect(stateValue: string, message: string): Promise<string | undefined> {
    const state = await this.playerRepository.findAuthState(stateValue);
    const redirectUri = state?.redirectUri?.trim();
    if (!redirectUri) {
      return undefined;
    }
    const redirect = new URL(redirectUri);
    redirect.searchParams.set("error", message);
    return redirect.toString();
  }

  async logout(sessionToken: string): Promise<void> {
    await this.playerRepository.revokeSession(hashToken(sessionToken));
  }

  async getSessionProfile(sessionToken: string) {
    const session = await this.requireSession(sessionToken);
    return {
      displayName: session.account.displayName,
      gamerTag: session.account.gamerTag,
      provider: session.account.provider,
    };
  }

  async registerPushToken(sessionToken: string, input: PlayerPushTokenInput): Promise<void> {
    const session = await this.requireSession(sessionToken);
    const now = new Date().toISOString();
    await this.playerRepository.upsertPushToken({
      token: input.token,
      accountId: session.account.id,
      platform: "ANDROID",
      deviceLabel: input.deviceLabel,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    await this.refreshParticipantBindings(session);
  }

  async unregisterPushToken(sessionToken: string, input: PlayerPushTokenInput): Promise<void> {
    await this.requireSession(sessionToken);
    await this.playerRepository.deletePushToken(input.token);
  }

  async listMyTournaments(sessionToken: string): Promise<{ tournaments: PlayerTournamentView[] }> {
    const session = await this.requireSession(sessionToken);
    const tournaments = await this.tournamentsRepository.listTournaments();
    const imported = tournaments.filter((item) => item.importSource?.provider === "START_GG" && item.status !== 'ARCHIVED');
    const results: PlayerTournamentView[] = [];

    for (const tournament of imported) {
      try {
        const view = await this.buildTournamentViewForSession(session, tournament);
        if (view) {
          results.push(view);
        }
      } catch (error) {
        console.warn(`[player] failed to build tournament view for ${tournament.id}:`, error);
      }
    }

    return {
      tournaments: results.sort((left, right) => String(left.startsAt ?? "").localeCompare(String(right.startsAt ?? ""))),
    };
  }

  async getMyTournament(sessionToken: string, tournamentId: string): Promise<PlayerTournamentView> {
    const session = await this.requireSession(sessionToken);
    const tournament = await this.tournamentsRepository.getTournament(tournamentId);
    if (!tournament || tournament.importSource?.provider !== "START_GG" || tournament.status === 'ARCHIVED') {
      throw new Error("Tournament not available");
    }
    const view = await this.buildTournamentViewForSession(session, tournament);
    if (!view) {
      throw new Error("Tournament not available for this player");
    }
    return view;
  }

  async updateMatchCharacters(
    sessionToken: string,
    tournamentId: string,
    matchId: string,
    input: PlayerUpdateCharactersInput,
  ) {
    const session = await this.requireSession(sessionToken);
    const { tournament, participant } = await this.ensurePlayerCanOperateMatch(session, tournamentId, matchId);
    const updated = await this.tournamentsService.updateMatchCharacters(tournamentId, matchId, input);
    return this.requirePlayerMatchView(tournament, updated, participant.id);
  }

  async recordGameWin(
    sessionToken: string,
    tournamentId: string,
    matchId: string,
    input: PlayerRecordGameWinInput,
  ) {
    const session = await this.requireSession(sessionToken);
    const { tournament, participant } = await this.ensurePlayerCanOperateMatch(session, tournamentId, matchId);
    const updated = await this.tournamentsService.recordGameWin(tournamentId, matchId, input);
    return this.requirePlayerMatchView(tournament, updated, participant.id);
  }

  async reportResult(
    sessionToken: string,
    tournamentId: string,
    matchId: string,
    input: PlayerReportResultInput,
  ) {
    const session = await this.requireSession(sessionToken);
    const { tournament, participant } = await this.ensurePlayerCanOperateMatch(session, tournamentId, matchId);
    if (participant.id !== input.winnerParticipantId) {
      throw new Error("The player can only report results for their own slot");
    }
    const updated = await this.tournamentsService.reportResult(tournamentId, matchId, input);
    return this.requirePlayerMatchView(tournament, updated, participant.id);
  }

  async reportDetailedResult(
    sessionToken: string,
    tournamentId: string,
    matchId: string,
    input: PlayerReportDetailedResultInput,
  ) {
    const session = await this.requireSession(sessionToken);
    const { tournament, participant } = await this.ensurePlayerCanOperateMatch(session, tournamentId, matchId);
    const updated = await this.tournamentsService.reportDetailedResult(tournamentId, matchId, input);
    return this.requirePlayerMatchView(tournament, updated, participant.id);
  }

  async resolveAbsence(
    sessionToken: string,
    tournamentId: string,
    matchId: string,
    input: PlayerResolveAbsenceInput,
  ) {
    const session = await this.requireSession(sessionToken);
    const { tournament, participant } = await this.ensurePlayerCanOperateMatch(session, tournamentId, matchId);
    const updated = await this.tournamentsService.resolveAbsence(tournamentId, matchId, input);
    return this.requirePlayerMatchView(tournament, updated, participant.id);
  }

  async resetMatch(
    sessionToken: string,
    tournamentId: string,
    matchId: string,
  ) {
    const session = await this.requireSession(sessionToken);
    const { tournament, participant } = await this.ensurePlayerCanOperateMatch(session, tournamentId, matchId);
    const updated = await this.tournamentsService.resetMatch(tournamentId, matchId);
    return this.requirePlayerMatchView(tournament, updated, participant.id);
  }

  async joinLadderQueue(
    sessionToken: string,
    tournamentId: string,
    _input: PlayerLadderQueueInput,
  ): Promise<PlayerTournamentView> {
    const session = await this.requireSession(sessionToken);
    const tournament = await this.tournamentsRepository.getTournament(tournamentId);
    if (!tournament || tournament.importSource?.provider !== "START_GG") {
      throw new Error("Tournament not available");
    }
    const participant = await this.findPlayerParticipantForTournament(session, tournament);
    if (!participant) {
      throw new Error("Player not registered in this imported tournament");
    }
    await this.ladderService.joinQueue(tournamentId, participant);
    return this.getMyTournament(sessionToken, tournamentId);
  }

  async leaveLadderQueue(
    sessionToken: string,
    tournamentId: string,
    _input: PlayerLadderQueueInput,
  ): Promise<PlayerTournamentView> {
    const session = await this.requireSession(sessionToken);
    const tournament = await this.tournamentsRepository.getTournament(tournamentId);
    if (!tournament || tournament.importSource?.provider !== "START_GG") {
      throw new Error("Tournament not available");
    }
    const participant = await this.findPlayerParticipantForTournament(session, tournament);
    if (!participant) {
      throw new Error("Player not registered in this imported tournament");
    }
    await this.ladderService.leaveQueue(tournamentId, participant.id);
    return this.getMyTournament(sessionToken, tournamentId);
  }

  async readyLadderMatch(
    sessionToken: string,
    tournamentId: string,
    ladderMatchId: string,
    _input: PlayerLadderReadyInput,
  ): Promise<PlayerTournamentView> {
    const session = await this.requireSession(sessionToken);
    const tournament = await this.tournamentsRepository.getTournament(tournamentId);
    if (!tournament || tournament.importSource?.provider !== "START_GG") {
      throw new Error("Tournament not available");
    }
    const participant = await this.findPlayerParticipantForTournament(session, tournament);
    if (!participant) {
      throw new Error("Player not registered in this imported tournament");
    }
    await this.ladderService.readyUp(tournamentId, ladderMatchId, participant.id);
    return this.getMyTournament(sessionToken, tournamentId);
  }

  async cancelLadderMatch(
    sessionToken: string,
    tournamentId: string,
    ladderMatchId: string,
    _input: PlayerLadderReadyInput,
  ): Promise<PlayerTournamentView> {
    const session = await this.requireSession(sessionToken);
    const tournament = await this.tournamentsRepository.getTournament(tournamentId);
    if (!tournament || tournament.importSource?.provider !== "START_GG") {
      throw new Error("Tournament not available");
    }
    const participant = await this.findPlayerParticipantForTournament(session, tournament);
    if (!participant) {
      throw new Error("Player not registered in this imported tournament");
    }
    await this.ladderService.cancelReadyCheck(tournamentId, ladderMatchId, participant.id);
    return this.getMyTournament(sessionToken, tournamentId);
  }

  async reviewLadderResult(token: string, tournamentId: string, matchId: string, input: {action:"CONFIRM"|"DISPUTE"; expectedRevision:string;reason?:string}): Promise<PlayerTournamentView> {
    const session = await this.requireSession(token);
    const tournament = await this.tournamentsRepository.getTournament(tournamentId);
    if (!tournament) throw new Error("Tournament not found");
    const participant = await this.findPlayerParticipantForTournament(session,tournament);
    if (!participant) throw new Error("Player not registered in this imported tournament");
    await this.ladderService.reviewResult(tournamentId,matchId,participant.id,input);
    return this.getMyTournament(token,tournamentId);
  }
  async reportLadderDetailedResult(
    sessionToken: string,
    tournamentId: string,
    ladderMatchId: string,
    input: PlayerLadderDetailedReportInput,
  ): Promise<PlayerTournamentView> {
    const session = await this.requireSession(sessionToken);
    const tournament = await this.tournamentsRepository.getTournament(tournamentId);
    if (!tournament) throw new Error("Tournament not found");
    const participant = await this.findPlayerParticipantForTournament(session, tournament);
    if (!participant) throw new Error("Player not registered in this imported tournament");
    await this.ladderService.reportDetailedResult(
      tournamentId,
      ladderMatchId,
      input.games.map((game) => ({
        winnerParticipantId: game.winnerParticipantId,
        selections: game.selections,
      })),
      { bestOfOverride: input.bestOfOverride, reporterParticipantId: participant.id },
    );
    return this.getMyTournament(sessionToken, tournamentId);
  }

  private async requireSession(sessionToken: string): Promise<PlayerSessionContext> {
    if (!sessionToken.trim()) {
      throw new Error("Player session required");
    }

    const session = await this.playerRepository.findSessionByTokenHash(hashToken(sessionToken));
    if (!session) {
      throw new Error("Player session not found");
    }

    const account = await this.playerRepository.findAccountById(session.accountId);
    if (!account) {
      throw new Error("Player account not found");
    }

    let currentAccount = account;
    if (new Date(account.tokenExpiresAt).getTime() <= Date.now() + 60_000) {
      currentAccount = await this.refreshAccount(account.id);
    }

    await this.playerRepository.touchSession(session.id);
    return {
      sessionId: session.id,
      sessionToken,
      account: currentAccount,
      identity: {
        userId: currentAccount.startggUserId,
        playerId: currentAccount.startggPlayerId,
        gamerTag: currentAccount.gamerTag,
        displayName: currentAccount.displayName,
      },
    };
  }

  private async refreshAccount(accountId: string): Promise<PlayerAccountRecord> {
    const pending = this.accountRefreshes.get(accountId);
    if (pending) return pending;
    const refresh = (async () => {
      // Another request may already have saved a renewed token since our first read.
      const account = await this.playerRepository.findAccountById(accountId);
      if (!account) throw new Error("Player account not found");
      if (new Date(account.tokenExpiresAt).getTime() > Date.now() + 60_000) return account;
      const refreshed = await this.startggOAuthClient.refreshAccessToken(account.refreshToken, this.oauthCallbackUrl());
      return this.playerRepository.saveAccount({
        ...account,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        scope: refreshed.scope,
        tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      });
    })();
    this.accountRefreshes.set(accountId, refresh);
    try { return await refresh; }
    finally { this.accountRefreshes.delete(accountId); }
  }

  private async buildTournamentViewForSession(
    session: PlayerSessionContext,
    tournament: Tournament,
  ): Promise<PlayerTournamentView | undefined> {
    const participant = await this.findPlayerParticipantForTournament(session, tournament);
    if (!participant) {
      return undefined;
    }
    await this.playerRepository.upsertTournamentBinding({
      accountId: session.account.id,
      tournamentId: tournament.id,
      participantId: participant.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const matches = withBracketLabels(await this.tournamentsRepository.listMatches(tournament.id), tournament.settings.format);
    const myMatches = matches
      .filter((match) => match.participants.some((item) => item.participantId === participant.id))
      .filter((match) => this.hasRealOpponent(match));

    const mapped = myMatches
      .map((match) => this.mapPlayerMatchView(tournament, match, participant.id))
      .filter((item): item is PlayerMatchView => item !== undefined);

    const ladderOverview = await this.ladderService.getOverview(tournament.id);

    return {
      tournamentId: tournament.id,
      title: tournament.title,
      callTimeoutMinutes: tournament.settings.callTimeoutMinutes,
      gameTitle: tournament.gameTitle,
      status: tournament.status,
      startsAt: String(tournament.startsAt ?? ""),
      myParticipantId: participant.id,
      myDisplayName: participant.displayName,
      pendingMatches: mapped.filter((item) => item.status === "PENDING"),
      activeMatches: mapped.filter((item) =>
        item.status !== "PENDING" &&
        item.status !== "COMPLETED" &&
        item.status !== "WALKOVER" &&
        item.status !== "CANCELLED"
      ),
      completedMatches: mapped.filter((item) => item.status === "COMPLETED" || item.status === "WALKOVER"),
      bracketMatches: matches.map((match) => this.mapPlayerBracketMatchView(tournament, match)),
      ladder: this.mapPlayerLadderView(tournament, ladderOverview, participant.id),
    };
  }

  private async ensurePlayerCanOperateMatch(
    session: PlayerSessionContext,
    tournamentId: string,
    matchId: string,
  ): Promise<{ tournament: Tournament; match: Match; participant: TournamentParticipant }> {
    const tournament = await this.tournamentsRepository.getTournament(tournamentId);
    if (!tournament || tournament.importSource?.provider !== "START_GG") {
      throw new Error("Tournament not available");
    }
    if (!this.isPlayerTournamentReportingEnabled(tournament)) {
      throw new Error("The organizer has disabled player match reporting for this tournament");
    }

    const participant = await this.findPlayerParticipantForTournament(session, tournament);
    if (!participant) {
      throw new Error("Player not registered in this imported tournament");
    }

    const matches = withBracketLabels(await this.tournamentsRepository.listMatches(tournamentId), tournament.settings.format);
    const match = matches.find((item) => item.id === matchId);
    if (!match) {
      throw new Error("Match not found");
    }
    if (!match.participants.some((item) => item.participantId === participant.id)) {
      throw new Error("This match does not belong to the current player");
    }
    if (!this.hasRealOpponent(match)) {
      throw new Error("The match is not ready to be played yet");
    }

    return { tournament, match, participant };
  }

  private async findPlayerParticipantForTournament(
    session: PlayerSessionContext,
    tournament: Tournament,
  ): Promise<TournamentParticipant | undefined> {
    if (tournament.importSource?.provider !== "START_GG") {
      return undefined;
    }
    const participants = await this.tournamentsRepository.listParticipants(tournament.id);
    const cacheKey = `${session.account.id}:${tournament.id}:${tournament.importSource.eventId}`;
    const cached = this.entrantCache.get(cacheKey);
    let entrantId = cached && cached.expiresAt > Date.now() ? cached.entrantId : undefined;

    if (!cached || cached.expiresAt <= Date.now()) {
      const entrant = await this.startggOAuthClient.findEntrantForEvent(
        session.account.accessToken,
        tournament.importSource.eventId,
        session.identity,
      );
      entrantId = entrant.entrantId;
      this.entrantCache.set(cacheKey, {
        entrantId,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
    }

    if (entrantId) {
      const byEntrantId = participants.find((item) => item.externalRef?.provider === "START_GG" && item.externalRef.entrantId === entrantId);
      if (byEntrantId) {
        return byEntrantId;
      }
    }

    // Discard stale push recipients only after a successful membership lookup.
    // A temporary start.gg error throws above and preserves the verified binding.
    await this.playerRepository.deleteTournamentBinding(session.account.id, tournament.id);
    return undefined;
  }

  private async refreshParticipantBindings(session: PlayerSessionContext): Promise<void> {
    const tournaments = await this.tournamentsRepository.listTournaments();
    const imported = tournaments.filter((item) => item.importSource?.provider === "START_GG" && item.status !== 'ARCHIVED');
    const now = new Date().toISOString();
    for (const tournament of imported) {
      const participant = await this.findPlayerParticipantForTournament(session, tournament);
      if (!participant) {
        continue;
      }
      await this.playerRepository.upsertTournamentBinding({
        accountId: session.account.id,
        tournamentId: tournament.id,
        participantId: participant.id,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  private hasRealOpponent(match: Match): boolean {
    return match.participants.filter((item) => isRealParticipantId(item.participantId)).length === 2;
  }

  private mapPlayerMatchView(tournament: Tournament, match: Match, myParticipantId: string): PlayerMatchView | undefined {
    const me = match.participants.find((item) => item.participantId === myParticipantId);
    const opponent = match.participants.find((item) => item.participantId !== myParticipantId && isRealParticipantId(item.participantId));
    if (!me || !opponent) {
      return undefined;
    }

    const calledAt = match.call?.calledAt;
    const startedAt = match.call?.startedAt;
    const callTimeoutSeconds = calledAt && !startedAt
      ? Math.max(0, Math.floor((new Date(calledAt).getTime() + tournament.settings.callTimeoutMinutes * 60_000 - Date.now()) / 1000))
      : undefined;

    return {
      id: match.id,
      tournamentId: tournament.id,
      tournamentTitle: tournament.title,
      entrantSize: tournament.importSource?.entrantSize ?? 1,
      gameTitle: tournament.gameTitle,
      tournamentStatus: tournament.status,
      startsAt: tournament.startsAt,
      roundLabel: this.buildPlayerRoundLabel(match),
      bracketStage: match.bracketStage,
      status: match.status,
      bestOf: match.bestOf,
      reportedBestOf: match.reportedBestOf,
      stationLabel: this.buildPlayerStationLabel(tournament, match),
      calledAt,
      startedAt,
      callTimeoutSeconds,
      myParticipantId: me.participantId,
      mySlot: me.slot,
      myDisplayName: me.displayName,
      myScore: me.score,
      opponentParticipantId: opponent.participantId,
      opponentSlot: opponent.slot,
      opponentDisplayName: opponent.displayName,
      opponentScore: opponent.score,
      winnerParticipantId: match.winnerParticipantId,
      canPlayerReportMatch: this.isPlayerTournamentReportingEnabled(tournament),
      canReportCharacters: this.supportsCharacterReporting(tournament),
      characterSelections: match.characterSelections,
      gameCharacterSelections: match.gameCharacterSelections,
      gameResults: match.gameResults,
    };
  }

  private mapPlayerBracketMatchView(tournament: Tournament, match: Match): PlayerBracketMatchView {
    const calledAt = match.call?.calledAt;
    const startedAt = match.call?.startedAt;
    const callTimeoutSeconds = calledAt && !startedAt
      ? Math.max(0, Math.floor((new Date(calledAt).getTime() + tournament.settings.callTimeoutMinutes * 60_000 - Date.now()) / 1000))
      : undefined;
    return {
      id: match.id,
      tournamentId: tournament.id,
      bracketStage: match.bracketStage,
      roundNumber: match.roundNumber,
      matchNumber: match.matchNumber,
      label: this.buildPlayerRoundLabel(match),
      status: match.status,
      bestOf: match.bestOf,
      reportedBestOf: match.reportedBestOf,
      advancersRequired: match.advancersRequired,
      participants: match.participants.map((participant) => ({
        participantId: participant.participantId,
        displayName: participant.displayName,
        slot: participant.slot,
        score: participant.score,
      })),
      advancingParticipantIds: [...(match.advancingParticipantIds ?? [])],
      winnerParticipantId: match.winnerParticipantId,
      stationLabel: this.buildPlayerStationLabel(tournament, match),
      calledAt,
      startedAt,
      callTimeoutSeconds,
      characterSelections: match.characterSelections,
      gameCharacterSelections: match.gameCharacterSelections,
      gameResults: match.gameResults,
      phaseId: match.externalRef?.phaseId,
      phaseName: match.externalRef?.phaseName,
      phaseOrder: match.externalRef?.phaseOrder,
      phaseGroupId: match.externalRef?.phaseGroupId,
      phaseGroupName: match.externalRef?.phaseGroupName,
      phaseType: match.externalRef?.phaseType,
      isPoolPhase: match.externalRef?.isPoolPhase ?? (match.bracketStage === "POOLS"),
      fullRoundText: match.externalRef?.fullRoundText ?? match.roundLabel,
      displayIdentifier: match.displayIdentifier ?? match.externalRef?.identifier,
      startggStreamLabel: match.externalRef?.stream ? `Stream start.gg: ${match.externalRef.stream.name}` : undefined,
    };
  }

  private buildPlayerRoundLabel(match: Match): string {
    const baseLabel = match.displayLabel ?? `${match.externalRef?.identifier ?? `M${match.matchNumber}`} · ${match.externalRef?.fullRoundText ?? match.roundLabel ?? `Ronda ${match.roundNumber}`}`;
    const poolLabel = match.externalRef?.phaseGroupName?.trim()
      || match.externalRef?.phaseName?.trim();
    return poolLabel ? `${poolLabel} · ${baseLabel}` : baseLabel;
  }

  private buildPlayerStationLabel(tournament: Tournament, match: Match): string | undefined {
    const setupLabel = match.call?.stationLabel?.trim();
    const playAreaName = tournament.settings.playAreaName?.trim();
    return [setupLabel, playAreaName].filter((value): value is string => Boolean(value)).join(" · ") || undefined;
  }

  private requirePlayerMatchView(tournament: Tournament, match: Match, myParticipantId: string): PlayerMatchView {
    const view = this.mapPlayerMatchView(tournament, match, myParticipantId);
    if (!view) {
      throw new Error("The match is no longer available for this player");
    }
    return view;
  }

  private oauthCallbackUrl(): string {
    const baseUrl = this.publicBaseUrl?.trim();
    if (!baseUrl) {
      throw new Error("PUBLIC_BASE_URL is required for start.gg player OAuth");
    }
    return new URL(this.oauthCallbackPath, ensureTrailingSlash(baseUrl)).toString();
  }

  private supportsCharacterReporting(tournament: Tournament): boolean {
    return tournament.importSource?.provider === "START_GG"
      && /smash|ultimate|rivals|roa2/i.test(tournament.gameTitle);
  }

  private isPlayerTournamentReportingEnabled(tournament: Tournament): boolean {
    return tournament.settings.playerMatchReportingEnabled !== false;
  }

  private mapPlayerLadderView(
    tournament: Tournament,
    overview: LadderOverview,
    participantId: string,
  ): PlayerLadderView | undefined {
    if (!overview.session) {
      return undefined;
    }
    const queueEntry = overview.queue.find((entry) => entry.participantId === participantId);
    const readyCheckMatch = overview.activeMatches.find((match) =>
      match.status === "READY_CHECK" && match.participants.some((item) => item.participantId === participantId));
    const activeMatch = overview.activeMatches.find((match) =>
      ["PLAYING", "SUSPENDED", "AWAITING_CONFIRMATION", "DISPUTED"].includes(match.status) && match.participants.some((item) => item.participantId === participantId));
    const history = overview.completedMatches
      .filter((match) => match.participants.some((item) => item.participantId === participantId))
      .map((match) => this.mapLadderMatchView(tournament, match, participantId))
      .filter((item): item is PlayerMatchView => item !== undefined);

    return {
      status: overview.session.status,
      options: overview.session.options, waitingReason: queueEntry?.waitingReason, queuePosition: queueEntry ? overview.queue.indexOf(queueEntry)+1 : undefined, serverTime: overview.serverTime,
      canJoin: overview.session.status === "ACTIVE" && !overview.session.options?.closing && !overview.session.options?.excludedParticipantIds?.includes(participantId),
      queuedAt: queueEntry?.queuedAt,
      readyCheckMatch: readyCheckMatch ? this.mapLadderMatchView(tournament, readyCheckMatch, participantId) : undefined,
      activeMatch: activeMatch ? this.mapLadderMatchView(tournament, activeMatch, participantId) : undefined,
      history,
      standings: overview.standings.map((standing) => ({
        participantId: standing.participantId,
        displayName: standing.displayName,
        matchesPlayed: standing.matchesPlayed,
        wins: standing.wins,
        losses: standing.losses,
        gamesWon: standing.gamesWon,
        gamesLost: standing.gamesLost,
        gameDifferential: standing.gameDifferential,
        rating: standing.rating, eligible: standing.eligible, winRate: standing.winRate,
      })),
    };
  }

  private mapLadderMatchView(
    tournament: Tournament,
    match: LadderOverview["activeMatches"][number],
    myParticipantId: string,
  ): PlayerMatchView | undefined {
    const me = match.participants.find((item) => item.participantId === myParticipantId);
    const opponent = match.participants.find((item) => item.participantId !== myParticipantId);
    if (!me || !opponent) {
      return undefined;
    }
    const readyDeadlineAt = match.readyDeadlineAt;
    const callTimeoutSeconds = readyDeadlineAt && match.status === "READY_CHECK"
      ? Math.max(0, Math.floor((new Date(readyDeadlineAt).getTime() - Date.now()) / 1000))
      : undefined;
    return {
      id: match.id,
      tournamentId: tournament.id,
      tournamentTitle: tournament.title,
      entrantSize: tournament.importSource?.entrantSize ?? 1,
      gameTitle: tournament.gameTitle,
      tournamentStatus: tournament.status,
      startsAt: tournament.startsAt,
      roundLabel: `Ladder Bo${match.bestOf}`,
      ladderRevision: match.details?.revision,
      canReviewLadderResult: match.status === "AWAITING_CONFIRMATION" && match.details?.reportedByParticipantId !== myParticipantId,
      ladderMessage: match.details?.suspensionReason ?? match.details?.disputeReason ?? match.details?.cancellationReason,
      bracketStage: "LADDER",
      status: match.status,
      bestOf: match.bestOf,
      stationLabel: match.stationLabel,
      calledAt: match.readyDeadlineAt,
      startedAt: match.startedAt,
      callTimeoutSeconds,
      readyDeadlineAt,
      participantOneReadyAt: match.participantOneReadyAt,
      participantTwoReadyAt: match.participantTwoReadyAt,
      myParticipantId: me.participantId,
      mySlot: me.slot,
      myDisplayName: me.displayName,
      myScore: me.score,
      opponentParticipantId: opponent.participantId,
      opponentSlot: opponent.slot,
      opponentDisplayName: opponent.displayName,
      opponentScore: opponent.score,
      winnerParticipantId: match.winnerParticipantId,
      canPlayerReportMatch: match.status === "PLAYING",
      canReportCharacters: this.supportsCharacterReporting(tournament),
      characterSelections: match.characterSelections,
      gameCharacterSelections: match.gameCharacterSelections,
      gameResults: match.gameResults,
    };
  }
}

function hashToken(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomToken(length: number): string {
  return crypto.randomBytes(length).toString("base64url");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isRealParticipantId(id: string): boolean {
  return Boolean(id.trim()) && !/^(?:(?:winner|loser)_of_|(?:advance|drop)_\d+_of_)/.test(id);
}
