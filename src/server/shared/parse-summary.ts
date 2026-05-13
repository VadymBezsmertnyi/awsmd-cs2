import "server-only";

import type {
  NormalizedParseResultT,
  ParseSummaryT,
} from "@/app/api/demos/demos.types";

export const attachParseSummary = (
  r: Omit<NormalizedParseResultT, "summary">
): NormalizedParseResultT => {
  const summary: ParseSummaryT = {
    playersCount: r.players.length,
    roundsCount: r.rounds.length,
    killsCount: r.kills.length,
    warningsCount: r.parserWarnings.length,
    isUsableForAnalysis:
      r.status === "success" && r.kills.length > 0 && r.players.length > 0,
  };
  return { ...r, summary };
};
