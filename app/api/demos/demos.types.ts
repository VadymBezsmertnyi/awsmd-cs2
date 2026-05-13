import type { z } from "zod";

import {
  demoFileSchema,
  listDemosResponseSchema,
  normalizedKillSchema,
  normalizedParseResultSchema,
  normalizedPlayerSchema,
  normalizedRoundSchema,
  parserMetaSchema,
  parseDemoRequestSchema,
  parseDemoResponseSchema,
} from "./demos.schemas";

export type DemoFileT = z.infer<typeof demoFileSchema>;
export type ListDemosResponseT = z.infer<typeof listDemosResponseSchema>;
export type ParseDemoRequestT = z.infer<typeof parseDemoRequestSchema>;
export type NormalizedPlayerT = z.infer<typeof normalizedPlayerSchema>;
export type NormalizedKillT = z.infer<typeof normalizedKillSchema>;
export type NormalizedRoundT = z.infer<typeof normalizedRoundSchema>;
export type ParserMetaT = z.infer<typeof parserMetaSchema>;
export type NormalizedParseResultT = z.infer<
  typeof normalizedParseResultSchema
>;
export type ParseDemoResponseT = z.infer<typeof parseDemoResponseSchema>;
