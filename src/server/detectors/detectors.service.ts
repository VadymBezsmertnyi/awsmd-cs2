import "server-only";

// types
import type { NormalizedParseResultT } from "@/app/api/demos/demos.types";
import type { TacticalFindingT } from "./shared/tactical-finding.types";
import type { FalseConfidenceDeathDetectorContextT } from "./false-confidence-death/false-confidence-death.types";

// helpers
import { runFalseConfidenceDeathDetector } from "./false-confidence-death/false-confidence-death.detector";

export const runAllDetectors = (
  parseResult: NormalizedParseResultT,
  detectorContext: FalseConfidenceDeathDetectorContextT
): TacticalFindingT[] => [
  ...runFalseConfidenceDeathDetector(parseResult, detectorContext),
];
