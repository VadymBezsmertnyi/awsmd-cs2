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

export const normalizedParseResultSchema = z.object({
  fileName: z.string(),
  fileSize: z.number(),
  status: z.enum(["success", "error"]),
  mapName: z.string().nullable().optional(),
  tickRate: z.number().nullable().optional(),
  durationTicks: z.number().nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  players: z.array(z.unknown()),
  rounds: z.array(z.unknown()),
  kills: z.array(z.unknown()),
  parserWarnings: z.array(z.string()),
  parsedAt: z.string(),
  errorMessage: z.string().optional(),
});

export const parseDemoResponseSchema = z.object({
  result: normalizedParseResultSchema,
});
