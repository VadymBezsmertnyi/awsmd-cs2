import "server-only";

// types
import type {
  NormalizedPlayerDamageEventT,
  NormalizedUtilityEventT,
} from "@/app/api/demos/demos.types";
import type { DemoparserEventRowT } from "./demoparser2-game-events";

const MAX_DAMAGE_EVENTS = 3000;
const MAX_UTILITY_EVENTS = 1500;

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

export const normalizePlayerDamageEvents = (
  events: DemoparserEventRowT[],
  parserWarnings: string[]
): NormalizedPlayerDamageEventT[] => {
  const out: NormalizedPlayerDamageEventT[] = [];
  for (const e of events) {
    if (e.event_name !== "player_hurt") continue;
    const tick = num(e.tick);
    if (tick == null || tick < 0) continue;
    const attackerName =
      str(e.attacker_player_name) ?? str(e.attacker_name) ?? null;
    const victimName = str(e.user_player_name) ?? str(e.user_name) ?? null;
    const weapon = str(e.weapon);
    const damage = num(e.dmg_health) ?? num(e.damage) ?? num(e.dmg) ?? null;
    const health = num(e.health);
    const armor = num(e.armor);
    const hitgroup = num(e.hitgroup);
    out.push({
      tick: Math.round(tick),
      attackerName,
      victimName,
      weapon,
      damage,
      health,
      armor,
      hitgroup,
    });
  }
  out.sort((a, b) => a.tick - b.tick);
  if (out.length > MAX_DAMAGE_EVENTS) {
    parserWarnings.push(
      `player_hurt telemetry truncated to ${MAX_DAMAGE_EVENTS} rows (demo had ${out.length})`
    );
    return out.slice(0, MAX_DAMAGE_EVENTS);
  }
  return out;
};

const mapUtilityType = (
  eventName: string
): NormalizedUtilityEventT["utilityType"] | null => {
  switch (eventName) {
    case "hegrenade_detonate":
      return "HE";
    case "flashbang_detonate":
      return "FLASH";
    case "smokegrenade_detonate":
      return "SMOKE";
    case "molotov_detonate":
      return "MOLOTOV";
    case "inferno_startburn":
      return "INFERNO";
    default:
      return null;
  }
};

export const normalizeUtilityEvents = (
  events: DemoparserEventRowT[],
  parserWarnings: string[]
): NormalizedUtilityEventT[] => {
  const out: NormalizedUtilityEventT[] = [];
  for (const e of events) {
    const name = typeof e.event_name === "string" ? e.event_name : "";
    const utilityType = mapUtilityType(name);
    if (utilityType == null) continue;
    const tick = num(e.tick);
    if (tick == null || tick < 0) continue;
    const playerName =
      str(e.user_player_name) ??
      str(e.player_name) ??
      str(e.attacker_player_name) ??
      null;
    const x = num(e.x) ?? num(e.X);
    const y = num(e.y) ?? num(e.Y);
    const z = num(e.z) ?? num(e.Z);
    out.push({
      tick: Math.round(tick),
      playerName,
      utilityType,
      x,
      y,
      z,
    });
  }
  out.sort((a, b) => a.tick - b.tick);
  if (out.length > MAX_UTILITY_EVENTS) {
    parserWarnings.push(
      `Utility event telemetry truncated to ${MAX_UTILITY_EVENTS} rows (demo had ${out.length})`
    );
    return out.slice(0, MAX_UTILITY_EVENTS);
  }
  return out;
};
