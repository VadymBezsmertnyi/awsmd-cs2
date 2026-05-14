import { z } from "zod";

export const FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION = "0.3.0" as const;

export const falseConfidenceDeathTuningSchema = z.object({
  detectorVersion: z
    .literal(FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION)
    .default(FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION),
  tradeWindowSeconds: z.number().positive().default(4),
  tradeWindowTicksFallback: z.number().int().positive().default(512),
  earlyRoundSeconds: z.number().positive().default(14),
  isolationWindowSeconds: z.number().positive().default(5),
  isolationTicksFallback: z.number().int().positive().default(640),
  emitMinRawPoints: z.number().nonnegative().default(36),
  rawPointsNormalizeDivisorKillOnly: z.number().positive().default(72),
  rawPointsNormalizeDivisorLimited: z.number().positive().default(90),
  rawPointsNormalizeDivisorSpatial: z.number().positive().default(104),
  maxFindingsPerDemo: z.number().int().positive().default(18),
  weightNoTrade: z.number().nonnegative().default(30),
  weightEarlyRound: z.number().nonnegative().default(14),
  weightHeadshotRifle: z.number().nonnegative().default(12),
  weightIsolation: z.number().nonnegative().default(12),
  supportRadiusUnits: z.number().positive().default(1200),
  supportTickTolerance: z.number().int().positive().default(512),
  weightSpatialSupport: z.number().nonnegative().default(18),
  clusterWindowSeconds: z.number().positive().default(5),
  clusterTicksFallback: z.number().int().positive().default(640),
  clusterKillWeight: z.number().nonnegative().default(3),
  clusterActivityLow: z.number().nonnegative().default(9),
  clusterActivityHigh: z.number().nonnegative().default(30),
  clusterActivityCap: z.number().nonnegative().default(56),
  weightClusterSolo: z.number().nonnegative().default(9),
  clusterBusyScoreDelta: z.number().default(-11),
  utilityLookbackSeconds: z.number().positive().default(6),
  utilityLookbackTicksFallback: z.number().int().positive().default(480),
  weightNoAlliedUtility: z.number().nonnegative().default(11),
  alliedUtilityScoreDelta: z.number().default(-9),
  damageTimelineSeconds: z.number().positive().default(2.8),
  damageTimelineTicksFallback: z.number().int().positive().default(224),
  shortEngagementSeconds: z.number().positive().default(0.45),
  shortEngagementTicksFallback: z.number().int().positive().default(56),
  weightShortDamageTimeline: z.number().nonnegative().default(13),
});

export type FalseConfidenceDeathTuningT = z.infer<
  typeof falseConfidenceDeathTuningSchema
>;
