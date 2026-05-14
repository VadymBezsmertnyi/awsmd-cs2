import { z } from "zod";

export const findingSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const findingTypeSchema = z.enum(["FALSE_CONFIDENCE_DEATH"]);

export const telemetryTierSchema = z.enum([
  "kill_only",
  "limited",
  "spatial",
  "full",
]);

export const tacticalFindingContextSchema = z.object({
  telemetryTier: telemetryTierSchema,
  detectorVersion: z.string(),
  notes: z.array(z.string()).optional(),
});

export const tacticalFindingClipSchema = z.object({
  deathTick: z.number().int(),
  deathTimeSeconds: z.number(),
  deathTimeLabel: z.string(),
  clipStartSeconds: z.number(),
  clipEndSeconds: z.number(),
  clipStartLabel: z.string(),
  clipEndLabel: z.string(),
  clipDurationSeconds: z.number(),
});

export const tacticalFindingSchema = z.object({
  id: z.string(),
  type: findingTypeSchema,
  severity: findingSeveritySchema,
  confidence: z.number().min(0).max(1),
  playerName: z.string(),
  roundNumber: z.number().int().nullable(),
  timeSeconds: z.number().nullable(),
  tick: z.number().int(),
  weapon: z.string().nullable(),
  shortReason: z.string(),
  evidence: z.array(z.string()),
  recommendation: z.string(),
  victimSteamId: z.string().optional(),
  attackerName: z.string().optional(),
  attackerSteamId: z.string().optional(),
  mapName: z.string().optional(),
  context: tacticalFindingContextSchema.optional(),
  clip: tacticalFindingClipSchema.optional(),
});

export const countsBySeveritySchema = z.object({
  low: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
});

export const telemetrySummarySchema = z.object({
  hasTickRate: z.boolean(),
  hasRounds: z.boolean(),
  hasPlayers: z.boolean(),
  hasKills: z.boolean(),
  hasPlayerPositions: z.boolean(),
  hasDamageEvents: z.boolean(),
  hasUtilityEvents: z.boolean(),
  telemetryTier: telemetryTierSchema,
});

export const analysisReportSchema = z.object({
  findings: z.array(tacticalFindingSchema),
  countsBySeverity: countsBySeveritySchema,
  generatedAt: z.string(),
  telemetrySummary: telemetrySummarySchema,
});
