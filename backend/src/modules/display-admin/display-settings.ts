import { z } from "zod";

export const displayPreferencesSchema = z.object({
  bracketLayout: z.enum(["separate", "combined"]).default("separate"),
  bracketDensity: z.enum(["comfortable", "balanced", "compact"]).default("balanced"),
  bracketViewport: z.enum(["focus", "overview"]).default("focus"),
  bracketRounds: z.number().int().min(2).max(8).default(4),
  bracketRows: z.number().int().min(2).max(12).default(6),
  textScale: z.number().int().min(80).max(150).default(100),
  compactHeader: z.boolean().default(true),
  showSponsors: z.boolean().default(true),
  showCharacters: z.boolean().default(true),
  includeLadder: z.boolean().default(true),
  includeSetups: z.boolean().default(true),
  showResults: z.boolean().default(true),
  showCalls: z.boolean().default(true),
  reduceMotion: z.boolean().default(false),
  bracketSeconds: z.number().int().min(5).max(120).default(19),
  resultSeconds: z.number().int().min(5).max(60).default(11),
  callSeconds: z.number().int().min(5).max(60).default(12),
  soundVolume: z.number().int().min(0).max(100).default(75),
});
export type DisplayPreferences = z.infer<typeof displayPreferencesSchema>;
export const displaySettingsSchema = z.object({
  bracketRenderMode: z.enum(["classic", "modern"]).optional(),
  displaySettings: displayPreferencesSchema.partial().optional(),
}).refine(value => value.bracketRenderMode !== undefined || value.displaySettings !== undefined);

export function normalizeDisplayPreferences(value: unknown): DisplayPreferences {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(displayPreferencesSchema.shape).map(([key, schema]) => {
    const parsed = schema.safeParse(data[key]);
    return [key, parsed.success ? parsed.data : schema.parse(undefined)];
  })) as DisplayPreferences;
}
