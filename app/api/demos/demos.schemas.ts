import { z } from "zod";

import { analysisReportSchema } from "@/src/server/detectors/shared/tactical-finding.schema";

export const demoFileSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  size: z.number().int().nonnegative(),
  modifiedAt: z.string(),
});

export const listDemosResponseSchema = z.object({
  demos: z.array(demoFileSchema),
});

export const parseDemoRequestSchema = z.object({
  fileName: z.string().min(1).max(512),
});

export const normalizedPlayerSchema = z.object({
  steamId: z.string().nullable(),
  name: z.string(),
  team: z.string().nullable(),
});

export const normalizedKillSchema = z.object({
  tick: z.number(),
  killerName: z.string().nullable(),
  victimName: z.string().nullable(),
  weapon: z.string().nullable(),
  headshot: z.boolean(),
});

export const normalizedRoundSchema = z.object({
  roundNumber: z.number(),
  startTick: z.number().nullable(),
  endTick: z.number().nullable(),
  winner: z.string().nullable(),
});

export const normalizedPlayerPositionSampleSchema = z.object({
  tick: z.number().int(),
  playerName: z.string(),
  steamId: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  z: z.number().nullable(),
});

export const normalizedPlayerDamageEventSchema = z.object({
  tick: z.number().int(),
  attackerName: z.string().nullable(),
  victimName: z.string().nullable(),
  weapon: z.string().nullable(),
  damage: z.number().nullable(),
  health: z.number().nullable(),
  armor: z.number().nullable(),
  hitgroup: z.number().nullable(),
});

export const normalizedUtilityTypeSchema = z.enum([
  "FLASH",
  "SMOKE",
  "HE",
  "MOLOTOV",
  "INFERNO",
]);

export const normalizedUtilityEventSchema = z.object({
  tick: z.number().int(),
  playerName: z.string().nullable(),
  utilityType: normalizedUtilityTypeSchema,
  x: z.number().nullable().optional(),
  y: z.number().nullable().optional(),
  z: z.number().nullable().optional(),
});

export const parserMetaSchema = z.object({
  parser: z.string(),
  parserVersion: z.string(),
  parseDurationMs: z.number(),
  protocol: z.number().nullable(),
});

export const parseSummarySchema = z.object({
  playersCount: z.number().int().nonnegative(),
  roundsCount: z.number().int().nonnegative(),
  killsCount: z.number().int().nonnegative(),
  warningsCount: z.number().int().nonnegative(),
  isUsableForAnalysis: z.boolean(),
});

export const normalizedParseResultSchema = z.object({
  fileName: z.string(),
  fileSize: z.number(),
  status: z.enum(["success", "error"]),
  mapName: z.string().nullable().optional(),
  tickRate: z.number().nullable().optional(),
  durationTicks: z.number().nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  players: z.array(normalizedPlayerSchema),
  rounds: z.array(normalizedRoundSchema),
  kills: z.array(normalizedKillSchema),
  playerPositions: z.array(normalizedPlayerPositionSampleSchema).default([]),
  playerDamageEvents: z.array(normalizedPlayerDamageEventSchema).default([]),
  utilityEvents: z.array(normalizedUtilityEventSchema).default([]),
  parserMeta: parserMetaSchema,
  parserWarnings: z.array(z.string()),
  parsedAt: z.string(),
  errorMessage: z.string().optional(),
  summary: parseSummarySchema,
});

export const parseDemoResponseSchema = z.object({
  result: normalizedParseResultSchema,
  analysis: analysisReportSchema.nullable(),
});

export const parseAllBatchItemSchema = z.object({
  fileName: z.string(),
  status: z.enum(["success", "error"]),
  summary: parseSummarySchema,
  parserWarnings: z.array(z.string()),
  errorMessage: z.string().optional(),
  outputFileName: z.string().nullable().optional(),
});

export const parseAllDemosResponseSchema = z.object({
  parsedAt: z.string(),
  total: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  results: z.array(parseAllBatchItemSchema),
});
