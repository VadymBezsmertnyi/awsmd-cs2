// schemas
import type { FalseConfidenceDeathTuningT } from "../false-confidence-death.schema";

// types
import type { NormalizedKillT } from "@/app/api/demos/demos.types";
import type { FalseConfidenceDeathDetectorContextT } from "../false-confidence-death.types";
import { lowerBoundByTick, type TelemetryIndexesT } from "../telemetry-index";
import { applyRawDelta, type CandidateStateT } from "./types";

const countKillsInTickRange = (
  kills: NormalizedKillT[],
  t0: number,
  t1: number
): number => {
  const i0 = lowerBoundByTick(kills, t0);
  let n = 0;
  for (let i = i0; i < kills.length; i += 1) {
    const k = kills[i];
    if (k.tick > t1) break;
    if (k.tick >= t0) n += 1;
  }
  return n;
};

const countDamageInRange = (
  indexes: TelemetryIndexesT,
  t0: number,
  t1: number
): number => {
  const arr = indexes.damageSorted;
  const i0 = lowerBoundByTick(arr, t0);
  let n = 0;
  for (let i = i0; i < arr.length; i += 1) {
    const d = arr[i];
    if (d.tick > t1) break;
    if (d.tick >= t0) n += 1;
  }
  return n;
};

const countUtilityInRange = (
  indexes: TelemetryIndexesT,
  t0: number,
  t1: number
): number => {
  const arr = indexes.utilitySorted;
  const i0 = lowerBoundByTick(arr, t0);
  let n = 0;
  for (let i = i0; i < arr.length; i += 1) {
    const u = arr[i];
    if (u.tick > t1) break;
    if (u.tick >= t0) n += 1;
  }
  return n;
};

const teammateDeathsInRange = (
  kills: NormalizedKillT[],
  roster: Map<string, string | null>,
  victimTeam: string | null,
  t0: number,
  t1: number,
  excludeVictimName: string
): number => {
  if (victimTeam == null) return 0;
  const ex = excludeVictimName.trim().toLowerCase();
  const i0 = lowerBoundByTick(kills, t0);
  let n = 0;
  for (let i = i0; i < kills.length; i += 1) {
    const k = kills[i];
    if (k.tick > t1) break;
    if (k.tick < t0) continue;
    const vn = k.victimName?.trim().toLowerCase();
    if (!vn || vn === ex) continue;
    const vt = roster.get(vn);
    if (vt === victimTeam) n += 1;
  }
  return n;
};

/**
 * Coarse fight density around death (not tactical classification).
 */
export const applyEngagementClusterHeuristic = (
  ctx: FalseConfidenceDeathDetectorContextT,
  deathTick: number,
  victimName: string,
  victimTeam: string | null,
  roster: Map<string, string | null>,
  indexes: TelemetryIndexesT,
  tickRate: number | null | undefined,
  tuning: FalseConfidenceDeathTuningT,
  out: CandidateStateT
): void => {
  if (ctx.telemetryTier === "kill_only") return;

  const tr =
    typeof tickRate === "number" && Number.isFinite(tickRate) && tickRate > 0
      ? tickRate
      : null;
  const before = tr
    ? Math.round(tuning.clusterWindowSeconds * tr)
    : tuning.clusterTicksFallback;
  const after = Math.max(1, Math.round(before * 0.2));
  const t0 = deathTick - before;
  const t1 = deathTick + after;

  const killCount = countKillsInTickRange(indexes.killsSorted, t0, t1);
  const dmgCount =
    ctx.hasDamageEvents && indexes.damageSorted.length > 0
      ? countDamageInRange(indexes, t0, t1)
      : 0;
  const utilCount =
    ctx.hasUtilityEvents && indexes.utilitySorted.length > 0
      ? countUtilityInRange(indexes, t0, t1)
      : 0;
  const mateDeaths =
    victimTeam != null
      ? teammateDeathsInRange(
          indexes.killsSorted,
          roster,
          victimTeam,
          t0,
          t1,
          victimName
        )
      : 0;

  const activity = Math.min(
    tuning.clusterActivityCap,
    dmgCount + tuning.clusterKillWeight * killCount + utilCount + mateDeaths
  );

  if (activity >= tuning.clusterActivityHigh) {
    applyRawDelta(out, tuning.clusterBusyScoreDelta);
    out.flags.busyCombatContext = true;
    out.evidence.push(
      "За вибірковим вікном навколо смерті ймовірно підвищена бойова активність (евристичний індекс; не про тактику «зачищення» кутів)."
    );
  } else if (activity <= tuning.clusterActivityLow) {
    out.rawPoints += tuning.weightClusterSolo;
    out.flags.lowCombatCluster = true;
    out.evidence.push(
      "Обмежена активність бою у вікні за kill/damage/utility (наближено; можливий сигнал ізоляції, потребує ручної перевірки у відео)."
    );
  }
};
