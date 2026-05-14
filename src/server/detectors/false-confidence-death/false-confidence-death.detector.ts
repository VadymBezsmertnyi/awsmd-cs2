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

// helpers
import {
  buildSortedRounds,
  resolveRoundContainingTick,
} from "@/src/server/shared/demo-timeline";

// helpers
import {
  buildRecommendation,
  buildRosterTeamByLowerName,
  defaultFalseConfidenceDeathTuning,
  detectTradeResponse,
  detectVictimTeamKillInWindow,
  namesMatch,
  normalizeConfidence,
  resolveKillTimeSeconds,
  resolveSeverity,
  secondsIntoRound,
  steamIdForPlayerName,
  tierConfidenceCap,
  weaponRiskWeight,
  windowTicks,
  isEarlyRoundDeath,
} from "./false-confidence-death.helpers";

// constants
import { FALSE_CONFIDENCE_DEATH_DETECTOR_VERSION } from "./false-confidence-death.schema";

type HeuristicFlagsT = {
  noTrade: boolean;
  earlyRound: boolean;
  isolated: boolean;
  headshotRifle: boolean;
};

type CandidateT = {
  kill: NormalizedKillT;
  killIndex: number;
  rawPoints: number;
  evidence: string[];
  flags: HeuristicFlagsT;
};

const hasFiniteTickRate = (
  tickRate: number | null | undefined
): tickRate is number =>
  typeof tickRate === "number" && Number.isFinite(tickRate) && tickRate > 0;

const tradeEvidenceLine = (
  usedSeconds: boolean,
  secondsOrTicks: number,
  label: "trade" | "isolation"
): string => {
  if (usedSeconds) {
    return label === "trade"
      ? `No trade response detected in the kill feed within ${secondsOrTicks.toFixed(1)}s after death (not spatial coverage).`
      : `No teammate kill appeared in the kill feed within ${secondsOrTicks.toFixed(1)}s after death (feed activity only).`;
  }
  return label === "trade"
    ? `No trade response detected in the kill feed within ~${Math.round(secondsOrTicks)} ticks after death (tick rate unavailable for exact seconds).`
    : `No teammate kill appeared in the kill feed within ~${Math.round(secondsOrTicks)} ticks after death (tick rate unavailable for exact seconds).`;
};

const applyNoTradeHeuristic = (
  kills: NormalizedKillT[],
  idx: number,
  victimTeam: string | null,
  attackerName: string | null,
  roster: Map<string, string | null>,
  tickRate: number | null | undefined,
  tuning: typeof defaultFalseConfidenceDeathTuning,
  out: CandidateT
): void => {
  if (victimTeam == null || attackerName == null) return;
  const wTicks = windowTicks(
    tickRate,
    tuning.tradeWindowSeconds,
    tuning.tradeWindowTicksFallback
  );
  const traded = detectTradeResponse(
    kills,
    idx,
    victimTeam,
    attackerName,
    roster,
    wTicks
  );
  if (traded) return;
  out.rawPoints += tuning.weightNoTrade;
  out.flags.noTrade = true;
  const usedSeconds = hasFiniteTickRate(tickRate);
  const secOrTicks = usedSeconds ? tuning.tradeWindowSeconds : wTicks;
  out.evidence.push(tradeEvidenceLine(usedSeconds, secOrTicks, "trade"));
};

const applyEarlyRoundHeuristic = (
  ctx: FalseConfidenceDeathDetectorContextT,
  kill: NormalizedKillT,
  sortedRounds: NormalizedRoundT[],
  tickRate: number | null | undefined,
  tuning: typeof defaultFalseConfidenceDeathTuning,
  out: CandidateT
): void => {
  if (ctx.telemetryTier !== "limited" && ctx.telemetryTier !== "spatial")
    return;
  const round = resolveRoundContainingTick(kill.tick, sortedRounds);
  const sec = round ? secondsIntoRound(kill.tick, round, tickRate) : null;
  if (!isEarlyRoundDeath(sec, tuning.earlyRoundSeconds)) return;
  out.rawPoints += tuning.weightEarlyRound;
  out.flags.earlyRound = true;
  out.evidence.push(
    `Victim died ${sec != null ? `${sec.toFixed(1)}s` : "shortly"} after round start (timing from round_start tick and inferred tick rate).`
  );
};

const applyHeadshotWeaponHeuristic = (
  kill: NormalizedKillT,
  tuning: typeof defaultFalseConfidenceDeathTuning,
  out: CandidateT
): void => {
  const w = weaponRiskWeight(kill.weapon, kill.headshot, tuning);
  if (w.points <= 0 || w.evidenceLine == null) return;
  out.rawPoints += w.points;
  out.flags.headshotRifle = true;
  out.evidence.push(w.evidenceLine);
};

const applyIsolationHeuristic = (
  kills: NormalizedKillT[],
  idx: number,
  victimTeam: string | null,
  roster: Map<string, string | null>,
  tickRate: number | null | undefined,
  tuning: typeof defaultFalseConfidenceDeathTuning,
  out: CandidateT
): void => {
  if (victimTeam == null) return;
  const wTicks = windowTicks(
    tickRate,
    tuning.isolationWindowSeconds,
    tuning.isolationTicksFallback
  );
  if (detectVictimTeamKillInWindow(kills, idx, victimTeam, roster, wTicks))
    return;
  out.rawPoints += tuning.weightIsolation;
  out.flags.isolated = true;
  const usedSeconds = hasFiniteTickRate(tickRate);
  const secOrTicks = usedSeconds ? tuning.isolationWindowSeconds : wTicks;
  out.evidence.push(tradeEvidenceLine(usedSeconds, secOrTicks, "isolation"));
};

const buildShortReason = (flags: HeuristicFlagsT): string => {
  if (flags.noTrade && flags.earlyRound)
    return "Death occurred early in the round with no kill-feed trade on the attacker within the scanned window.";
  if (flags.noTrade)
    return "Death showed no kill-feed trade on the attacker within the scanned window.";
  if (flags.earlyRound)
    return "Death occurred soon after round start by demo timing (not map-position verified).";
  if (flags.isolated && flags.headshotRifle)
    return "Fast headshot elimination with limited nearby teammate kill-feed activity.";
  if (flags.headshotRifle)
    return "Fast headshot elimination from the kill feed; contextual risk only.";
  return "Elevated contextual risk from kill-feed timing and roster signals.";
};

const findingId = (
  fileName: string,
  tick: number,
  victimName: string
): string =>
  createHash("sha256")
    .update(`${fileName}\0${tick}\0${victimName}`)
    .digest("hex")
    .slice(0, 24);

const buildCandidate = (
  parseResult: NormalizedParseResultT,
  ctx: FalseConfidenceDeathDetectorContextT,
  kill: NormalizedKillT,
  killIndex: number,
  roster: Map<string, string | null>,
  sortedRounds: NormalizedRoundT[],
  tuning: typeof defaultFalseConfidenceDeathTuning
): CandidateT => {
  const out: CandidateT = {
    kill,
    killIndex,
    rawPoints: 0,
    evidence: [],
    flags: {
      noTrade: false,
      earlyRound: false,
      isolated: false,
      headshotRifle: false,
    },
  };

  const victimTeam =
    kill.victimName != null
      ? (roster.get(kill.victimName.trim().toLowerCase()) ?? null)
      : null;

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
  applyIsolationHeuristic(
    parseResult.kills,
    killIndex,
    victimTeam,
    roster,
    parseResult.tickRate,
    tuning,
    out
  );

  return out;
};

const candidateToFinding = (
  parseResult: NormalizedParseResultT,
  ctx: FalseConfidenceDeathDetectorContextT,
  c: CandidateT,
  sortedRounds: NormalizedRoundT[],
  tuning: typeof defaultFalseConfidenceDeathTuning,
  tierCap: number
): TacticalFindingT => {
  const { kill } = c;
  const victimName = kill.victimName?.trim() ?? "unknown";
  const confidence = normalizeConfidence(
    c.rawPoints,
    tuning.rawPointsNormalizeDivisor,
    tierCap
  );
  const severity = resolveSeverity(confidence);
  const round = resolveRoundContainingTick(kill.tick, sortedRounds);
  const timeSeconds = resolveKillTimeSeconds(kill.tick, parseResult.tickRate);

  const notes: string[] = [
    "Limited telemetry prevents LOS, angles, or map-geometry verification.",
  ];
  if (ctx.hasPlayerPositions)
    notes.push(
      "Sampled world positions are present in the parse output; this detector version does not analyze distance or exposure from them."
    );
  if (parseResult.tickRate == null || !Number.isFinite(parseResult.tickRate))
    notes.push(
      "Tick rate was unavailable or unreliable; timing evidence may use tick windows instead of seconds."
    );

  const evidence = [...c.evidence];
  const feedParts = ["kill feed", "roster"];
  if (ctx.hasDamageEvents) feedParts.push("damage events present (unused)");
  if (ctx.hasUtilityEvents)
    feedParts.push("utility detonations present (unused)");
  if (ctx.hasPlayerPositions)
    feedParts.push("sampled positions present (unused)");
  evidence.push(
    `Telemetry tier ${ctx.telemetryTier}; inputs: ${feedParts.join(", ")}.`
  );

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

  const candidates: CandidateT[] = [];
  const kills = parseResult.kills;

  for (let i = 0; i < kills.length; i += 1) {
    const kill = kills[i];
    if (kill.victimName == null || kill.victimName.trim().length === 0)
      continue;
    if (namesMatch(kill.killerName, kill.victimName)) continue;
    if (sameTeamKill(kill, roster)) continue;

    const cand = buildCandidate(
      parseResult,
      ctx,
      kill,
      i,
      roster,
      sortedRounds,
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
