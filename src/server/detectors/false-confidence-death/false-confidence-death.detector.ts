// types
import type { NormalizedParseResultT } from "@/app/api/demos/demos.types";
import type { TacticalFindingT } from "../shared/tactical-finding.types";
import type { FalseConfidenceDeathDetectorContextT } from "./false-confidence-death.types";

/**
 * False Confidence Death — skeleton only (no heuristics).
 *
 * Future work (honest to telemetry):
 * - TODO: trade analysis — teammate trade kills / timing vs roster + kill feed
 * - TODO: timing analysis — seconds since round start / burst windows when tickRate + rounds exist
 * - TODO: movement analysis — requires per-tick positions from parser (not available yet)
 * - TODO: utility analysis — smoke/flash/molly events (not in normalized parse yet)
 * - TODO: positional exposure analysis — LOS / angles (not in normalized parse yet)
 */
export const runFalseConfidenceDeathDetector = (
  parseResult: NormalizedParseResultT,
  ctx: FalseConfidenceDeathDetectorContextT
): TacticalFindingT[] => {
  void ctx;
  for (const kill of parseResult.kills) {
    void kill;
    // Intentionally empty: detector MVP returns no synthetic findings.
  }
  return [];
};
