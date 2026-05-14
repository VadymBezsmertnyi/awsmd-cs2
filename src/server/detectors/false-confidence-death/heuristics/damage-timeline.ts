// schemas
import type { FalseConfidenceDeathTuningT } from "../false-confidence-death.schema";

// types
import type { FalseConfidenceDeathDetectorContextT } from "../false-confidence-death.types";
import type { CandidateStateT } from "./types";
import { lowerBoundByTick, type TelemetryIndexesT } from "../telemetry-index";

// helpers
import { namesMatch } from "../false-confidence-death.helpers";

export const applyDamageTimelineHeuristic = (
  ctx: FalseConfidenceDeathDetectorContextT,
  deathTick: number,
  victimName: string,
  tickRate: number | null | undefined,
  indexes: TelemetryIndexesT,
  tuning: FalseConfidenceDeathTuningT,
  out: CandidateStateT
): void => {
  if (!ctx.hasDamageEvents || indexes.damageSorted.length === 0) return;

  const tr =
    typeof tickRate === "number" && Number.isFinite(tickRate) && tickRate > 0
      ? tickRate
      : null;
  const windowTicksVal = tr
    ? Math.round(tuning.damageTimelineSeconds * tr)
    : tuning.damageTimelineTicksFallback;
  const t0 = deathTick - windowTicksVal;
  const i0 = lowerBoundByTick(indexes.damageSorted, t0);

  let firstTick: number | null = null;
  let count = 0;
  for (let i = i0; i < indexes.damageSorted.length; i += 1) {
    const d = indexes.damageSorted[i];
    if (d.tick > deathTick) break;
    if (d.tick < t0) continue;
    if (!namesMatch(d.victimName, victimName)) continue;
    count += 1;
    if (firstTick == null || d.tick < firstTick) firstTick = d.tick;
  }

  const span =
    firstTick != null && count > 0 ? deathTick - firstTick : deathTick - t0;
  const shortLimit = tr
    ? Math.round(tuning.shortEngagementSeconds * tr)
    : tuning.shortEngagementTicksFallback;

  if (count < 1) return;

  const tightBurst =
    span <= shortLimit || (count <= 2 && span <= Math.round(shortLimit * 1.8));

  if (tightBurst) {
    out.rawPoints += tuning.weightShortDamageTimeline;
    out.flags.shortDamageTimeline = true;
    out.evidence.push(
      "Таймлайн шкоди за вибірковими подіями player_hurt вказує на коротке вікно перед усуненням (не доказ реакції)."
    );
  }
};
