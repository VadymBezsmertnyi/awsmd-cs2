import { z } from "zod";

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

export const parserMetaSchema = z.object({
  parser: z.string(),
  parserVersion: z.string(),
  parseDurationMs: z.number(),
  protocol: z.number().nullable(),
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
  parserMeta: parserMetaSchema,
  parserWarnings: z.array(z.string()),
  parsedAt: z.string(),
  errorMessage: z.string().optional(),
});

export const parseDemoResponseSchema = z.object({
  result: normalizedParseResultSchema,
});
