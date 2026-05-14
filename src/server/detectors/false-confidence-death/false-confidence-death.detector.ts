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

const buildShortReason = (f: CandidateStateT["flags"]): string => {
  if (f.spatialSupportGap && f.noTrade)
    return "Ймовірно поєднання просторової відірваності (за вибірковою телеметрією позицій) і відсутності трейду в стрічці вбивств підвищує ризик хибної впевненості; потребує ручної перевірки у відео.";
  if (f.spatialSupportGap)
    return "За доступною телеметрією позицій жертва ймовірно була відносно відірвана від союзників (наближено, не LOS); потребує ручної перевірки у відео.";
  if (f.noTrade && f.earlyRound)
    return "Смерть на початку раунду без трейду на атакувального в межах вікна kill feed; ймовірні ознаки хибної впевненості, потребує ручної перевірки у відео.";
  if (f.noTrade)
    return "У стрічці вбивств не видно трейду на атакувального в обраному вікні; ймовірно підвищений контекстний ризик за доступними сигналами.";
  if (f.earlyRound)
    return "Смерть незабаром після старту раунду за таймінгом demo (не верифіковано позицією на мапі); потребує ручної перевірки у відео.";
  if (f.isolated && f.headshotRifle)
    return "Швидке усунення хедшотом при обмеженій активності союзників у kill feed навколо моменту; ймовірно, не повна картина бою.";
  if (f.headshotRifle)
    return "Швидке усунення хедшотом за kill feed; лише контекстний сигнал, не доказ кута чи очищення позиції.";
  if (f.lowCombatCluster && f.shortDamageTimeline)
    return "Обмежена щільність бою поруч і коротке вікно шкоди за вибірковими подіями; ймовірні ознаки хибної впевненості.";
  return "Підвищений контекстний ризик за евристикою на kill feed і доступній телеметрії (наближено); потребує ручної перевірки у відео.";
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

  const tickRateOk =
    typeof parseResult.tickRate === "number" &&
    Number.isFinite(parseResult.tickRate) &&
    parseResult.tickRate > 0;
  const tickRateForClip: number = tickRateOk
    ? (parseResult.tickRate as number)
    : DEMO_FALLBACK_TICK_RATE;

  const notes: string[] = [
    "Евристика наближена: не стверджуємо точні кути, LOS чи wallbang — лише за доступною телеметрією.",
  ];
  if (ctx.hasPlayerPositions)
    notes.push(
      "Позиції вибіркові; близькість у координатах не дорівнює видимості чи гарантії трейду."
    );
  if (ctx.hasDamageEvents)
    notes.push(
      "Події шкоди неповні відносно повного бойового логу; інтерпретація обмежена."
    );
  if (ctx.hasUtilityEvents)
    notes.push("Гранати: лише час детонації, не якість покриття зони.");
  if (!tickRateOk)
    notes.push(
      `Tick rate у demo відсутній або ненадійний; для кліпів використано умовні ${DEMO_FALLBACK_TICK_RATE} тик/с — час у секундах наближений і потребує ручної перевірки у відео.`
    );

  const evidence = [...c.evidence];
  if (!tickRateOk) {
    evidence.unshift(
      `Точний таймінг обмежений: tick rate відсутній, для секунд застосовано умовні ${DEMO_FALLBACK_TICK_RATE} тик/с; мітки MM:SS наближені, потребує ручної перевірки у відео.`
    );
  }
  const parts: string[] = ["стрічка вбивств", "ростер"];
  if (ctx.hasPlayerPositions) parts.push("вибіркові позиції");
  if (ctx.hasDamageEvents) parts.push("події шкоди");
  if (ctx.hasUtilityEvents) parts.push("детонації утиліти");
  evidence.push(
    `Вхідні дані (рівень ${ctx.telemetryTier}): ${parts.join(", ")} — усе наближено.`
  );

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
    clip,
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
