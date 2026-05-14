// schemas
import type { FalseConfidenceDeathTuningT } from "../false-confidence-death.schema";

// types
import type {
  NormalizedKillT,
  NormalizedRoundT,
} from "@/app/api/demos/demos.types";
import type { FalseConfidenceDeathDetectorContextT } from "../false-confidence-death.types";
import type { CandidateStateT } from "./types";

// helpers
import {
  isEarlyRoundDeath,
  secondsIntoRound,
} from "../false-confidence-death.helpers";
import { resolveRoundContainingTick } from "@/src/server/shared/demo-timeline";

export const applyEarlyRoundHeuristic = (
  ctx: FalseConfidenceDeathDetectorContextT,
  kill: NormalizedKillT,
  sortedRounds: NormalizedRoundT[],
  tickRate: number | null | undefined,
  tuning: FalseConfidenceDeathTuningT,
  out: CandidateStateT
): void => {
  if (ctx.telemetryTier !== "limited" && ctx.telemetryTier !== "spatial")
    return;
  const round = resolveRoundContainingTick(kill.tick, sortedRounds);
  const sec = round ? secondsIntoRound(kill.tick, round, tickRate) : null;
  if (!isEarlyRoundDeath(sec, tuning.earlyRoundSeconds)) return;
  out.rawPoints += tuning.weightEarlyRound;
  out.flags.earlyRound = true;
  out.evidence.push(
    `Victim died ${sec != null ? `${sec.toFixed(1)}s` : "shortly"} after round start (timing from round_start tick and inferred tick rate).`
  );
};
