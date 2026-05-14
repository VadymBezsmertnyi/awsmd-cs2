import { z } from "zod";

export const FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION = "0.1.0" as const;

export const falseConfidenceDeathTuningSchema = z.object({
  detectorVersion: z
    .literal(FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION)
    .default(FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION),
  tradeWindowSeconds: z.number().positive().default(4),
  tradeWindowTicksFallback: z.number().int().positive().default(512),
  earlyRoundSeconds: z.number().positive().default(14),
  isolationWindowSeconds: z.number().positive().default(5),
  isolationTicksFallback: z.number().int().positive().default(640),
  emitMinRawPoints: z.number().nonnegative().default(34),
  rawPointsNormalizeDivisor: z.number().positive().default(72),
  maxFindingsPerDemo: z.number().int().positive().default(18),
  weightNoTrade: z.number().nonnegative().default(30),
  weightEarlyRound: z.number().nonnegative().default(14),
  weightHeadshotRifle: z.number().nonnegative().default(12),
  weightIsolation: z.number().nonnegative().default(12),
});

export type FalseConfidenceDeathTuningT = z.infer<
  typeof falseConfidenceDeathTuningSchema
>;
