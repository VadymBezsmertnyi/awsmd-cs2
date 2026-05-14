import "server-only";

// types
import type {
  NormalizedKillT,
  NormalizedParseResultT,
  NormalizedPlayerDamageEventT,
  NormalizedUtilityEventT,
} from "@/app/api/demos/demos.types";

export type PositionSampleT = {
  tick: number;
  playerNameLower: string;
  x: number;
  y: number;
  z: number;
};

export type TelemetryIndexesT = {
  positionSamples: PositionSampleT[];
  positionsByPlayer: Map<string, PositionSampleT[]>;
  damageSorted: NormalizedPlayerDamageEventT[];
  utilitySorted: NormalizedUtilityEventT[];
  killsSorted: NormalizedKillT[];
};

const playerKey = (name: string): string => name.trim().toLowerCase();

const pushSample = (
  map: Map<string, PositionSampleT[]>,
  name: string,
  row: PositionSampleT
): void => {
  const k = playerKey(name);
  if (k.length === 0) return;
  const arr = map.get(k) ?? [];
  arr.push(row);
  map.set(k, arr);
};

export const buildTelemetryIndexes = (
  parseResult: NormalizedParseResultT
): TelemetryIndexesT => {
  const positionSamples: PositionSampleT[] = [];
  const positionsByPlayer = new Map<string, PositionSampleT[]>();

  for (const p of parseResult.playerPositions) {
    const x = p.x;
    const y = p.y;
    const z = p.z;
    if (
      x == null ||
      y == null ||
      z == null ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z)
    )
      continue;
    const row: PositionSampleT = {
      tick: p.tick,
      playerNameLower: playerKey(p.playerName),
      x,
      y,
      z,
    };
    positionSamples.push(row);
    pushSample(positionsByPlayer, p.playerName, row);
  }

  for (const [, arr] of positionsByPlayer) arr.sort((a, b) => a.tick - b.tick);

  positionSamples.sort((a, b) => a.tick - b.tick);

  const damageSorted = parseResult.playerDamageEvents;
  const utilitySorted = parseResult.utilityEvents;
  const killsSorted = parseResult.kills;

  return {
    positionSamples,
    positionsByPlayer,
    damageSorted,
    utilitySorted,
    killsSorted,
  };
};

export const lowerBoundByTick = <T extends { tick: number }>(
  arr: T[],
  tick: number
): number => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].tick < tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

export const distanceSquared = (
  a: PositionSampleT,
  b: PositionSampleT
): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};

export const nearestPositionSample = (
  samples: PositionSampleT[] | undefined,
  targetTick: number,
  maxTickDelta: number
): PositionSampleT | null => {
  if (!samples || samples.length === 0) return null;
  const i = lowerBoundByTick(samples, targetTick);
  let best: PositionSampleT | null = null;
  let bestDt = Infinity;
  const consider = (idx: number): void => {
    if (idx < 0 || idx >= samples.length) return;
    const s = samples[idx];
    const dt = Math.abs(s.tick - targetTick);
    if (dt <= maxTickDelta && dt < bestDt) {
      bestDt = dt;
      best = s;
    }
  };
  consider(i);
  consider(i - 1);
  consider(i + 1);
  return best;
};
