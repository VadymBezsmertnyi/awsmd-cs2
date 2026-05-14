import "server-only";

import { createHash } from "crypto";

// types
import type {
  NormalizedKillT,
  NormalizedParseResultT,
  NormalizedRoundT,
} from "@/app/api/demos/demos.types";
import type { TacticalFindingT } from "../shared/tactical-finding.types";
import type { FalseConfidenceDeathDetectorContextT } from "./false-confidence-death.types";
import { createCandidateState, type CandidateStateT } from "./heuristics/types";

// helpers
import {
  buildRecommendation,
  buildRosterTeamByLowerName,
  defaultFalseConfidenceDeathTuning,
  namesMatch,
  normalizeConfidence,
  normalizeDivisorForTier,
  resolveKillTimeSeconds,
  resolveSeverity,
  steamIdForPlayerName,
  tierConfidenceCap,
} from "./false-confidence-death.helpers";
import { applyEngagementClusterHeuristic } from "./heuristics/clustering";
import { applyDamageTimelineHeuristic } from "./heuristics/damage-timeline";
import { applySpatialSupportHeuristic } from "./heuristics/support-spatial";
import { applyEarlyRoundHeuristic } from "./heuristics/timing";
import {
  applyKillFeedIsolationHeuristic,
  applyNoTradeHeuristic,
} from "./heuristics/trade-feed";
import { applyUtilityContextHeuristic } from "./heuristics/utility-context";
import { applyHeadshotWeaponHeuristic } from "./heuristics/weapon";
import {
  buildSortedRounds,
  resolveRoundContainingTick,
} from "@/src/server/shared/demo-timeline";
import { buildTelemetryIndexes } from "./telemetry-index";

// constants
import { FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION } from "./false-confidence-death.schema";

const findingId = (
  fileName: string,
  tick: number,
  victimName: string
): string =>
  createHash("sha256")
    .update(`${fileName}\0${tick}\0${victimName}`)
    .digest("hex")
    .slice(0, 24);

const buildShortReason = (f: CandidateStateT["flags"]): string => {
  if (f.spatialSupportGap && f.noTrade)
    return "Approximate spatial isolation and kill-feed trade gap both elevated contextual risk.";
  if (f.spatialSupportGap)
    return "Victim appeared spatially isolated from teammates in sampled positional telemetry (approximate).";
  if (f.noTrade && f.earlyRound)
    return "Death occurred early in the round with no kill-feed trade on the attacker within the scanned window.";
  if (f.noTrade)
    return "Death showed no kill-feed trade on the attacker within the scanned window.";
  if (f.earlyRound)
    return "Death occurred soon after round start by demo timing (not map-position verified).";
  if (f.isolated && f.headshotRifle)
    return "Fast headshot elimination with limited nearby teammate kill-feed activity.";
  if (f.headshotRifle)
    return "Fast headshot elimination from the kill feed; contextual risk only.";
  if (f.lowCombatCluster && f.shortDamageTimeline)
    return "Limited nearby fight density with a short sampled damage window before elimination.";
  return "Elevated contextual risk from sampled telemetry and kill-feed signals (heuristic).";
};

const sameTeamKill = (
  kill: NormalizedKillT,
  roster: Map<string, string | null>
): boolean => {
  if (kill.killerName == null || kill.victimName == null) return false;
  const kt = roster.get(kill.killerName.trim().toLowerCase());
  const vt = roster.get(kill.victimName.trim().toLowerCase());
  if (kt == null || vt == null) return false;
  return kt === vt;
};

const runHeuristicsForKill = (
  parseResult: NormalizedParseResultT,
  ctx: FalseConfidenceDeathDetectorContextT,
  kill: NormalizedKillT,
  killIndex: number,
  roster: Map<string, string | null>,
  sortedRounds: NormalizedRoundT[],
  indexes: ReturnType<typeof buildTelemetryIndexes>,
  tuning: typeof defaultFalseConfidenceDeathTuning
): CandidateStateT => {
  const out = createCandidateState(kill, killIndex);
  const victimTeam =
    kill.victimName != null
      ? (roster.get(kill.victimName.trim().toLowerCase()) ?? null)
      : null;
  const victimName = kill.victimName?.trim() ?? "";

  applyNoTradeHeuristic(
    parseResult.kills,
    killIndex,
    victimTeam,
    kill.killerName,
    roster,
    parseResult.tickRate,
    tuning,
    out
  );
  applyEarlyRoundHeuristic(
    ctx,
    kill,
    sortedRounds,
    parseResult.tickRate,
    tuning,
    out
  );
  applyHeadshotWeaponHeuristic(kill, tuning, out);
  applyKillFeedIsolationHeuristic(
    parseResult.kills,
    killIndex,
    victimTeam,
    roster,
    parseResult.tickRate,
    tuning,
    out
  );

  applySpatialSupportHeuristic(
    ctx,
    victimName,
    victimTeam,
    kill.tick,
    parseResult.players,
    roster,
    indexes,
    tuning,
    out
  );

  applyEngagementClusterHeuristic(
    ctx,
    kill.tick,
    victimName,
    victimTeam,
    roster,
    indexes,
    parseResult.tickRate,
    tuning,
    out
  );

  applyUtilityContextHeuristic(
    ctx,
    kill.tick,
    victimTeam,
    roster,
    parseResult.tickRate,
    indexes,
    tuning,
    out
  );

  applyDamageTimelineHeuristic(
    ctx,
    kill.tick,
    victimName,
    parseResult.tickRate,
    indexes,
    tuning,
    out
  );

  return out;
};

const candidateToFinding = (
  parseResult: NormalizedParseResultT,
  ctx: FalseConfidenceDeathDetectorContextT,
  c: CandidateStateT,
  sortedRounds: NormalizedRoundT[],
  tuning: typeof defaultFalseConfidenceDeathTuning,
  tierCap: number
): TacticalFindingT => {
  const { kill } = c;
  const victimName = kill.victimName?.trim() ?? "unknown";
  const divisor = normalizeDivisorForTier(ctx.telemetryTier, tuning);
  const confidence = normalizeConfidence(c.rawPoints, divisor, tierCap);
  const severity = resolveSeverity(confidence);
  const round = resolveRoundContainingTick(kill.tick, sortedRounds);
  const timeSeconds = resolveKillTimeSeconds(kill.tick, parseResult.tickRate);

  const notes: string[] = [
    "Heuristic output is approximate; LOS, exact angles, and wallbang certainty are not inferred.",
  ];
  if (ctx.hasPlayerPositions)
    notes.push(
      "Positions are sparsely sampled; proximity is not visibility or trade guarantee."
    );
  if (ctx.hasDamageEvents)
    notes.push("Damage events are incomplete relative to a full combat log.");
  if (ctx.hasUtilityEvents)
    notes.push(
      "Utility rows reflect detonation timing only, not coverage quality."
    );
  if (parseResult.tickRate == null || !Number.isFinite(parseResult.tickRate))
    notes.push(
      "Tick rate was unavailable or unreliable; timing evidence may use tick windows instead of seconds."
    );

  const evidence = [...c.evidence];
  const parts: string[] = [`Telemetry tier ${ctx.telemetryTier}`];
  parts.push("kill feed", "roster");
  if (ctx.hasPlayerPositions) parts.push("sampled positions");
  if (ctx.hasDamageEvents) parts.push("hurt events");
  if (ctx.hasUtilityEvents) parts.push("utility detonations");
  evidence.push(`Inputs used: ${parts.join(", ")} (all approximate).`);

  return {
    id: findingId(parseResult.fileName, kill.tick, victimName),
    type: "FALSE_CONFIDENCE_DEATH",
    severity,
    confidence: Math.round(confidence * 100) / 100,
    playerName: victimName,
    roundNumber: round?.roundNumber ?? null,
    timeSeconds,
    tick: kill.tick,
    weapon: kill.weapon,
    shortReason: buildShortReason(c.flags),
    evidence,
    recommendation: buildRecommendation(c.flags),
    victimSteamId: steamIdForPlayerName(kill.victimName, parseResult.players),
    attackerName: kill.killerName ?? undefined,
    attackerSteamId: steamIdForPlayerName(kill.killerName, parseResult.players),
    mapName: parseResult.mapName ?? undefined,
    context: {
      telemetryTier: ctx.telemetryTier,
      detectorVersion: FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION,
      notes,
    },
  };
};

/**
 * False Confidence Death — kill-feed + sampled spatial/damage/utility heuristics.
 */
export const runFalseConfidenceDeathDetector = (
  parseResult: NormalizedParseResultT,
  ctx: FalseConfidenceDeathDetectorContextT
): TacticalFindingT[] => {
  if (parseResult.status !== "success" || parseResult.kills.length === 0)
    return [];

  const tuning = defaultFalseConfidenceDeathTuning;
  const roster = buildRosterTeamByLowerName(parseResult.players);
  const tierCap = tierConfidenceCap(ctx.telemetryTier);
  const sortedRounds = buildSortedRounds(parseResult.rounds);
  const indexes = buildTelemetryIndexes(parseResult);

  const candidates: CandidateStateT[] = [];
  const kills = parseResult.kills;

  for (let i = 0; i < kills.length; i += 1) {
    const kill = kills[i];
    if (kill.victimName == null || kill.victimName.trim().length === 0)
      continue;
    if (namesMatch(kill.killerName, kill.victimName)) continue;
    if (sameTeamKill(kill, roster)) continue;

    const cand = runHeuristicsForKill(
      parseResult,
      ctx,
      kill,
      i,
      roster,
      sortedRounds,
      indexes,
      tuning
    );
    if (cand.rawPoints < tuning.emitMinRawPoints) continue;
    candidates.push(cand);
  }

  candidates.sort((a, b) => b.rawPoints - a.rawPoints);
  const sliced = candidates.slice(0, tuning.maxFindingsPerDemo);

  return sliced.map((c) =>
    candidateToFinding(parseResult, ctx, c, sortedRounds, tuning, tierCap)
  );
};
