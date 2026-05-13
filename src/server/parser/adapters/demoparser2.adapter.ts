import "server-only";
import {
  parseEvents,
  parseHeader,
  parsePlayerInfo,
  parseTicks,
} from "@laihoe/demoparser2";

import type {
  NormalizedKillT,
  NormalizedParseResultT,
  NormalizedPlayerT,
  NormalizedRoundT,
  ParserMetaT,
} from "@/app/api/demos/demos.types";

// utils
import { getDemoparser2PackageVersion } from "../demoparser2-meta";

type DemoparserEventRowT = Record<string, unknown>;

const toObjectValuesArray = (raw: unknown): DemoparserEventRowT[] => {
  if (raw == null || typeof raw !== "object") return [];
  return Object.values(raw as Record<string, unknown>).filter(
    (v): v is DemoparserEventRowT => v != null && typeof v === "object"
  );
};

const teamLabelFromNumber = (teamNumber: unknown): string | null => {
  const n = typeof teamNumber === "number" ? teamNumber : Number(teamNumber);
  if (!Number.isFinite(n)) return null;

  switch (n) {
    case 0:
      return "Unassigned";
    case 1:
      return "Spectator";
    case 2:
      return "T";
    case 3:
      return "CT";
    default:
      return `Team_${n}`;
  }
};

const buildParserMeta = (
  parseDurationMs: number,
  protocol: number | null
): ParserMetaT => ({
  parser: "demoparser2",
  parserVersion: getDemoparser2PackageVersion(),
  parseDurationMs,
  protocol,
});

const dedupePlayers = (
  players: NormalizedPlayerT[],
  parserWarnings: string[]
): NormalizedPlayerT[] => {
  const map = new Map<string, NormalizedPlayerT>();
  for (const pl of players) {
    const key =
      pl.steamId && pl.steamId.length > 0
        ? `sid:${pl.steamId}`
        : `name:${pl.name.toLowerCase().trim()}`;
    const existing = map.get(key);
    if (
      existing &&
      (existing.name !== pl.name ||
        existing.team !== pl.team ||
        existing.steamId !== pl.steamId)
    )
      parserWarnings.push(`Merged duplicate player slot: ${key}`);

    map.set(key, pl);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const normalizePlayers = (
  raw: unknown,
  parserWarnings: string[]
): NormalizedPlayerT[] => {
  const rows = toObjectValuesArray(raw);
  const out: NormalizedPlayerT[] = [];
  for (const row of rows) {
    try {
      const nameRaw = row.name;
      const name =
        typeof nameRaw === "string" && nameRaw.trim().length > 0
          ? nameRaw.trim()
          : "unknown";
      const sidRaw = row.steamid ?? row.steamId;
      const steamIdStr =
        sidRaw != null && String(sidRaw).trim().length > 0
          ? String(sidRaw).trim()
          : null;
      const team = teamLabelFromNumber(row.team_number ?? row.teamNumber);
      out.push({ steamId: steamIdStr, name, team });
    } catch (err) {
      parserWarnings.push(
        `Player row skipped: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  if (out.length === 0)
    parserWarnings.push(
      "parsePlayerInfo returned no players; identities may be missing for this demo"
    );

  return dedupePlayers(out, parserWarnings);
};

const normalizeKills = (
  events: DemoparserEventRowT[],
  parserWarnings: string[]
): NormalizedKillT[] => {
  const kills: NormalizedKillT[] = [];
  for (const e of events) {
    if (e.event_name !== "player_death") continue;
    try {
      const tick = typeof e.tick === "number" ? e.tick : Number(e.tick);
      const killerName =
        (e.attacker_player_name as string | undefined) ??
        (e.attacker_name as string | undefined) ??
        null;
      const victimName =
        (e.user_player_name as string | undefined) ??
        (e.user_name as string | undefined) ??
        null;
      const weaponRaw = e.weapon;
      const weapon =
        weaponRaw == null ? null : String(weaponRaw).trim() || null;
      kills.push({
        tick: Number.isFinite(tick) ? tick : -1,
        killerName: killerName ?? null,
        victimName: victimName ?? null,
        weapon,
        headshot: Boolean(e.headshot),
      });
    } catch (err) {
      parserWarnings.push(
        `player_death row skipped: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  if (kills.length === 0)
    parserWarnings.push(
      "No player_death events parsed; kill feed empty for this slice"
    );

  kills.sort((a, b) => a.tick - b.tick);
  const invalidTicks = kills.filter((k) => k.tick < 0);
  if (invalidTicks.length > 0)
    parserWarnings.push(
      `Some kills had invalid tick values (${invalidTicks.length}); dropped invalid rows`
    );

  return kills.filter((k) => k.tick >= 0);
};

const normalizeRounds = (
  events: DemoparserEventRowT[],
  parserWarnings: string[]
): NormalizedRoundT[] => {
  const byRound = new Map<
    number,
    { startTick: number | null; endTick: number | null; winner: string | null }
  >();
  for (const e of events) {
    const name = e.event_name;
    if (name !== "round_start" && name !== "round_end") continue;

    const r = Number(e.round);
    if (!Number.isFinite(r)) continue;

    const tick = typeof e.tick === "number" ? e.tick : Number(e.tick);
    const cur = byRound.get(r) ?? {
      startTick: null,
      endTick: null,
      winner: null,
    };
    if (name === "round_start") {
      if (
        cur.startTick !== null &&
        Number.isFinite(tick) &&
        cur.startTick !== tick
      )
        parserWarnings.push(
          `Multiple round_start entries for round ${r}; using latest start tick`
        );

      cur.startTick = Number.isFinite(tick) ? tick : cur.startTick;
    } else {
      cur.endTick = Number.isFinite(tick) ? tick : cur.endTick;
      const w = e.winner;
      cur.winner = w != null ? String(w).trim() || null : null;
    }

    byRound.set(r, cur);
  }

  const rounds: NormalizedRoundT[] = [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, v]) => ({
      roundNumber,
      startTick: v.startTick,
      endTick: v.endTick,
      winner: v.winner,
    }));
  if (rounds.length === 0)
    parserWarnings.push(
      "No round_start/round_end pairings produced rounds; round timeline may be incomplete"
    );

  for (const r of rounds) {
    if (r.startTick === null)
      parserWarnings.push(
        `Round ${r.roundNumber} has no startTick (missing round_start?)`
      );
    if (r.endTick === null)
      parserWarnings.push(
        `Round ${r.roundNumber} has no endTick (missing round_end or demo truncated)`
      );
    if (r.winner === null)
      parserWarnings.push(
        `Round ${r.roundNumber} has no winner (missing round_end winner?)`
      );
  }
  return rounds;
};

const maxTickFromEvents = (events: DemoparserEventRowT[]): number => {
  let m = 0;
  for (const e of events) {
    const t = typeof e.tick === "number" ? e.tick : Number(e.tick);
    if (Number.isFinite(t) && t > m) m = t;
  }
  return m;
};

const maxTickFromTelemetry = (
  events: DemoparserEventRowT[],
  kills: NormalizedKillT[],
  rounds: NormalizedRoundT[]
): number => {
  let m = maxTickFromEvents(events);
  for (const k of kills) {
    if (Number.isFinite(k.tick) && k.tick > m) m = k.tick;
  }
  for (const r of rounds) {
    if (r.startTick != null && Number.isFinite(r.startTick) && r.startTick > m)
      m = r.startTick;
    if (r.endTick != null && Number.isFinite(r.endTick) && r.endTick > m)
      m = r.endTick;
  }
  return m;
};

const inferTickRateAndDuration = (
  buffer: Buffer,
  maxTick: number,
  parserWarnings: string[]
): {
  tickRate: number | null;
  durationTicks: number | null;
  durationSeconds: number | null;
} => {
  if (maxTick < 2) {
    parserWarnings.push(
      "Not enough tick span to infer tick rate (maxTick < 2); tickRate/duration may be null"
    );
    return {
      tickRate: null,
      durationTicks: maxTick || null,
      durationSeconds: null,
    };
  }

  try {
    const rows = parseTicks(
      buffer,
      ["game_time"],
      [1, maxTick],
      null,
      false,
      null,
      null
    ) as Array<{
      tick?: number;
      steamid?: string;
      game_time?: number;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      parserWarnings.push(
        "parseTicks returned no rows for tick-rate sample; tickRate unavailable"
      );
      return { tickRate: null, durationTicks: maxTick, durationSeconds: null };
    }

    const sid0 = rows[0]?.steamid;
    const rLow = rows.find((r) => r.tick === 1 && r.steamid === sid0);
    const rHigh = rows.find((r) => r.tick === maxTick && r.steamid === sid0);
    const fallbackLow = rows.find((r) => r.tick === 1);
    const fallbackHigh = rows.find((r) => r.tick === maxTick);
    const low = rLow ?? fallbackLow;
    const high = rHigh ?? fallbackHigh;
    const t1 = low?.game_time;
    const t2 = high?.game_time;
    if (
      typeof t1 !== "number" ||
      typeof t2 !== "number" ||
      !Number.isFinite(t1) ||
      !Number.isFinite(t2)
    ) {
      parserWarnings.push(
        "Could not read game_time at boundary ticks; tickRate unavailable"
      );
      return { tickRate: null, durationTicks: maxTick, durationSeconds: null };
    }

    const dt = t2 - t1;
    if (dt <= 0) {
      parserWarnings.push("Non-positive game_time delta; tickRate unavailable");
      return { tickRate: null, durationTicks: maxTick, durationSeconds: null };
    }
    const tickRate = (maxTick - 1) / dt;
    if (!Number.isFinite(tickRate) || tickRate <= 0) {
      parserWarnings.push("Computed tickRate invalid; treating as unavailable");
      return { tickRate: null, durationTicks: maxTick, durationSeconds: null };
    }
    const durationSeconds = maxTick / tickRate;
    return { tickRate, durationTicks: maxTick, durationSeconds };
  } catch (err) {
    parserWarnings.push(
      `parseTicks failed while inferring tick rate: ${err instanceof Error ? err.message : String(err)}`
    );
    return { tickRate: null, durationTicks: maxTick, durationSeconds: null };
  }
};

const extractProtocol = (
  header: Record<string, unknown>,
  parserWarnings: string[]
): number | null => {
  try {
    const pv = header.patch_version;
    if (typeof pv === "string" && /^\d+$/.test(pv.trim()))
      return parseInt(pv.trim(), 10);
    if (typeof pv === "number" && Number.isFinite(pv)) return pv;

    parserWarnings.push(
      "Header patch_version missing or non-numeric; protocol left null"
    );
    return null;
  } catch {
    parserWarnings.push("Header protocol (patch_version) could not be read");
    return null;
  }
};

export const parseBufferWithDemoparser2 = (
  buffer: Buffer,
  fileName: string,
  fileSize: number,
  parsedAt: string,
  parserWarnings: string[]
): NormalizedParseResultT => {
  const started = Date.now();
  let header: Record<string, unknown> = {};

  try {
    const h = parseHeader(buffer);
    header =
      h != null && typeof h === "object" ? (h as Record<string, unknown>) : {};
  } catch (err) {
    parserWarnings.push(
      `parseHeader failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return {
      fileName,
      fileSize,
      status: "error",
      mapName: null,
      tickRate: null,
      durationTicks: null,
      durationSeconds: null,
      players: [],
      rounds: [],
      kills: [],
      parserMeta: buildParserMeta(Date.now() - started, null),
      parserWarnings,
      parsedAt,
      errorMessage:
        err instanceof Error ? err.message : "parseHeader failed for demo",
    };
  }

  const mapNameRaw = header.map_name;
  const mapName =
    typeof mapNameRaw === "string" && mapNameRaw.length > 0 ? mapNameRaw : null;
  if (mapName === null) parserWarnings.push("Header map_name missing or empty");

  const protocol = extractProtocol(header, parserWarnings);
  let events: DemoparserEventRowT[] = [];
  try {
    const raw = parseEvents(
      buffer,
      ["player_death", "round_start", "round_end"],
      ["player_name", "player_steamid", "team_num"],
      ["total_rounds_played"]
    );
    events = toObjectValuesArray(raw);
  } catch (err) {
    parserWarnings.push(
      `parseEvents failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (events.length === 0)
    parserWarnings.push(
      "parseEvents returned no rows; demo may be corrupted or unsupported"
    );

  let players: NormalizedPlayerT[] = [];
  try {
    players = normalizePlayers(parsePlayerInfo(buffer), parserWarnings);
  } catch (err) {
    parserWarnings.push(
      `parsePlayerInfo failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const kills = normalizeKills(events, parserWarnings);
  const rounds = normalizeRounds(events, parserWarnings);
  const maxTick = maxTickFromTelemetry(events, kills, rounds);
  if (maxTick === 0)
    parserWarnings.push(
      "Could not determine max tick from events/kills/rounds; tick rate and duration may be null"
    );

  let tickRate: number | null = null;
  let durationTicks: number | null = maxTick > 0 ? maxTick : null;
  let durationSeconds: number | null = null;
  if (maxTick >= 2) {
    const inferred = inferTickRateAndDuration(buffer, maxTick, parserWarnings);
    tickRate = inferred.tickRate;
    durationTicks = inferred.durationTicks;
    durationSeconds = inferred.durationSeconds;
  } else
    parserWarnings.push(
      "Skipped tick-rate inference (maxTick < 2); tickRate/duration left null"
    );

  const parseDurationMs = Date.now() - started;

  return {
    fileName,
    fileSize,
    status: "success",
    mapName,
    tickRate,
    durationTicks,
    durationSeconds,
    players,
    rounds,
    kills,
    parserMeta: buildParserMeta(parseDurationMs, protocol),
    parserWarnings,
    parsedAt,
  };
};
