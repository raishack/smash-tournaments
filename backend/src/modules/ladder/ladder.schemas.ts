import { z } from "zod";

export const ladderSettingsSchema = z.object({
  mode: z.enum(["CASUAL", "COMPETITIVE"]),
  bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  readySeconds: z.number().int().min(30).max(900),
  rematchWaitSeconds: z.number().int().min(0).max(1800),
  minimumSets: z.number().int().min(1).max(50),
  requireConfirmation: z.boolean(),
  setupNumbers: z.array(z.number().int().min(1).max(256)).max(256).transform(values => [...new Set(values)].sort((a,b) => a-b)),
  opensAt: z.string().datetime().optional(),
  closesAt: z.string().datetime().optional(),
}).refine(s => !s.opensAt || !s.closesAt || Date.parse(s.closesAt) > Date.parse(s.opensAt), "El cierre debe ser posterior a la apertura");

export const ladderControlSchema = z.object({
  action: z.enum(["PAUSE", "RESUME", "CLOSE", "SETTINGS", "ADD_PLAYER", "REMOVE_PLAYER", "CANCEL_MATCH", "RESOLVE_RESULT", "REOPEN_MATCH"]),
  actor: z.string().trim().min(1).max(100).default("organización"),
  participantId: z.string().min(1).max(200).optional(),
  matchId: z.string().min(1).max(200).optional(),
  expectedRevision: z.string().min(1).max(100).optional(),
  reason: z.string().trim().max(500).optional(),
  settings: ladderSettingsSchema.optional(),
  winnerParticipantId: z.string().min(1).max(200).optional(),
  scores: z.array(z.object({ participantId: z.string().min(1), score: z.number().int().min(0).max(3) })).length(2).optional(),
});
export type LadderControlInput = z.infer<typeof ladderControlSchema>;
export const ladderReviewSchema = z.object({
  action: z.enum(["CONFIRM", "DISPUTE"]),
  expectedRevision: z.string().min(1).max(100),
  reason: z.string().trim().min(3).max(500).optional(),
});
