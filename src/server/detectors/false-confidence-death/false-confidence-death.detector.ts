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
import {
  buildConciseEvidenceLines,
  buildShortReasonFromTags,
  deriveFalseConfidenceMistakeTags,
  filterMistakeTagsForQuality,
  FALSE_CONFIDENCE_SHORT_RECOMMENDATION_UK,
  FALSE_CONFIDENCE_VERDICT_UK,
} from "./false-confidence-death.mistake-tags";
import {
  applyRoundWinConfidenceFactor,
  computeDeathQualityContext,
  type DeathQualityContextT,
} from "./false-confidence-death.quality";
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
import {
  buildClipWindow,
  DEMO_FALLBACK_TICK_RATE,
} from "@/src/server/shared/timecode.helpers";
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
  const skipKillFeedIsolation =
    ctx.telemetryTier === "spatial" && ctx.hasPlayerPositions;
  if (!skipKillFeedIsolation)
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

const sortFindingsByQuality = (
  a: TacticalFindingT,
  b: TacticalFindingT
): number => {
  const bd = (b.quality?.badDeathScore ?? 0) - (a.quality?.badDeathScore ?? 0);
  if (bd !== 0) return bd;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  return (a.clip?.clipStartSeconds ?? 0) - (b.clip?.clipStartSeconds ?? 0);
};

const candidateToFinding = (
  parseResult: NormalizedParseResultT,
  ctx: FalseConfidenceDeathDetectorContextT,
  c: CandidateStateT,
  sortedRounds: NormalizedRoundT[],
  tuning: typeof defaultFalseConfidenceDeathTuning,
  tierCap: number,
  q: DeathQualityContextT
): TacticalFindingT => {
  const { kill } = c;
  const victimName = kill.victimName?.trim() ?? "unknown";
  const divisor = normalizeDivisorForTier(ctx.telemetryTier, tuning);
  let confidence = normalizeConfidence(c.rawPoints, divisor, tierCap);
  confidence = applyRoundWinConfidenceFactor(confidence, q);
  const severity = resolveSeverity(confidence);
  const round = resolveRoundContainingTick(kill.tick, sortedRounds);
  const timeSeconds = resolveKillTimeSeconds(kill.tick, parseResult.tickRate);

  const tickRateOk =
    typeof parseResult.tickRate === "number" &&
    Number.isFinite(parseResult.tickRate) &&
    parseResult.tickRate > 0;
  const tickRateForClip: number = tickRateOk
    ? (parseResult.tickRate as number)
    : DEMO_FALLBACK_TICK_RATE;

  const mistakeTags = filterMistakeTagsForQuality(
    deriveFalseConfidenceMistakeTags(c.flags),
    q.deathWasTraded
  );
  const shortReason = buildShortReasonFromTags(mistakeTags);
  let evidence = buildConciseEvidenceLines(mistakeTags);
  if (evidence.length === 0)
    evidence = ["Рішення перед смертю виглядало необережним."];
  if (!tickRateOk)
    evidence = [
      ...evidence,
      "Таймінг по demo краще перевірити на відеозапису.",
    ];

  const notes: string[] = [];
  if (!tickRateOk)
    notes.push("Tick rate у demo невідомий — секунди для кліпа наближені.");

  const clip = buildClipWindow({
    deathTick: kill.tick,
    tickRate: tickRateForClip,
    preSeconds: 8,
    postSeconds: 5,
  });

  return {
    id: findingId(parseResult.fileName, kill.tick, victimName),
    type: "FALSE_CONFIDENCE_DEATH",
    severity,
    confidence,
    playerName: victimName,
    roundNumber: round?.roundNumber ?? null,
    timeSeconds,
    tick: kill.tick,
    weapon: kill.weapon,
    shortReason,
    evidence,
    recommendation: FALSE_CONFIDENCE_SHORT_RECOMMENDATION_UK,
    verdict: FALSE_CONFIDENCE_VERDICT_UK,
    mistakeTags,
    quality: {
      badDeathScore: q.badDeathScore,
      positiveImpactScore: q.positiveImpactScore,
      victimTeamWonRound: q.victimTeamWonRound,
      victimKillsBeforeDeathInRound: q.victimKillsBeforeDeathInRound,
      deathWasTraded: q.deathWasTraded,
      isChaoticFight: q.isChaoticFight,
    },
    victimSteamId: steamIdForPlayerName(kill.victimName, parseResult.players),
    attackerName: kill.killerName ?? undefined,
    attackerSteamId: steamIdForPlayerName(kill.killerName, parseResult.players),
    mapName: parseResult.mapName ?? undefined,
    context: {
      telemetryTier: ctx.telemetryTier,
      detectorVersion: FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION,
      notes: notes.length > 0 ? notes : undefined,
    },
    clip,
  };
};

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
  const kills = parseResult.kills;

  const prelim: {
    cand: CandidateStateT;
    q: DeathQualityContextT;
  }[] = [];

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
    const q = computeDeathQualityContext(
      parseResult,
      i,
      cand,
      sortedRounds,
      tuning
    );
    if (!q.passFilter) continue;
    prelim.push({ cand, q });
  }

  const findings = prelim.map(({ cand, q }) =>
    candidateToFinding(parseResult, ctx, cand, sortedRounds, tuning, tierCap, q)
  );
  findings.sort(sortFindingsByQuality);

  return findings.slice(0, tuning.maxFindingsPerDemo);
};
