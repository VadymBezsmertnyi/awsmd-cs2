import "server-only";

export const DEMO_FALLBACK_TICK_RATE = 64;

export function secondsToTimeLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function tickToSeconds(tick: number, tickRate: number): number {
  if (!Number.isFinite(tick) || !Number.isFinite(tickRate) || tickRate <= 0)
    return 0;
  return tick / tickRate;
}

export type BuildClipWindowParamsT = {
  deathTick: number;
  tickRate: number;
  preSeconds?: number;
  postSeconds?: number;
};

export type ClipWindowT = {
  deathTick: number;
  deathTimeSeconds: number;
  deathTimeLabel: string;
  clipStartSeconds: number;
  clipEndSeconds: number;
  clipStartLabel: string;
  clipEndLabel: string;
  clipDurationSeconds: number;
};

export function buildClipWindow({
  deathTick,
  tickRate,
  preSeconds = 8,
  postSeconds = 5,
}: BuildClipWindowParamsT): ClipWindowT {
  const deathTimeSeconds = tickToSeconds(deathTick, tickRate);
  const clipStartSeconds = Math.max(0, deathTimeSeconds - preSeconds);
  const clipEndSeconds = deathTimeSeconds + postSeconds;
  return {
    deathTick,
    deathTimeSeconds,
    deathTimeLabel: secondsToTimeLabel(deathTimeSeconds),
    clipStartSeconds,
    clipEndSeconds,
    clipStartLabel: secondsToTimeLabel(clipStartSeconds),
    clipEndLabel: secondsToTimeLabel(clipEndSeconds),
    clipDurationSeconds: clipEndSeconds - clipStartSeconds,
  };
}
