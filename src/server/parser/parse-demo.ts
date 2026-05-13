import "server-only";
import fs from "fs/promises";

import type { NormalizedParseResultT } from "@/app/api/demos/demos.types";

import { parseBufferWithDemoparser2 } from "./adapters/demoparser2.adapter";
import { getDemoparser2PackageVersion } from "./demoparser2-meta";
import { attachParseSummary } from "../shared/parse-summary";

export const parseDemoBuffer = async (
  buffer: Buffer,
  fileName: string,
  fileSize: number
): Promise<NormalizedParseResultT> => {
  const parserWarnings: string[] = [];
  const parsedAt = new Date().toISOString();
  const started = Date.now();
  try {
    return parseBufferWithDemoparser2(
      buffer,
      fileName,
      fileSize,
      parsedAt,
      parserWarnings
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    parserWarnings.push(`Unhandled demoparser2 pipeline error: ${message}`);
    return attachParseSummary({
      fileName,
      fileSize,
      status: "error",
      mapName: null,
      tickRate: null,
      durationTicks: null,
      durationSeconds: null,
      players: [],
      rounds: [],
      kills: [],
      parserMeta: {
        parser: "demoparser2",
        parserVersion: getDemoparser2PackageVersion(),
        parseDurationMs: Date.now() - started,
        protocol: null,
      },
      parserWarnings,
      parsedAt,
      errorMessage: message,
    });
  }
};

export const parseDemoFromPath = async (
  absolutePath: string,
  fileName: string
): Promise<NormalizedParseResultT> => {
  const st = await fs.stat(absolutePath);
  const buffer = await fs.readFile(absolutePath);
  return parseDemoBuffer(buffer, fileName, st.size);
};
