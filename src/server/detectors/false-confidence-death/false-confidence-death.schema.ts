import { z } from "zod";

export const FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION = "0.0.1" as const;

export const falseConfidenceDeathTuningSchema = z.object({
  detectorVersion: z
    .literal(FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION)
    .default(FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION),
  maxTradeWindowTicks: z.number().int().positive().optional(),
});

export type FalseConfidenceDeathTuningT = z.infer<
  typeof falseConfidenceDeathTuningSchema
>;
