import type { z } from "zod";

import {
  analysisReportSchema,
  countsBySeveritySchema,
  findingSeveritySchema,
  findingTypeSchema,
  tacticalFindingContextSchema,
  tacticalFindingSchema,
  telemetrySummarySchema,
  telemetryTierSchema,
} from "./tactical-finding.schema";

export type FindingSeverityT = z.infer<typeof findingSeveritySchema>;
export type FindingTypeT = z.infer<typeof findingTypeSchema>;
export type TelemetryTierT = z.infer<typeof telemetryTierSchema>;
export type TacticalFindingContextT = z.infer<
  typeof tacticalFindingContextSchema
>;
export type TacticalFindingT = z.infer<typeof tacticalFindingSchema>;
export type CountsBySeverityT = z.infer<typeof countsBySeveritySchema>;
export type TelemetrySummaryT = z.infer<typeof telemetrySummarySchema>;
export type AnalysisReportT = z.infer<typeof analysisReportSchema>;
