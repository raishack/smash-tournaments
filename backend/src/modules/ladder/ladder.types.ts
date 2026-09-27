import type {
  MatchCharacterSelection,
  MatchGameCharacterSelections,
  MatchParticipant,
  Tournament,
} from "../../shared/types.js";

export type LadderSessionStatus = "ACTIVE" | "COMPLETED";

export type LadderMatchStatus =
  | "READY_CHECK"
  | "PLAYING"
  | "SUSPENDED"
  | "AWAITING_CONFIRMATION"
  | "DISPUTED"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export interface LadderSession {
  id: string;
  tournamentId: string;
  status: LadderSessionStatus;
  createdAt: string;
  startedAt: string;
  completedAt?: string;
  completedByUserId?: string;
  options?: LadderSessionOptions;
}

export interface LadderSettings {
  mode: "CASUAL" | "COMPETITIVE";
  bestOf: 1 | 3 | 5;
  readySeconds: number;
  rematchWaitSeconds: number;
  minimumSets: number;
  requireConfirmation: boolean;
  setupNumbers: number[];
  opensAt?: string;
  closesAt?: string;
}

export interface LadderSessionOptions {
  settings: LadderSettings;
  paused?: boolean;
  closing?: boolean;
  excludedParticipantIds?: string[];
  startedByUserId?: string;
  revision?: string;
}

export interface LadderMatchDetails {
  stationNumber?: number;
  queueEnteredAt?: Record<string, string>;
  revision?: string;
  reportedByParticipantId?: string;
  reportedAt?: string;
  confirmedByParticipantId?: string;
  disputeReason?: string;
  suspensionReason?: string;
  previousStatus?: "READY_CHECK" | "PLAYING";
  absenceParticipantIds?: string[];
  cancellationReason?: string;
}

export interface LadderActivity {
  id: string;
  createdAt: string;
  actor: string;
  action: string;
  matchId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export interface LadderQueueEntry {
  id: string;
  ladderSessionId: string;
  tournamentId: string;
  participantId: string;
  displayName: string;
  queuedAt: string;
  createdAt: string;
  updatedAt: string;
  waitingReason?: string;
}

export interface LadderMatch {
  id: string;
  ladderSessionId: string;
  tournamentId: string;
  status: LadderMatchStatus;
  bestOf: number;
  participants: MatchParticipant[];
  readyDeadlineAt?: string;
  participantOneReadyAt?: string;
  participantTwoReadyAt?: string;
  winnerParticipantId?: string;
  gameResults?: string[];
  characterSelections?: MatchCharacterSelection[];
  gameCharacterSelections?: MatchGameCharacterSelections[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledByParticipantId?: string;
  updatedAt: string;
  details?: LadderMatchDetails;
  stationLabel?: string;
}

export interface LadderStanding {
  participantId: string;
  displayName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gameDifferential: number;
  rankingMode?: "CASUAL" | "COMPETITIVE";
  rating?: number;
  eligible?: boolean;
  winRate?: number;
}

export interface LadderOverview {
  session?: LadderSession;
  queue: LadderQueueEntry[];
  activeMatches: LadderMatch[];
  completedMatches: LadderMatch[];
  standings: LadderStanding[];
  activity?: LadderActivity[];
  serverTime?: string;
}

export interface LadderNotificationSummary {
  tournament: Tournament;
  standings: LadderStanding[];
}
