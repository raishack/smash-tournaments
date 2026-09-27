export type TournamentFormat =
  | "SINGLE_ELIMINATION"
  | "DOUBLE_ELIMINATION"
  | "ROUND_ROBIN"
  | "SWISS"
  | "GROUPS_PLAYOFF";

export type TournamentStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "CHECK_IN"
  | "READY"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "ARCHIVED"
  | "CANCELLED";

export type MatchStatus =
  | "PENDING"
  | "CALLED"
  | "CHECKED_IN"
  | "PLAYING"
  | "RESULT_REPORTED"
  | "UNDER_REVIEW"
  | "COMPLETED"
  | "WALKOVER"
  | "CANCELLED";

export type MatchBracketStage =
  | "POOLS"
  | "WINNERS"
  | "LOSERS"
  | "FINALS";

export type BracketMode =
  | "STANDARD"
  | "FORTNITE"
  | "MKART";

export type SeedingMethod =
  | "MANUAL"
  | "RANDOM"
  | "RANKING"
  | "PREVIOUS_RESULTS";

export type TournamentImportProvider = "START_GG";

export interface TournamentImportSource {
  provider: TournamentImportProvider;
  eventId: string;
  phaseId: string;
  phaseGroupId?: string;
  eventSlug: string;
  eventUrl: string;
  entrantSize?: number;
  hasPools?: boolean;
  syncResults: boolean;
  importedAt: string;
}

export interface TournamentParticipantExternalRef {
  provider: TournamentImportProvider;
  entrantId: string;
  seedNum?: number;
}

export interface StartggStreamInfo {
  id: string;
  name: string;
  source?: string;
}

export interface MatchExternalRef {
  /** Informational start.gg assignment, independent of the local match call. */
  stream?: StartggStreamInfo;
  provider: TournamentImportProvider;
  setId: string;
  identifier?: string;
  hasPlaceholder?: boolean;
  isPoolPhase?: boolean;
  localSyncVersion?: number;
  syncedSyncVersion?: number;
  resultSyncedAt?: string;
  phaseId: string;
  phaseGroupId?: string;
  phaseName?: string;
  phaseOrder?: number;
  phaseGroupName?: string;
  phaseType?: string;
  entrantSize?: number;
  fullRoundText?: string;
  entrantIds?: string[];
}

export interface MatchCharacterSelection {
  participantId: string;
  characterId: number;
  characterName: string;
}

export interface MatchGameCharacterSelections {
  gameNum: number;
  selections: MatchCharacterSelection[];
}

export interface TournamentSettings {
  fortniteLobbySize?: number;
  fortniteGamesPerRound?: number;
  /** Local team tournaments: maxParticipants counts teams, not roster members. */
  teamSize?: number;
  reserveCount?: number;
  allowSoloRegistration?: boolean;
  /** Local MAIN tournaments only; missing preserves existing display visibility. */
  displayEnabled?: boolean;
  registrationEnabled?: boolean;
  registrationClosesAt?: string | null;
  registrationWaitlist?: boolean;
  registrationUrl?: string;
  importJob?: {
    progress?: { stage: string; message: string; completed?: number; total?: number };
    state: "RUNNING" | "COMPLETED" | "FAILED";
    eventUrl: string;
    syncResults: boolean;
    preserveTournamentTitle: boolean;
    updatedAt: string;
    error?: string;
  };
  format: TournamentFormat;
  bracketMode?: BracketMode;
  mkartAdvanceCount?: 1 | 2;
  mkartLosersAdvanceCount?: 1 | 2;
  setupCount?: number;
  /** Additional stream stations (0, 1 or 2); omitted means disabled. */
  streamCount?: number;
  playAreaName?: string;
  bestOf: number;
  winnersBestOf?: number;
  losersBestOf?: number;
  hasThirdPlaceMatch: boolean;
  checkInRequired: boolean;
  allowRematchReview: boolean;
  seedingMethod: SeedingMethod;
  autoCallMatches: boolean;
  callTimeoutMinutes: number;
  autoDisqualifyAfterMinutes?: number;
  manualSeedingLocked: boolean;
  playerMatchReportingEnabled?: boolean;
}

export interface Tournament {
  /** List summary only; calculated from participants, never a client setting. */
  registeredParticipants?: number;
  id: string;
  ownerId: string;
  title: string;
  gameTitle: string;
  description: string;
  platform: string;
  status: TournamentStatus;
  startsAt: string;
  maxParticipants: number;
  isPublic: boolean;
  settings: TournamentSettings;
  importSource?: TournamentImportSource;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentParticipant {
  id: string;
  tournamentId: string;
  userId?: string;
  displayName: string;
  seed?: number;
  checkedIn: boolean;
  status: "ACTIVE" | "ELIMINATED" | "DISQUALIFIED";
  externalRef?: TournamentParticipantExternalRef;
  createdAt: string;
}

export interface MatchParticipant {
  id: string;
  participantId: string;
  displayName: string;
  slot: number;
  score: number;
}

export interface MatchCall {
  calledAt: string;
  calledByUserId: string;
  stationLabel?: string;
  startedAt?: string;
  startedByUserId?: string;
}

export interface Match {
  startggStreamLabel?: string;
  operationRevision?: string;
  syncStatus?: { state: string; message: string; updatedAt?: string; error?: string; canRetry?: boolean };
  displayIdentifier?: string;
  displayLabel?: string;
  roundLabel?: string;
  id: string;
  tournamentId: string;
  bracketStage: MatchBracketStage;
  roundNumber: number;
  matchNumber: number;
  status: MatchStatus;
  bestOf: number;
  reportedBestOf?: number;
  advancersRequired: number;
  participants: MatchParticipant[];
  gameResults?: string[];
  characterSelections?: MatchCharacterSelection[];
  gameCharacterSelections?: MatchGameCharacterSelections[];
  advancingParticipantIds?: string[];
  winnerParticipantId?: string;
  externalRef?: MatchExternalRef;
  call?: MatchCall;
  createdAt: string;
  updatedAt: string;
}
