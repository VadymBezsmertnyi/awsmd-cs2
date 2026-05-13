import "server-only";
import { DemoFile } from "demofile";
import type { IEventPlayerDeath, IEventRoundStart } from "demofile";
import fs from "fs/promises";

// types
import type { NormalizedParseResultT } from "@/app/api/demos/demos.types";

const safeNum = (n: number): number | null => {
  if (typeof n !== "number" || Number.isNaN(n) || !Number.isFinite(n))
    return null;

  return n;
};

const snapshotPlayers = (demo: DemoFile): unknown[] => {
  const out: unknown[] = [];
  for (const p of demo.players) {
    try {
      out.push({
        name: p.name,
        steamId: p.steamId,
        userId: p.userId,
        teamNumber: p.teamNumber,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        score: p.score,
        isFakePlayer: p.isFakePlayer,
        isHltv: p.isHltv,
      });
    } catch (err) {
      out.push({
        snapshotError: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
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
  const parserWarnings: string[] = [];
  const parsedAt = new Date().toISOString();
  const kills: unknown[] = [];
  const rounds: unknown[] = [];

  const demo = new DemoFile();

  demo.on("warning", (w) => {
    parserWarnings.push(w.message);
  });

  demo.gameEvents.on("player_death", (e: IEventPlayerDeath) => {
    try {
      kills.push({
        tick: demo.currentTick,
        weapon: e.weapon,
        headshot: e.headshot,
        victimUserId: e.userid,
        victimName: e.player?.name ?? null,
        attackerUserId: e.attacker,
        attackerName: e.attackerEntity?.name ?? null,
        assisterUserId: e.assister,
        assisterName: e.assisterEntity?.name ?? null,
      });
    } catch (err) {
      parserWarnings.push(
        `player_death serialization: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  demo.gameEvents.on("round_start", (e: IEventRoundStart) => {
    try {
      rounds.push({
        tick: demo.currentTick,
        timelimit: e.timelimit,
        fraglimit: e.fraglimit,
        objective: e.objective,
      });
    } catch (err) {
      parserWarnings.push(
        `round_start serialization: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  await waitForParse(demo, buffer, parserWarnings);

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

  let players: unknown[] = [];
  try {
    players = snapshotPlayers(demo);
  } catch (err) {
    parserWarnings.push(
      `Player snapshot failed: ${err instanceof Error ? err.message : String(err)}`
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
    rounds,
    kills,
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
