// schemas
import type { FalseConfidenceDeathTuningT } from "../false-confidence-death.schema";

// types
import type { FalseConfidenceDeathDetectorContextT } from "../false-confidence-death.types";
import { lowerBoundByTick, type TelemetryIndexesT } from "../telemetry-index";
import { applyRawDelta, type CandidateStateT } from "./types";

// helpers
import { windowTicks } from "../false-confidence-death.helpers";

const ALLIED_UTILITY = new Set(["FLASH", "SMOKE", "HE", "MOLOTOV", "INFERNO"]);

const playerKey = (name: string | null | undefined): string | null => {
  if (name == null) return null;
  const k = name.trim().toLowerCase();
  return k.length > 0 ? k : null;
};

export const applyUtilityContextHeuristic = (
  ctx: FalseConfidenceDeathDetectorContextT,
  deathTick: number,
  victimTeam: string | null,
  roster: Map<string, string | null>,
  tickRate: number | null | undefined,
  indexes: TelemetryIndexesT,
  tuning: FalseConfidenceDeathTuningT,
  out: CandidateStateT
): void => {
  if (!ctx.hasUtilityEvents || victimTeam == null) return;
  if (indexes.utilitySorted.length === 0) return;

  const backTicks = windowTicks(
    tickRate,
    tuning.utilityLookbackSeconds,
    tuning.utilityLookbackTicksFallback
  );
  const t0 = deathTick - backTicks;
  const t1 = deathTick;
  const i0 = lowerBoundByTick(indexes.utilitySorted, t0);

  let foundAllied = false;
  for (let i = i0; i < indexes.utilitySorted.length; i += 1) {
    const u = indexes.utilitySorted[i];
    if (u.tick > t1) break;
    if (u.tick < t0) continue;
    if (!ALLIED_UTILITY.has(u.utilityType)) continue;
    const pk = playerKey(u.playerName);
    if (pk == null) continue;
    const team = roster.get(pk);
    if (team === victimTeam) {
      foundAllied = true;
      break;
    }
  }

  if (foundAllied) {
    applyRawDelta(out, tuning.alliedUtilityScoreDelta);
    out.evidence.push(
      "Allied utility detonation(s) occurred shortly before elimination in the sampled window (timing only; not area coverage)."
    );
  } else {
    out.rawPoints += tuning.weightNoAlliedUtility;
    out.flags.noAlliedUtilityWindow = true;
    out.evidence.push(
      "No recent allied utility detonations detected before elimination in the sampled timing window (approximate)."
    );
  }
};
