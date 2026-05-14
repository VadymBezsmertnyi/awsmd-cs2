import "server-only";

import { parseTicks } from "@laihoe/demoparser2";

// types
import type {
  NormalizedPlayerPositionSampleT,
  NormalizedPlayerT,
} from "@/app/api/demos/demos.types";

const POSITION_TICK_INTERVAL = 256;
const MAX_PLAYER_STEAMIDS = 12;
const MAX_TICK_SAMPLES = 520;
const MAX_POSITION_ROWS = 2500;

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
};

const buildSampleTicks = (maxTick: number): number[] => {
  if (!Number.isFinite(maxTick) || maxTick < 1) return [];
  const ticks: number[] = [];
  for (
    let t = 1;
    t <= maxTick && ticks.length < MAX_TICK_SAMPLES;
    t += POSITION_TICK_INTERVAL
  ) {
    ticks.push(Math.floor(t));
  }
  return ticks;
};

/**
 * Sampled world positions from parseTicks (not every tick; bounded rows).
 */
export const samplePlayerPositions = (
  buffer: Buffer,
  maxTick: number,
  players: NormalizedPlayerT[],
  parserWarnings: string[]
): NormalizedPlayerPositionSampleT[] => {
  if (maxTick < 2) {
    parserWarnings.push(
      "Skipped position sampling (maxTick < 2); playerPositions empty"
    );
    return [];
  }

  const steamIds = players
    .map((p) => p.steamId)
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .slice(0, MAX_PLAYER_STEAMIDS);

  if (steamIds.length === 0) {
    parserWarnings.push(
      "No player steam IDs for parseTicks sampling; playerPositions empty"
    );
    return [];
  }

  const wantedTicks = buildSampleTicks(maxTick);
  if (wantedTicks.length === 0) return [];

  const steamToPlayer = new Map<string, NormalizedPlayerT>();
  for (const p of players) {
    if (p.steamId && p.steamId.trim().length > 0)
      steamToPlayer.set(p.steamId.trim(), p);
  }

  let rows: Array<Record<string, unknown>> = [];
  try {
    const raw = parseTicks(
      buffer,
      ["X", "Y", "Z"],
      wantedTicks,
      steamIds,
      false,
      null,
      null
    );
    rows = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  } catch (err) {
    parserWarnings.push(
      `parseTicks position sample failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }

  if (rows.length === 0) {
    parserWarnings.push(
      "parseTicks returned no rows for X/Y/Z sampling; playerPositions empty"
    );
    return [];
  }

  const out: NormalizedPlayerPositionSampleT[] = [];
  for (const row of rows) {
    const tick = num(row.tick);
    const sidRaw = row.steamid ?? row.steamId;
    const steamId = typeof sidRaw === "string" ? sidRaw.trim() : null;
    if (tick == null || steamId == null) continue;
    const pl = steamToPlayer.get(steamId);
    const x = num(row.X) ?? num(row.x);
    const y = num(row.Y) ?? num(row.y);
    const z = num(row.Z) ?? num(row.z);
    out.push({
      tick: Math.round(tick),
      playerName: pl?.name ?? "unknown",
      steamId,
      team: pl?.team ?? null,
      x,
      y,
      z,
    });
    if (out.length >= MAX_POSITION_ROWS) break;
  }

  if (rows.length > 0 && out.length === 0)
    parserWarnings.push(
      "Position parseTicks rows present but none produced valid samples (unexpected field shape)"
    );

  if (out.length >= MAX_POSITION_ROWS)
    parserWarnings.push(
      `Player position samples truncated at ${MAX_POSITION_ROWS} rows`
    );

  out.sort(
    (a, b) => a.tick - b.tick || a.playerName.localeCompare(b.playerName)
  );
  return out;
};
