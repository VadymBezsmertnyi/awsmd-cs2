import { z } from "zod";

export const demoFileEntrySchema = z.object({
  id: z.string(),
  fileName: z.string(),
  size: z.number().int().nonnegative(),
  modifiedAt: z.string(),
});

export type DemoFileEntry = z.infer<typeof demoFileEntrySchema>;

export const demosListResponseSchema = z.object({
  demos: z.array(demoFileEntrySchema),
});

export type DemosListResponse = z.infer<typeof demosListResponseSchema>;

export const parseDemoRequestSchema = z.object({
  fileName: z.string().min(1).max(512),
});

export type ParseDemoRequest = z.infer<typeof parseDemoRequestSchema>;

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

export type NormalizedParseResult = z.infer<typeof normalizedParseResultSchema>;

export const parseDemoResponseSchema = z.object({
  result: normalizedParseResultSchema,
});

export type ParseDemoResponse = z.infer<typeof parseDemoResponseSchema>;
