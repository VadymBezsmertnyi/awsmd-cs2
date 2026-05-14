import type { NormalizedKillT } from "@/app/api/demos/demos.types";

export type HeuristicFlagsT = {
  noTrade: boolean;
  earlyRound: boolean;
  isolated: boolean;
  headshotRifle: boolean;
  spatialSupportGap: boolean;
  lowCombatCluster: boolean;
  noAlliedUtilityWindow: boolean;
  shortDamageTimeline: boolean;
  busyCombatContext: boolean;
};

export type CandidateStateT = {
  kill: NormalizedKillT;
  killIndex: number;
  rawPoints: number;
  evidence: string[];
  flags: HeuristicFlagsT;
};

export const createCandidateState = (
  kill: NormalizedKillT,
  killIndex: number
): CandidateStateT => ({
  kill,
  killIndex,
  rawPoints: 0,
  evidence: [],
  flags: {
    noTrade: false,
    earlyRound: false,
    isolated: false,
    headshotRifle: false,
    spatialSupportGap: false,
    lowCombatCluster: false,
    noAlliedUtilityWindow: false,
    shortDamageTimeline: false,
    busyCombatContext: false,
  },
});

export const applyRawDelta = (out: CandidateStateT, delta: number): void => {
  out.rawPoints = Math.max(0, out.rawPoints + delta);
};
