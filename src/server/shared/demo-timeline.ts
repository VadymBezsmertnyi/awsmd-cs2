import "server-only";

// types
import type { NormalizedRoundT } from "@/app/api/demos/demos.types";

export const buildSortedRounds = (
  rounds: NormalizedRoundT[]
): NormalizedRoundT[] =>
  [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);

export const resolveRoundContainingTick = (
  tick: number,
  sortedRounds: NormalizedRoundT[]
): NormalizedRoundT | null => {
  if (!Number.isFinite(tick) || sortedRounds.length === 0) return null;
  for (const r of sortedRounds) {
    if (r.startTick == null || !Number.isFinite(r.startTick)) continue;
    if (tick < r.startTick) continue;
    if (r.endTick != null && Number.isFinite(r.endTick) && tick > r.endTick)
      continue;
    return r;
  }
  return null;
};

export const tickToDemoSeconds = (
  tick: number,
  tickRate: number | null | undefined
): number | null => {
  if (!Number.isFinite(tick)) return null;
  if (
    typeof tickRate !== "number" ||
    !Number.isFinite(tickRate) ||
    tickRate <= 0
  )
    return null;
  return tick / tickRate;
};

export const roundRelativeSeconds = (
  tick: number,
  round: NormalizedRoundT,
  tickRate: number | null | undefined
): number | null => {
  if (round.startTick == null || !Number.isFinite(round.startTick)) return null;
  if (
    typeof tickRate !== "number" ||
    !Number.isFinite(tickRate) ||
    tickRate <= 0
  )
    return null;
  const dt = tick - round.startTick;
  if (!Number.isFinite(dt) || dt < 0) return null;
  return dt / tickRate;
};
