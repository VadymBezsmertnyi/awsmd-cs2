import type { z } from "zod";

import {
  demoFileSchema,
  listDemosResponseSchema,
  normalizedParseResultSchema,
  parseDemoRequestSchema,
  parseDemoResponseSchema,
} from "./demos.schemas";

export type DemoFileT = z.infer<typeof demoFileSchema>;
export type ListDemosResponseT = z.infer<typeof listDemosResponseSchema>;
export type ParseDemoRequestT = z.infer<typeof parseDemoRequestSchema>;
export type NormalizedParseResultT = z.infer<typeof normalizedParseResultSchema>;
export type ParseDemoResponseT = z.infer<typeof parseDemoResponseSchema>;
