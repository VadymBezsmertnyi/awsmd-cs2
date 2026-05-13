import "server-only";
import { DemoFile } from "demofile";
import type { IEventPlayerDeath, IEventRoundEnd } from "demofile";
import fs from "fs/promises";

// types
import type {
  NormalizedKillT,
  NormalizedParseResultT,
  NormalizedPlayerT,
  NormalizedRoundT,
  ParserMetaT,
} from "@/app/api/demos/demos.types";

// utils
import { getDemofilePackageVersion } from "./demofile-meta";

type MutableRoundT = {
  roundNumber: number;
  startTick: number | null;
  endTick: number | null;
  winner: string | null;
};

const safeNum = (n: number): number | null => {
  if (typeof n !== "number" || Number.isNaN(n) || !Number.isFinite(n)) {
    return null;
  }
  return n;
};

const teamFromTeamNumber = (teamNumber: number): string | null => {
  try {
    switch (teamNumber) {
      case 0:
        return "Unassigned";
      case 1:
        return "Spectator";
      case 2:
        return "T";
      case 3:
        return "CT";
      default:
        return `Team_${teamNumber}`;
    }
  } catch {
    return null;
  }
};

const formatRoundWinner = (e: IEventRoundEnd): string | null => {
  try {
    const msg = e.message != null ? String(e.message).trim() : "";
    if (msg.length > 0) return msg;

    return teamFromTeamNumber(e.winner);
  } catch {
    return null;
  }
};

const extractHeaderProtocol = (
  demo: DemoFile,
  parserWarnings: string[]
): number | null => {
  try {
    const raw = demo.header?.protocol;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;

    parserWarnings.push("Demo header protocol unavailable or invalid");
    return null;
  } catch {
    parserWarnings.push("Demo header protocol could not be read");
    return null;
  }
};

const buildParserMeta = (
  parseDurationMs: number,
  protocol: number | null
): ParserMetaT => ({
  parser: "demofile",
  parserVersion: getDemofilePackageVersion(),
  parseDurationMs,
  protocol,
});

const findLastOpenRound = (rounds: MutableRoundT[]): MutableRoundT | null => {
  for (let i = rounds.length - 1; i >= 0; i--) {
    const r = rounds[i];
    if (r && r.endTick === null) return r;
  }
  return null;
};

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
    ) {
      parserWarnings.push(`Merged duplicate player slot: ${key}`);
    }
    map.set(key, pl);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const normalizePlayersFromDemo = (
  demo: DemoFile,
  parserWarnings: string[]
): NormalizedPlayerT[] => {
  const list: NormalizedPlayerT[] = [];
  for (const p of demo.players) {
    try {
      let steamId: string | null = null;
      try {
        const sid = p.steamId;
        const s = sid != null ? String(sid).trim() : "";
        steamId = s.length > 0 ? s : null;
      } catch {
        steamId = null;
      }

      let name = "unknown";
      try {
        const n = p.name != null ? String(p.name).trim() : "";
        name = n.length > 0 ? n : "unknown";
      } catch {
        name = "unknown";
      }

      let team: string | null = null;
      try {
        team = teamFromTeamNumber(p.teamNumber);
      } catch {
        parserWarnings.push("Player team unavailable for one entity");
        team = null;
      }

      list.push({ steamId, name, team });
    } catch (err) {
      parserWarnings.push(
        `Player normalization skipped: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return dedupePlayers(list, parserWarnings);
};

const waitForParse = (
  demo: DemoFile,
  buffer: Buffer,
  parserWarnings: string[]
): Promise<void> => {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      demo.removeAllListeners("end");
      demo.removeAllListeners("error");
      fn();
    };

    demo.once("end", (ev: { error?: Error; incomplete: boolean }) => {
      if (ev.incomplete && !ev.error)
        parserWarnings.push("Demo parsing finished with incomplete=true");
      if (ev.error) finish(() => reject(ev.error));
      else finish(() => resolve());
    });
    demo.once("error", (err: Error) => {
      finish(() => reject(err));
    });

    try {
      demo.parse(buffer);
    } catch (err) {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
    }
  });
};

export const parseDemoBuffer = async (
  buffer: Buffer,
  fileName: string,
  fileSize: number
): Promise<NormalizedParseResultT> => {
  const startedMs = Date.now();
  const parserWarnings: string[] = [];
  const parsedAt = new Date().toISOString();
  const kills: NormalizedKillT[] = [];
  const rounds: MutableRoundT[] = [];

  const demo = new DemoFile();

  demo.on("warning", (w) => {
    parserWarnings.push(w.message);
  });

  demo.gameEvents.on("player_death", (e: IEventPlayerDeath) => {
    try {
      const weaponRaw = e.weapon;
      const weapon =
        weaponRaw == null ? null : String(weaponRaw).trim() || null;
      kills.push({
        tick: demo.currentTick,
        killerName: e.attackerEntity?.name ?? null,
        victimName: e.player?.name ?? null,
        weapon,
        headshot: Boolean(e.headshot),
      });
    } catch (err) {
      parserWarnings.push(
        `player_death normalization: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  demo.gameEvents.on("round_start", () => {
    try {
      const tick = demo.currentTick;
      const prev = rounds[rounds.length - 1];
      if (prev && prev.endTick === null)
        parserWarnings.push(
          "round_start while previous round has no round_end; prior round left open"
        );

      rounds.push({
        roundNumber: rounds.length + 1,
        startTick: tick,
        endTick: null,
        winner: null,
      });
    } catch (err) {
      parserWarnings.push(
        `round_start handling: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  demo.gameEvents.on("round_end", (e: IEventRoundEnd) => {
    try {
      const tick = demo.currentTick;
      const winner = formatRoundWinner(e);
      const open = findLastOpenRound(rounds);
      if (open) {
        open.endTick = tick;
        open.winner = winner;
      } else {
        parserWarnings.push("round_end without matching open round");
        rounds.push({
          roundNumber: rounds.length + 1,
          startTick: null,
          endTick: tick,
          winner,
        });
      }
    } catch (err) {
      parserWarnings.push(
        `round_end handling: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  await waitForParse(demo, buffer, parserWarnings);

  const parseDurationMs = Date.now() - startedMs;
  const protocol = extractHeaderProtocol(demo, parserWarnings);

  const mapName: string | null | undefined = demo.header?.mapName ?? null;
  const tickInterval = demo.tickInterval;
  let tickRate: number | null = safeNum(demo.tickRate);
  if (tickRate === null || Number.isNaN(tickInterval)) {
    tickRate = null;
    parserWarnings.push("Tick rate unavailable or NaN after parse");
  }

  let durationTicks: number | null = safeNum(demo.header?.playbackTicks);
  if (durationTicks === null || durationTicks <= 0) {
    durationTicks = demo.currentTick >= 0 ? demo.currentTick : null;
    if (durationTicks === null)
      parserWarnings.push(
        "Duration ticks unavailable from header or current tick"
      );
  }

  let durationSeconds: number | null = safeNum(demo.header?.playbackTime);
  if (
    (durationSeconds === null || durationSeconds <= 0) &&
    tickRate &&
    durationTicks !== null
  )
    durationSeconds = durationTicks / tickRate;
  if (durationSeconds === null)
    parserWarnings.push("Duration seconds could not be derived reliably");

  let players: NormalizedPlayerT[] = [];
  try {
    players = normalizePlayersFromDemo(demo, parserWarnings);
  } catch (err) {
    parserWarnings.push(
      `Player list normalization failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  kills.sort((a, b) => a.tick - b.tick);

  const normalizedRounds: NormalizedRoundT[] = [...rounds]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((r) => ({
      roundNumber: r.roundNumber,
      startTick: r.startTick,
      endTick: r.endTick,
      winner: r.winner,
    }));

  for (const r of normalizedRounds) {
    if (r.endTick === null)
      parserWarnings.push(
        `Round ${r.roundNumber} has no round_end in demo; endTick left null`
      );
  }

  return {
    fileName,
    fileSize,
    status: "success",
    mapName: mapName ?? null,
    tickRate,
    durationTicks,
    durationSeconds,
    players,
    rounds: normalizedRounds,
    kills,
    parserMeta: buildParserMeta(parseDurationMs, protocol),
    parserWarnings,
    parsedAt,
  };
};

export const parseDemoFromPath = async (
  absolutePath: string,
  fileName: string
): Promise<NormalizedParseResultT> => {
  const st = await fs.stat(absolutePath);
  const buffer = await fs.readFile(absolutePath);
  return parseDemoBuffer(buffer, fileName, st.size);
};
