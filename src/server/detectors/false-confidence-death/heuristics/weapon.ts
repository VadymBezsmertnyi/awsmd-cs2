// schemas
import type { FalseConfidenceDeathTuningT } from "../false-confidence-death.schema";

// types
import type { NormalizedKillT } from "@/app/api/demos/demos.types";
import type { CandidateStateT } from "./types";

// helpers
import { weaponRiskWeight } from "../false-confidence-death.helpers";

export const applyHeadshotWeaponHeuristic = (
  kill: NormalizedKillT,
  tuning: FalseConfidenceDeathTuningT,
  out: CandidateStateT
): void => {
  const w = weaponRiskWeight(kill.weapon, kill.headshot, tuning);
  if (w.points <= 0 || w.evidenceLine == null) return;
  out.rawPoints += w.points;
  out.flags.headshotRifle = true;
  out.evidence.push(w.evidenceLine);
};
