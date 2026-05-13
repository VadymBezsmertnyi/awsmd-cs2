import "server-only";
import fs from "fs/promises";

// types
import type {
  NormalizedParseResultT,
  ParserMetaT,
} from "@/app/api/demos/demos.types";

// utils
import { getDemofilePackageVersion } from "../parser/demofile-meta";
import { parseDemoBuffer } from "../parser/parse-demo";
import { resolveSampleDemPath } from "../shared/resolve-sample-dem";
import { assertSafeDemFileName } from "../shared/safe-file-name";

const buildParserMeta = (
  parseDurationMs: number,
  protocol: number | null = null
): ParserMetaT => ({
  parser: "demofile",
  parserVersion: getDemofilePackageVersion(),
  parseDurationMs,
  protocol,
});

export const parseSelectedDemo = async (
  fileName: string
): Promise<NormalizedParseResultT> => {
  const outerStarted = Date.now();
  const parsedAt = new Date().toISOString();

  let safeName: string;
  try {
    safeName = assertSafeDemFileName(fileName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      fileName: fileName.trim() || "unknown",
      fileSize: 0,
      status: "error",
      mapName: null,
      tickRate: null,
      durationTicks: null,
      durationSeconds: null,
      players: [],
      rounds: [],
      kills: [],
      parserMeta: buildParserMeta(Date.now() - outerStarted, null),
      parserWarnings: [],
      parsedAt,
      errorMessage: message,
    };
  }

  try {
    const absolutePath = resolveSampleDemPath(safeName);
    const st = await fs.stat(absolutePath);
    const buffer = await fs.readFile(absolutePath);
    return await parseDemoBuffer(buffer, safeName, st.size);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      fileName: safeName,
      fileSize: 0,
      status: "error",
      mapName: null,
      tickRate: null,
      durationTicks: null,
      durationSeconds: null,
      players: [],
      rounds: [],
      kills: [],
      parserMeta: buildParserMeta(Date.now() - outerStarted, null),
      parserWarnings: [],
      parsedAt,
      errorMessage: message,
    };
  }
};
