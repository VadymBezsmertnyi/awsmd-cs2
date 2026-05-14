// schemas
import type { FalseConfidenceDeathTuningT } from "../false-confidence-death.schema";

// types
import type { NormalizedKillT } from "@/app/api/demos/demos.types";
import type { CandidateStateT } from "./types";

// helpers
import {
  detectTradeResponse,
  detectVictimTeamKillInWindow,
  windowTicks,
} from "../false-confidence-death.helpers";

const hasFiniteTickRate = (
  tickRate: number | null | undefined
): tickRate is number =>
  typeof tickRate === "number" && Number.isFinite(tickRate) && tickRate > 0;

export const tradeEvidenceLine = (
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

export const applyNoTradeHeuristic = (
  kills: NormalizedKillT[],
  idx: number,
  victimTeam: string | null,
  attackerName: string | null,
  roster: Map<string, string | null>,
  tickRate: number | null | undefined,
  tuning: FalseConfidenceDeathTuningT,
  out: CandidateStateT
): void => {
  if (victimTeam == null || attackerName == null) return;
  const wTicks = windowTicks(
    tickRate,
    tuning.tradeWindowSeconds,
    tuning.tradeWindowTicksFallback
  );
  if (detectTradeResponse(kills, idx, victimTeam, attackerName, roster, wTicks))
    return;
  out.rawPoints += tuning.weightNoTrade;
  out.flags.noTrade = true;
  const usedSeconds = hasFiniteTickRate(tickRate);
  out.evidence.push(
    tradeEvidenceLine(
      usedSeconds,
      usedSeconds ? tuning.tradeWindowSeconds : wTicks,
      "trade"
    )
  );
};

export const applyKillFeedIsolationHeuristic = (
  kills: NormalizedKillT[],
  idx: number,
  victimTeam: string | null,
  roster: Map<string, string | null>,
  tickRate: number | null | undefined,
  tuning: FalseConfidenceDeathTuningT,
  out: CandidateStateT
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
  out.evidence.push(
    tradeEvidenceLine(
      usedSeconds,
      usedSeconds ? tuning.isolationWindowSeconds : wTicks,
      "isolation"
    )
  );
};
