import type { z } from "zod";

import {
  demoFileSchema,
  listDemosResponseSchema,
  normalizedKillSchema,
  normalizedParseResultSchema,
  normalizedPlayerSchema,
  normalizedRoundSchema,
  parseAllBatchItemSchema,
  parseAllDemosResponseSchema,
  parserMetaSchema,
  parseDemoRequestSchema,
  parseDemoResponseSchema,
  parseSummarySchema,
} from "./demos.schemas";

export type DemoFileT = z.infer<typeof demoFileSchema>;
export type ListDemosResponseT = z.infer<typeof listDemosResponseSchema>;
export type ParseDemoRequestT = z.infer<typeof parseDemoRequestSchema>;
export type NormalizedPlayerT = z.infer<typeof normalizedPlayerSchema>;
export type NormalizedKillT = z.infer<typeof normalizedKillSchema>;
export type NormalizedRoundT = z.infer<typeof normalizedRoundSchema>;
export type ParserMetaT = z.infer<typeof parserMetaSchema>;
export type ParseSummaryT = z.infer<typeof parseSummarySchema>;
export type NormalizedParseResultT = z.infer<
  typeof normalizedParseResultSchema
>;
export type ParseDemoResponseT = z.infer<typeof parseDemoResponseSchema>;
export type ParseAllBatchItemT = z.infer<typeof parseAllBatchItemSchema>;
export type ParseAllDemosResponseT = z.infer<
  typeof parseAllDemosResponseSchema
>;

export type { AnalysisReportT } from "@/src/server/detectors/shared/tactical-finding.types";
