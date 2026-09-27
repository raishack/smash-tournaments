import { z } from "zod";

export const createMobileStartggAuthSchema = z.object({
  redirectUri: z.string().url(),
});

export const playerReportResultSchema = z.object({
  winnerParticipantId: z.string().min(1),
  scores: z.array(
    z.object({
      participantId: z.string().min(1),
      score: z.number().int().min(0).max(99),
    }),
  ),
});

const playerDetailedSelectionSchema = z.object({
  participantId: z.string().min(1),
  characterName: z.string().min(1).max(640),
});

const playerDetailedGameSchema = z.object({
  winnerParticipantId: z.string().min(1),
  selections: z.array(playerDetailedSelectionSchema).max(2).optional(),
});

export const playerReportDetailedResultSchema = z.object({
  bestOfOverride: z.union([z.literal(1), z.literal(3), z.literal(5)]).optional(),
  games: z.array(playerDetailedGameSchema).min(1).max(9),
});

export const playerUpdateCharactersSchema = z.object({
  selections: z.array(z.object({
    participantId: z.string().min(1),
    characterName: z.string().min(1).max(640),
  })).max(2),
});

export const playerRecordGameWinSchema = z.object({
  participantId: z.string().min(1),
});

export const playerResolveAbsenceSchema = z.object({
  outcome: z.enum(["NONE_PRESENT", "SLOT_1_ABSENT", "SLOT_2_ABSENT"]),
});

export const playerLadderReadySchema = z.object({});
export const playerLadderQueueSchema = z.object({});
export const playerLadderDetailedReportSchema = z.object({
  bestOfOverride: z.union([z.literal(1), z.literal(3), z.literal(5)]).optional(),
  games: z.array(playerDetailedGameSchema).min(1).max(9),
});
export const playerPushTokenSchema = z.object({
  token: z.string().min(1).max(4096),
  deviceLabel: z.string().trim().min(1).max(120).optional(),
});

export type CreateMobileStartggAuthInput = z.infer<typeof createMobileStartggAuthSchema>;
export type PlayerReportResultInput = z.infer<typeof playerReportResultSchema>;
export type PlayerReportDetailedResultInput = z.infer<typeof playerReportDetailedResultSchema>;
export type PlayerUpdateCharactersInput = z.infer<typeof playerUpdateCharactersSchema>;
export type PlayerRecordGameWinInput = z.infer<typeof playerRecordGameWinSchema>;
export type PlayerResolveAbsenceInput = z.infer<typeof playerResolveAbsenceSchema>;
export type PlayerLadderReadyInput = z.infer<typeof playerLadderReadySchema>;
export type PlayerLadderQueueInput = z.infer<typeof playerLadderQueueSchema>;
export type PlayerLadderDetailedReportInput = z.infer<typeof playerLadderDetailedReportSchema>;
export type PlayerPushTokenInput = z.infer<typeof playerPushTokenSchema>;
