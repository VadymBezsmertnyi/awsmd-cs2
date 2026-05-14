import "server-only";

import { parseEvents } from "@laihoe/demoparser2";

export type DemoparserEventRowT = Record<string, unknown>;

export const toObjectValuesArray = (raw: unknown): DemoparserEventRowT[] => {
  if (raw == null || typeof raw !== "object") return [];
  return Object.values(raw as Record<string, unknown>).filter(
    (v): v is DemoparserEventRowT => v != null && typeof v === "object"
  );
};

const PLAYER_EXTRAS = [
  "player_name",
  "player_steamid",
  "team_num",
  "X",
  "Y",
  "Z",
] as const;

const OTHER_EXTRAS = ["total_rounds_played"] as const;

const CORE_EVENTS = ["player_death", "round_start", "round_end"] as const;

const COMBAT_EVENTS = [...CORE_EVENTS, "player_hurt"] as const;

const UTILITY_EVENTS = [
  "hegrenade_detonate",
  "flashbang_detonate",
  "smokegrenade_detonate",
  "molotov_detonate",
  "inferno_startburn",
] as const;

const ALL_EXTENDED = [
  ...CORE_EVENTS,
  "player_hurt",
  ...UTILITY_EVENTS,
] as const;

/**
 * Loads game event rows with progressive fallback if the demo rejects some names.
 * Does not assume every CS2 build exposes identical event tables.
 */
export const loadGameEventRows = (
  buffer: Buffer,
  parserWarnings: string[]
): DemoparserEventRowT[] => {
  const attempts: { label: string; names: readonly string[] }[] = [
    { label: "core+combat+utility", names: ALL_EXTENDED },
    {
      label: "core+combat+utility(no inferno)",
      names: [
        ...CORE_EVENTS,
        "player_hurt",
        ...UTILITY_EVENTS.filter((e) => e !== "inferno_startburn"),
      ],
    },
    { label: "core+combat", names: COMBAT_EVENTS },
    { label: "core", names: CORE_EVENTS },
  ];

  for (const a of attempts) {
    try {
      const raw = parseEvents(
        buffer,
        [...a.names],
        [...PLAYER_EXTRAS],
        [...OTHER_EXTRAS],
        null
      );
      const rows = toObjectValuesArray(raw);
      if (a.label !== "core+combat+utility" && rows.length > 0)
        parserWarnings.push(
          `Extended game events reduced to "${a.label}" (${a.names.length} event types); some telemetry may be missing.`
        );
      return rows;
    } catch (err) {
      parserWarnings.push(
        `parseEvents attempt "${a.label}" failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  parserWarnings.push(
    "parseEvents failed for all fallback tiers; no game event rows"
  );
  return [];
};
