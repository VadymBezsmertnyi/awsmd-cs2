// schemas
import { falseConfidenceDeathTuningSchema } from "./false-confidence-death.schema";

// types
import type {
  NormalizedKillT,
  NormalizedPlayerT,
  NormalizedRoundT,
} from "@/app/api/demos/demos.types";
import type { FalseConfidenceDeathTuningT } from "./false-confidence-death.schema";
import type { FindingSeverityT } from "../shared/tactical-finding.types";

export const defaultFalseConfidenceDeathTuning: FalseConfidenceDeathTuningT =
  falseConfidenceDeathTuningSchema.parse({});

const normalizeWeaponId = (weapon: string | null): string | null => {
  if (weapon == null) return null;
  const t = weapon.trim().toLowerCase();
  if (t.length === 0) return null;
  return t.startsWith("weapon_") ? t.slice("weapon_".length) : t;
};

const HEADSHOT_WEAPON_FRAGMENTS = [
  "ak47",
  "m4a1",
  "m4a1_silencer",
  "famas",
  "galil",
  "galilar",
  "aug",
  "sg556",
  "awp",
  "ssg08",
  "scar20",
  "g3sg1",
  "deagle",
  "revolver",
] as const;

export const buildRosterTeamByLowerName = (
  players: NormalizedPlayerT[]
): Map<string, string | null> => {
  const m = new Map<string, string | null>();
  for (const p of players) {
    const key = p.name.trim().toLowerCase();
    if (key.length === 0) continue;
    if (!m.has(key)) m.set(key, p.team);
  }
  return m;
};

export const namesMatch = (a: string | null, b: string | null): boolean => {
  if (a == null || b == null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
};

export const resolveRoundForTick = (
  tick: number,
  rounds: NormalizedRoundT[]
): NormalizedRoundT | null => {
  if (!Number.isFinite(tick) || rounds.length === 0) return null;
  const sorted = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  for (const r of sorted) {
    if (r.startTick == null || !Number.isFinite(r.startTick)) continue;
    if (tick < r.startTick) continue;
    if (r.endTick != null && Number.isFinite(r.endTick) && tick > r.endTick)
      continue;
    return r;
  }
  return null;
};

export const resolveKillTimeSeconds = (
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

export const secondsIntoRound = (
  killTick: number,
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
  const dt = killTick - round.startTick;
  if (!Number.isFinite(dt) || dt < 0) return null;
  return dt / tickRate;
};

export const windowTicks = (
  tickRate: number | null | undefined,
  seconds: number,
  ticksFallback: number
): number => {
  if (typeof tickRate === "number" && Number.isFinite(tickRate) && tickRate > 0)
    return Math.max(1, Math.round(seconds * tickRate));
  return Math.max(1, Math.round(ticksFallback));
};

export const detectTradeResponse = (
  kills: NormalizedKillT[],
  deathIndex: number,
  victimTeam: string | null,
  attackerName: string | null,
  roster: Map<string, string | null>,
  windowTicksAfter: number
): boolean => {
  if (victimTeam == null || attackerName == null) return false;
  const deathTick = kills[deathIndex]?.tick;
  if (!Number.isFinite(deathTick)) return false;
  const limit = deathTick + windowTicksAfter;
  for (let j = deathIndex + 1; j < kills.length; j += 1) {
    const k = kills[j];
    if (!Number.isFinite(k.tick) || k.tick > limit) break;
    if (!namesMatch(k.victimName, attackerName)) continue;
    const killerTeam =
      k.killerName != null
        ? roster.get(k.killerName.trim().toLowerCase())
        : null;
    if (killerTeam != null && killerTeam === victimTeam) return true;
  }
  return false;
};

export const detectVictimTeamKillInWindow = (
  kills: NormalizedKillT[],
  deathIndex: number,
  victimTeam: string | null,
  roster: Map<string, string | null>,
  windowTicksAfter: number
): boolean => {
  if (victimTeam == null) return false;
  const deathTick = kills[deathIndex]?.tick;
  if (!Number.isFinite(deathTick)) return false;
  const limit = deathTick + windowTicksAfter;
  for (let j = deathIndex + 1; j < kills.length; j += 1) {
    const k = kills[j];
    if (!Number.isFinite(k.tick) || k.tick > limit) break;
    if (k.killerName == null) continue;
    const killerTeam = roster.get(k.killerName.trim().toLowerCase());
    if (killerTeam != null && killerTeam === victimTeam) return true;
  }
  return false;
};

export const weaponRiskWeight = (
  weapon: string | null,
  headshot: boolean,
  tuning: FalseConfidenceDeathTuningT
): { points: number; evidenceLine: string | null } => {
  if (!headshot) return { points: 0, evidenceLine: null };
  const id = normalizeWeaponId(weapon);
  if (id == null) return { points: 0, evidenceLine: null };
  const hit = HEADSHOT_WEAPON_FRAGMENTS.some((frag) => id.includes(frag));
  if (!hit) return { points: 0, evidenceLine: null };
  const label = weapon?.trim() || id;
  return {
    points: tuning.weightHeadshotRifle,
    evidenceLine: `Headshot elimination with ${label} (kill feed only).`,
  };
};

export const isEarlyRoundDeath = (
  secondsIntoRoundValue: number | null,
  thresholdSec: number
): boolean =>
  secondsIntoRoundValue != null &&
  Number.isFinite(secondsIntoRoundValue) &&
  secondsIntoRoundValue >= 0 &&
  secondsIntoRoundValue <= thresholdSec;

export const normalizeConfidence = (
  rawPoints: number,
  divisor: number,
  tierCap: number
): number => {
  if (!Number.isFinite(rawPoints) || rawPoints <= 0) return 0;
  if (!Number.isFinite(divisor) || divisor <= 0) return 0;
  const intrinsic = Math.min(1, rawPoints / divisor);
  return Math.min(tierCap, intrinsic);
};

export const resolveSeverity = (confidence: number): FindingSeverityT => {
  if (!Number.isFinite(confidence) || confidence < 0.25) return "low";
  if (confidence < 0.5) return "medium";
  return "high";
};

export const buildRecommendation = (flags: {
  noTrade: boolean;
  earlyRound: boolean;
  isolated: boolean;
  headshotRifle: boolean;
}): string => {
  const parts: string[] = [];
  if (flags.noTrade)
    parts.push(
      "Consider delaying solo engagement until teammate support is available for immediate trade potential in the kill feed."
    );
  if (flags.earlyRound)
    parts.push(
      "Use additional information gathering before committing to early-round duels."
    );
  if (flags.isolated && !flags.noTrade)
    parts.push(
      "Avoid isolated engagements without immediate refrag potential visible in the kill feed window."
    );
  if (flags.headshotRifle && parts.length === 0)
    parts.push(
      "Treat fast eliminations as higher risk; confirm team coverage before taking similar duels."
    );
  if (parts.length === 0)
    return "Review timing and team support using available demo signals; positional details are not available from telemetry.";
  return parts.join(" ");
};

export const tierConfidenceCap = (
  telemetryTier: "kill_only" | "limited" | "full"
): number => {
  if (telemetryTier === "limited" || telemetryTier === "full") return 0.65;
  return 0.35;
};

export const steamIdForPlayerName = (
  name: string | null,
  players: NormalizedPlayerT[]
): string | undefined => {
  if (name == null || name.trim().length === 0) return undefined;
  const key = name.trim().toLowerCase();
  for (const p of players) {
    if (p.name.trim().toLowerCase() === key && p.steamId)
      return p.steamId ?? undefined;
  }
  return undefined;
};
