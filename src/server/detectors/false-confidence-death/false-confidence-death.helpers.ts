// schemas
import { falseConfidenceDeathTuningSchema } from "./false-confidence-death.schema";

// types
import type { NormalizedKillT } from "@/app/api/demos/demos.types";

/** Default tuning bucket until heuristics read overrides. */
export const defaultFalseConfidenceDeathTuning =
  falseConfidenceDeathTuningSchema.parse({});

/**
 * Reserved for round index resolution from kill tick once heuristics land.
 * TODO: implement using normalized rounds + tick boundaries.
 */
export const resolveRoundNumberForKillTick = (
  kill: NormalizedKillT
): number | null => {
  void kill;
  return null;
};

/**
 * Reserved for wall-clock seconds from tick when tickRate is known.
 * TODO: wire tickRate from parse result; return null when unavailable.
 */
export const resolveTimeSecondsForKillTick = (
  killTick: number,
  tickRate: number | null | undefined
): number | null => {
  void killTick;
  void tickRate;
  return null;
};
