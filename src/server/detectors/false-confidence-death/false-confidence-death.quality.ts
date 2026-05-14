import "server-only";

// types
import type {
  NormalizedKillT,
  NormalizedParseResultT,
  NormalizedRoundT,
} from "@/app/api/demos/demos.types";
import type { CandidateStateT } from "./heuristics/types";
import type { FalseConfidenceDeathTuningT } from "./false-confidence-death.schema";

// helpers
import {
  buildRosterTeamByLowerName,
  detectTradeResponse,
  namesMatch,
  windowTicks,
} from "./false-confidence-death.helpers";
import { resolveRoundContainingTick } from "@/src/server/shared/demo-timeline";

export const DEATH_QUALITY_THRESHOLDS = {
  minBadDeathScore: 3,
  maxPositiveImpactScore: 2,
  minVideoConfidence: 0.65,
  maxVideoMoments: 5,
  chaoticClusterKillsMin: 6,
  recentVictimKillWindowSec: 10,
} as const;

const normTeamKey = (t: string | null | undefined): string | null => {
  if (t == null) return null;
  const s = t.trim().toLowerCase();
  if (s.length === 0) return null;
  if (s === "t" || s.startsWith("terror")) return "t";
  if (s === "ct" || s.includes("counter")) return "ct";
  return s;
};

const countKillsInTickRange = (
  kills: NormalizedKillT[],
  t0: number,
  t1: number
): number => {
  let n = 0;
  for (const k of kills) {
    if (!Number.isFinite(k.tick)) continue;
    if (k.tick < t0 || k.tick > t1) continue;
    n += 1;
  }
  return n;
};

export type DeathQualityContextT = {
  victimTeam: string | null;
  roundWinner: string | null;
  victimTeamWonRound: boolean;
  victimKillsBeforeDeathInRound: number;
  victimKilledRecentlyBeforeDeath: boolean;
  victimHadImpactBeforeDeath: boolean;
  deathWasTraded: boolean;
  nearbyKillClusterSize: number;
  isChaoticFight: boolean;
  positiveImpactScore: number;
  badDeathScore: number;
  suppressReason: string[];
  passFilter: boolean;
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

export const computeDeathQualityContext = (
  parseResult: NormalizedParseResultT,
  killIndex: number,
  candidate: CandidateStateT,
  sortedRounds: NormalizedRoundT[],
  tuning: FalseConfidenceDeathTuningT
): DeathQualityContextT => {
  const kill = parseResult.kills[killIndex];
  const roster = buildRosterTeamByLowerName(parseResult.players);
  const victimName = kill.victimName?.trim() ?? "";
  const vKey = victimName.toLowerCase();
  const victimTeam = victimName.length > 0 ? (roster.get(vKey) ?? null) : null;

  const round = resolveRoundContainingTick(kill.tick, sortedRounds);
  const roundWinnerRaw = round?.winner;
  const roundWinner =
    roundWinnerRaw != null && String(roundWinnerRaw).trim().length > 0
      ? String(roundWinnerRaw).trim()
      : null;
  const vk = normTeamKey(victimTeam);
  const wk = normTeamKey(roundWinner);
  const victimTeamWonRound =
    vk != null && wk != null && vk === wk && roundWinner != null;

  const deathTick = kill.tick;
  const roundStart = round?.startTick;
  let victimKillsBeforeDeathInRound = 0;
  if (
    round != null &&
    roundStart != null &&
    Number.isFinite(roundStart) &&
    victimName.length > 0
  ) {
    for (const k of parseResult.kills) {
      if (!Number.isFinite(k.tick) || k.tick >= deathTick) continue;
      if (k.tick < roundStart) continue;
      if (!namesMatch(k.killerName, victimName)) continue;
      if (namesMatch(k.killerName, k.victimName)) continue;
      if (sameTeamKill(k, roster)) continue;
      victimKillsBeforeDeathInRound += 1;
    }
  }

  const tr = parseResult.tickRate;
  const recentTicks = windowTicks(
    tr,
    DEATH_QUALITY_THRESHOLDS.recentVictimKillWindowSec,
    640
  );
  let victimKilledRecentlyBeforeDeath = false;
  if (victimName.length > 0) {
    const tRecent0 = deathTick - recentTicks;
    for (const k of parseResult.kills) {
      if (!Number.isFinite(k.tick) || k.tick >= deathTick) continue;
      if (k.tick < tRecent0) continue;
      if (!namesMatch(k.killerName, victimName)) continue;
      if (namesMatch(k.killerName, k.victimName)) continue;
      if (sameTeamKill(k, roster)) continue;
      victimKilledRecentlyBeforeDeath = true;
      break;
    }
  }

  const victimHadImpactBeforeDeath =
    victimKillsBeforeDeathInRound >= 1 || victimKilledRecentlyBeforeDeath;

  const victimTeamForTrade = victimTeam ?? roster.get(vKey) ?? null;
  const deathWasTraded = detectTradeResponse(
    parseResult.kills,
    killIndex,
    victimTeamForTrade,
    kill.killerName,
    roster,
    windowTicks(tr, tuning.tradeWindowSeconds, tuning.tradeWindowTicksFallback)
  );

  const before = windowTicks(
    tr,
    tuning.clusterWindowSeconds,
    tuning.clusterTicksFallback
  );
  const after = Math.max(1, Math.round(before * 0.2));
  const t0 = deathTick - before;
  const t1 = deathTick + after;
  const nearbyKillClusterSize = countKillsInTickRange(
    parseResult.kills,
    t0,
    t1
  );
  const isChaoticFight =
    nearbyKillClusterSize >= DEATH_QUALITY_THRESHOLDS.chaoticClusterKillsMin;

  const f = candidate.flags;

  let badDeathScore =
    (f.noTrade ? 1 : 0) +
    (f.noAlliedUtilityWindow ? 1 : 0) +
    (f.shortDamageTimeline ? 1 : 0) +
    (f.earlyRound ? 1 : 0) +
    (f.lowCombatCluster ? 1 : 0) +
    (f.headshotRifle ? 1 : 0) +
    (f.spatialSupportGap || f.isolated ? 1 : 0);

  if (deathWasTraded) badDeathScore -= 2;
  if (victimKillsBeforeDeathInRound >= 1) badDeathScore -= 1;
  if (victimKilledRecentlyBeforeDeath) badDeathScore -= 1;
  if (isChaoticFight) badDeathScore -= 2;
  if (victimTeamWonRound) badDeathScore -= 1;
  badDeathScore = Math.max(0, Math.min(10, Math.round(badDeathScore)));

  let positiveImpactScore = 0;
  if (victimKillsBeforeDeathInRound >= 1) positiveImpactScore += 1;
  if (victimKilledRecentlyBeforeDeath) positiveImpactScore += 1;
  if (victimTeamWonRound) positiveImpactScore += 2;
  if (deathWasTraded) positiveImpactScore += 1;
  positiveImpactScore = Math.min(6, positiveImpactScore);

  const suppressReason: string[] = [];

  if (victimKillsBeforeDeathInRound >= 2) {
    suppressReason.push(
      "Два+ фраги в раунді до смерті — зазвичай корисний entry, не «порожня» смерть."
    );
  }
  if (victimKilledRecentlyBeforeDeath && deathWasTraded) {
    suppressReason.push(
      "Щойно зробив фраг, трейд швидко відігрався — типова обмінна смерть."
    );
  }
  if (isChaoticFight && victimTeamWonRound) {
    suppressReason.push(
      "Густа перестрілка й раунд виграно — смерть ймовірно в контексті execute/retake."
    );
  }

  let passFilter = suppressReason.length === 0;

  if (
    passFilter &&
    (badDeathScore < DEATH_QUALITY_THRESHOLDS.minBadDeathScore ||
      positiveImpactScore > DEATH_QUALITY_THRESHOLDS.maxPositiveImpactScore)
  ) {
    passFilter = false;
    if (badDeathScore < DEATH_QUALITY_THRESHOLDS.minBadDeathScore) {
      suppressReason.push(
        "Замало ознак «зайвої» смерті за контекстом раунду та kill feed."
      );
    }
    if (positiveImpactScore > DEATH_QUALITY_THRESHOLDS.maxPositiveImpactScore) {
      suppressReason.push(
        "Занадто багато позитивного контексту (фраги, трейд або виграний раунд)."
      );
    }
  }

  return {
    victimTeam,
    roundWinner: roundWinner ?? null,
    victimTeamWonRound,
    victimKillsBeforeDeathInRound,
    victimKilledRecentlyBeforeDeath,
    victimHadImpactBeforeDeath,
    deathWasTraded,
    nearbyKillClusterSize,
    isChaoticFight,
    positiveImpactScore,
    badDeathScore,
    suppressReason,
    passFilter,
  };
};

export const applyRoundWinConfidenceFactor = (
  confidence: number,
  q: DeathQualityContextT
): number => {
  let c = confidence;
  if (q.victimTeamWonRound && q.badDeathScore < 6) c *= 0.82;
  if (q.isChaoticFight && !q.victimTeamWonRound) c *= 0.9;
  return Math.round(Math.min(1, Math.max(0, c)) * 100) / 100;
};
