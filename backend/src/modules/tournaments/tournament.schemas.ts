import { z } from "zod";

const tournamentSettingsSchema = z.object({
  fortniteLobbySize: z.number().int().min(5).max(100).multipleOf(5).optional(),
  fortniteGamesPerRound: z.number().int().min(1).max(20).optional(),
  teamSize: z.number().int().min(1).max(20).optional(),
  reserveCount: z.number().int().min(0).max(20).optional(),
  allowSoloRegistration: z.boolean().optional(),
  format: z.enum([
    "SINGLE_ELIMINATION",
    "DOUBLE_ELIMINATION",
    "ROUND_ROBIN",
    "SWISS",
    "GROUPS_PLAYOFF",
  ]),
  bracketMode: z.enum(["STANDARD", "MKART", "FORTNITE"]).optional(),
  mkartAdvanceCount: z.union([z.literal(1), z.literal(2)]).optional(),
  mkartLosersAdvanceCount: z.union([z.literal(1), z.literal(2)]).optional(),
  setupCount: z.number().int().min(1).max(256).optional(),
  streamCount: z.number().int().min(0).max(2).optional(),
  playAreaName: z.string().max(80).optional(),
  bestOf: z.number().int().min(1).max(9),
  winnersBestOf: z.number().int().min(1).max(9).optional(),
  losersBestOf: z.number().int().min(1).max(9).optional(),
  hasThirdPlaceMatch: z.boolean(),
  checkInRequired: z.boolean(),
  allowRematchReview: z.boolean(),
  seedingMethod: z.enum(["MANUAL", "RANDOM", "RANKING", "PREVIOUS_RESULTS"]),
  autoCallMatches: z.boolean(),
  callTimeoutMinutes: z.number().int().min(1).max(240),
  autoDisqualifyAfterMinutes: z.number().int().min(1).max(240).optional(),
  manualSeedingLocked: z.boolean(),
  playerMatchReportingEnabled: z.boolean().optional(),
});

export const createTournamentSchema = z.object({
  ownerId: z.string().min(1),
  title: z.string().min(3).max(120),
  gameTitle: z.string().min(2).max(120),
  description: z.string().min(3).max(1000),
  platform: z.string().min(2).max(60),
  startsAt: z.string().datetime(),
  maxParticipants: z.number().int().min(2).max(2048),
  isPublic: z.boolean().default(true),
  settings: tournamentSettingsSchema,
});

export const createParticipantSchema = z.object({
  userId: z.string().optional(),
  displayName: z.string().min(2).max(80),
  seed: z.number().int().min(1).max(2048).optional(),
});

export const updateTournamentSchema = z.object({
  title: z.string().min(3).max(120),
  gameTitle: z.string().min(2).max(120),
  description: z.string().min(3).max(1000),
  platform: z.string().min(2).max(60),
  maxParticipants: z.number().int().min(2).max(2048),
  settings: tournamentSettingsSchema,
});

export const updateParticipantSchema = z.object({
  displayName: z.string().min(2).max(80),
  seed: z.number().int().min(1).max(2048).nullable().optional(),
  clearSeed: z.boolean().optional(),
  checkedIn: z.boolean().optional(),
  status: z.enum(["ACTIVE", "ELIMINATED", "DISQUALIFIED"]).optional(),
});

export const deleteParticipantSchema = z.object({});
export const resetTournamentSchema = z.object({});
export const updateSetupsSchema = z.object({ setupCount: z.number().int().min(1).max(256), streamCount: z.number().int().min(0).max(2).optional() });
export const startTournamentSchema = z.object({});
export const startLadderSchema = z.object({
  startedByUserId: z.string().min(1),
});
export const finalizeLadderSchema = z.object({
  completedByUserId: z.string().min(1),
});
export const deleteTournamentSchema = z.object({});
export const startggPreviewSchema = z.object({
  eventUrl: z.string().url(),
});
export const importStartggEventSchema = z.object({
  eventUrl: z.string().url(),
  syncResults: z.boolean().default(true),
  preserveTournamentTitle: z.boolean().default(false),
});

export const createStartggImportSchema = importStartggEventSchema.extend({
  eventUrl: z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && /^(www\.)?(start|smash)\.gg$/.test(url.hostname)
      && url.pathname.includes("/event/");
  }, "Enter a start.gg event URL"),
  setupCount: z.number().int().min(1).max(256).default(1),
  streamCount: z.number().int().min(0).max(2).default(0),
  callTimeoutMinutes: z.number().int().min(1).max(240).default(10),
  playerMatchReportingEnabled: z.boolean().default(true),
});

export const callMatchSchema = z.object({
  calledByUserId: z.string().min(1),
  stationLabel: z.string().max(40).optional(),
});

export const startMatchSchema = z.object({
  startedByUserId: z.string().min(1),
});

export const updateMatchCharactersSchema = z.object({
  selections: z.array(z.object({
    participantId: z.string().min(1),
    characterName: z.string().min(1).max(640),
  })).max(2),
});

export const recordGameWinSchema = z.object({
  participantId: z.string().min(1),
});

export const selectMkAdvancerSchema = z.object({
  participantId: z.string().min(1),
});

export const resolveAbsenceSchema = z.object({
  outcome: z.enum(["NONE_PRESENT", "SLOT_1_ABSENT", "SLOT_2_ABSENT"]),
});

export const resetMatchSchema = z.object({});

export const reportResultSchema = z.object({
  winnerParticipantId: z.string().min(1),
  scores: z.array(
    z.object({
      participantId: z.string().min(1),
      score: z.number().int().min(0).max(99),
    }),
  ),
});

const reportDetailedResultSelectionSchema = z.object({
  participantId: z.string().min(1),
  characterName: z.string().min(1).max(640),
});

const reportDetailedResultGameSchema = z.object({
  winnerParticipantId: z.string().min(1),
  selections: z.array(reportDetailedResultSelectionSchema).max(2).optional(),
});

export const reportDetailedResultSchema = z.object({
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  bestOfOverride: z.union([z.literal(1), z.literal(3), z.literal(5)]).optional(),
  games: z.array(reportDetailedResultGameSchema).min(1).max(9),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type CreateParticipantInput = z.infer<typeof createParticipantSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
export type UpdateParticipantInput = z.infer<typeof updateParticipantSchema>;
export type DeleteParticipantInput = z.infer<typeof deleteParticipantSchema>;
export type ResetTournamentInput = z.infer<typeof resetTournamentSchema>;
export type StartTournamentInput = z.infer<typeof startTournamentSchema>;
export type StartLadderInput = z.infer<typeof startLadderSchema>;
export type FinalizeLadderInput = z.infer<typeof finalizeLadderSchema>;
export type DeleteTournamentInput = z.infer<typeof deleteTournamentSchema>;
export type StartggPreviewInput = z.infer<typeof startggPreviewSchema>;
export type ImportStartggEventInput = z.infer<typeof importStartggEventSchema>;
export type CallMatchInput = z.infer<typeof callMatchSchema>;
export type StartMatchInput = z.infer<typeof startMatchSchema>;
export type UpdateMatchCharactersInput = z.infer<typeof updateMatchCharactersSchema>;
export type RecordGameWinInput = z.infer<typeof recordGameWinSchema>;
export type SelectMkAdvancerInput = z.infer<typeof selectMkAdvancerSchema>;
export type ResolveAbsenceInput = z.infer<typeof resolveAbsenceSchema>;
export type ReportResultInput = z.infer<typeof reportResultSchema>;
export type ReportDetailedResultInput = z.infer<typeof reportDetailedResultSchema>;
