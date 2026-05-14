import "server-only";

// types
import type { NormalizedParseResultT } from "@/app/api/demos/demos.types";
import type {
  AnalysisReportT,
  CountsBySeverityT,
  TacticalFindingT,
  TelemetrySummaryT,
  TelemetryTierT,
} from "../detectors/shared/tactical-finding.types";

// services
import { runAllDetectors } from "../detectors/detectors.service";

const emptyCountsBySeverity = (): CountsBySeverityT => ({
  low: 0,
  medium: 0,
  high: 0,
  critical: 0,
});

const countFindingsBySeverity = (
  findings: TacticalFindingT[]
): CountsBySeverityT => {
  const counts = emptyCountsBySeverity();
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return counts;
};

const hasUsableTickRate = (parseResult: NormalizedParseResultT): boolean => {
  const tr = parseResult.tickRate;
  return typeof tr === "number" && Number.isFinite(tr) && tr > 0;
};

const deriveTelemetrySummary = (
  parseResult: NormalizedParseResultT
): TelemetrySummaryT => {
  const hasTickRate = hasUsableTickRate(parseResult);
  const hasRounds = parseResult.rounds.length > 0;
  const hasPlayers = parseResult.players.length > 0;
  const hasKills = parseResult.kills.length > 0;
  const hasPlayerPositions = parseResult.playerPositions.length > 0;
  const hasDamageEvents = parseResult.playerDamageEvents.length > 0;
  const hasUtilityEvents = parseResult.utilityEvents.length > 0;

  let telemetryTier: TelemetryTierT = "kill_only";
  if (hasKills && hasRounds && hasTickRate && hasPlayerPositions)
    telemetryTier = "spatial";
  else if (hasKills && hasRounds && hasTickRate) telemetryTier = "limited";

  return {
    hasTickRate,
    hasRounds,
    hasPlayers,
    hasKills,
    hasPlayerPositions,
    hasDamageEvents,
    hasUtilityEvents,
    telemetryTier,
  };
};

const buildEmptyReport = (generatedAt: string): AnalysisReportT => ({
  findings: [],
  countsBySeverity: emptyCountsBySeverity(),
  generatedAt,
  telemetrySummary: {
    hasTickRate: false,
    hasRounds: false,
    hasPlayers: false,
    hasKills: false,
    hasPlayerPositions: false,
    hasDamageEvents: false,
    hasUtilityEvents: false,
    telemetryTier: "kill_only",
  },
});

/**
 * Builds a typed analysis report for a normalized parse.
 * On non-success parses, returns an empty safe report (callers may still prefer null at API edge).
 */
export const buildAnalysisReport = (
  parseResult: NormalizedParseResultT,
  generatedAt: string
): AnalysisReportT => {
  if (parseResult.status !== "success") {
    return buildEmptyReport(generatedAt);
  }

  const telemetrySummary = deriveTelemetrySummary(parseResult);
  const findings = runAllDetectors(parseResult, telemetrySummary);

  return {
    findings,
    countsBySeverity: countFindingsBySeverity(findings),
    generatedAt,
    telemetrySummary,
  };
};
