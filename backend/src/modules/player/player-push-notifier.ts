import { existsSync, readFileSync } from "node:fs";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import type { Match, Tournament } from "../../shared/types.js";
import type { TournamentNotifier } from "../tournaments/tournament-notifier.js";
import type { LadderMatch, LadderStanding } from "../ladder/ladder.types.js";
import { PlayerPostgresRepository } from "./player.postgres-repository.js";

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

const PLAYER_PUSH_APP_NAME = "gestor-torneos-smash-player-push";
const MATCH_CALLS_CHANNEL_ID = "match_calls";

export class PlayerPushNotifier implements TournamentNotifier {
  private readonly messaging?: Messaging;

  constructor(
    private readonly playerRepository: PlayerPostgresRepository,
    config: {
      serviceAccountPath?: string;
      serviceAccountJson?: string;
    },
  ) {
    const serviceAccount = loadFirebaseServiceAccount(config.serviceAccountJson, config.serviceAccountPath);
    if (!serviceAccount) {
      return;
    }
    const credential: ServiceAccount = {
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    };
    const app = getApps().find((item) => item.name === PLAYER_PUSH_APP_NAME)
      ?? initializeApp({
        credential: cert(credential),
      }, PLAYER_PUSH_APP_NAME);
    this.messaging = getMessaging(app);
  }

  async notifyMatchCalled(tournament: Tournament, match: Match): Promise<void> {
    if (!this.messaging) {
      return;
    }

    const participantIds = match.participants
      .map((participant) => participant.participantId)
      .filter((participantId) => !participantId.startsWith("winner_of_"));
    const accountIds = await this.playerRepository.listAccountIdsByTournamentParticipants(tournament.id, participantIds);
    if (accountIds.length === 0) {
      return;
    }
    const pushTokens = await this.playerRepository.listPushTokensForAccounts(accountIds);
    if (pushTokens.length === 0) {
      return;
    }

    const roundLabel = this.buildPlayerRoundLabel(match);
    const setupLabel = match.call?.stationLabel?.trim() || "";
    const playAreaName = tournament.settings.playAreaName?.trim() || "";
    const stationLabel = [setupLabel, playAreaName].filter(Boolean).join(" · ");
    const body = stationLabel
      ? `Your turn to play. ${roundLabel}. Station ${stationLabel}.`
      : `Your turn to play. ${roundLabel}.`;

    const response = await this.messaging.sendEachForMulticast({
      tokens: pushTokens.map((token) => token.token),
      notification: {
        title: tournament.title,
        body,
      },
      data: {
        type: "MATCH_CALLED",
        matchId: match.id,
        tournamentId: tournament.id,
        tournamentTitle: tournament.title,
        roundLabel,
        stationLabel,
        calledAt: match.call?.calledAt ?? "",
      },
      android: {
        priority: "high",
        notification: {
          channelId: MATCH_CALLS_CHANNEL_ID,
          sound: "default",
          defaultVibrateTimings: true,
          tag: match.id,
        },
      },
    });

    await Promise.all(response.responses.map(async (item, index) => {
      if (item.success) {
        return;
      }
      const code = item.error?.code ?? "";
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        await this.playerRepository.deletePushToken(pushTokens[index]?.token ?? "");
      }
    }));
  }

  async notifyLadderMatchFound(tournament: Tournament, match: LadderMatch): Promise<void> {
    if (!this.messaging) {
      return;
    }

    const participantIds = match.participants.map((participant) => participant.participantId);
    const accountIds = await this.playerRepository.listAccountIdsByTournamentParticipants(tournament.id, participantIds);
    if (accountIds.length === 0) {
      return;
    }
    const pushTokens = await this.playerRepository.listPushTokensForAccounts(accountIds);
    if (pushTokens.length === 0) {
      return;
    }

    const body = `Bo${match.bestOf} ladder match${match.stationLabel ? " · " + match.stationLabel : ""}. Open the app and confirm you are ready.`;

    const response = await this.messaging.sendEachForMulticast({
      tokens: pushTokens.map((token) => token.token),
      notification: {
        title: tournament.title,
        body,
      },
      data: {
        type: "LADDER_MATCH_FOUND",
        matchId: match.id,
        tournamentId: tournament.id,
        tournamentTitle: tournament.title,
        readyDeadlineAt: match.readyDeadlineAt ?? "",
      },
      android: {
        priority: "high",
        notification: {
          channelId: MATCH_CALLS_CHANNEL_ID,
          sound: "default",
          defaultVibrateTimings: true,
          tag: `ladder_${match.id}`,
        },
      },
    });

    await Promise.all(response.responses.map(async (item, index) => {
      if (item.success) {
        return;
      }
      const code = item.error?.code ?? "";
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        await this.playerRepository.deletePushToken(pushTokens[index]?.token ?? "");
      }
    }));
  }

  async notifyTournamentStarted(): Promise<void> {}
  async notifyGameWin(): Promise<void> {}
  async notifyMatchResolved(): Promise<void> {}
  async notifyRoundCompleted(): Promise<void> {}
  async notifyTournamentCompleted(): Promise<void> {}
  async notifyLadderCompleted(_tournament: Tournament, _matches: Match[], _winnerName: string, _standings: LadderStanding[]): Promise<void> {}

  private buildPlayerRoundLabel(match: Match): string {
    const baseLabel = `Round ${match.roundNumber} · Set ${match.matchNumber}`;
    const poolLabel = match.externalRef?.phaseGroupName?.trim()
      || match.externalRef?.phaseName?.trim();
    return poolLabel ? `${poolLabel} · ${baseLabel}` : baseLabel;
  }
}

function loadFirebaseServiceAccount(serviceAccountJson?: string, serviceAccountPath?: string): FirebaseServiceAccount | undefined {
  const inlineJson = serviceAccountJson?.trim();
  if (inlineJson) {
    return JSON.parse(inlineJson) as FirebaseServiceAccount;
  }

  const resolvedPath = serviceAccountPath?.trim();
  if (!resolvedPath || !existsSync(resolvedPath)) {
    return undefined;
  }

  return JSON.parse(readFileSync(resolvedPath, "utf8")) as FirebaseServiceAccount;
}
