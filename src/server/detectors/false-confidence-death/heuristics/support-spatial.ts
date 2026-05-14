import type { NormalizedPlayerT } from "@/app/api/demos/demos.types";

// schemas
import type { FalseConfidenceDeathTuningT } from "../false-confidence-death.schema";

// types
import type { FalseConfidenceDeathDetectorContextT } from "../false-confidence-death.types";
import {
  distanceSquared,
  nearestPositionSample,
  type TelemetryIndexesT,
} from "../telemetry-index";
import type { CandidateStateT } from "./types";

const victimKey = (name: string): string => name.trim().toLowerCase();

export const applySpatialSupportHeuristic = (
  ctx: FalseConfidenceDeathDetectorContextT,
  victimName: string,
  victimTeam: string | null,
  deathTick: number,
  players: NormalizedPlayerT[],
  roster: Map<string, string | null>,
  indexes: TelemetryIndexesT,
  tuning: FalseConfidenceDeathTuningT,
  out: CandidateStateT
): void => {
  if (ctx.telemetryTier !== "spatial" || !ctx.hasPlayerPositions) return;
  if (victimTeam == null) return;

  const vKey = victimKey(victimName);
  const victimSamples = indexes.positionsByPlayer.get(vKey);
  const victimAnchor = nearestPositionSample(
    victimSamples,
    deathTick,
    tuning.supportTickTolerance
  );
  if (victimAnchor == null) return;

  const radiusSq = tuning.supportRadiusUnits * tuning.supportRadiusUnits;
  let peersWithSamples = 0;
  let anyWithinRadius = false;

  for (const pl of players) {
    const nk = victimKey(pl.name);
    if (nk.length === 0 || nk === vKey) continue;
    const mateTeam = roster.get(nk);
    if (mateTeam == null || mateTeam !== victimTeam) continue;
    const mateSamples = indexes.positionsByPlayer.get(nk);
    const peer = nearestPositionSample(
      mateSamples,
      deathTick,
      tuning.supportTickTolerance
    );
    if (peer == null) continue;
    peersWithSamples += 1;
    if (distanceSquared(victimAnchor, peer) <= radiusSq) {
      anyWithinRadius = true;
      break;
    }
  }

  if (peersWithSamples === 0) return;
  if (!anyWithinRadius) {
    out.rawPoints += tuning.weightSpatialSupport;
    out.flags.spatialSupportGap = true;
    out.evidence.push(
      `За вибірковими позиціями жертва ймовірно далеко від найближчих союзників (жодного семплу в межах ~${Math.round(tuning.supportRadiusUnits)} одиниць у ±${tuning.supportTickTolerance} тиків від смерті; наближено, не LOS).`
    );
  }
};
