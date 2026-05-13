import "server-only";
import fs from "fs/promises";

// types
import type {
  NormalizedParseResultT,
  ParserMetaT,
} from "@/app/api/demos/demos.types";

// utils
import { getDemoparser2PackageVersion } from "../parser/demoparser2-meta";
import { parseDemoBuffer } from "../parser/parse-demo";
import { resolveSampleDemPath } from "../shared/resolve-sample-dem";
import { assertSafeDemFileName } from "../shared/safe-file-name";

const buildParserMeta = (
  parseDurationMs: number,
  protocol: number | null = null
): ParserMetaT => ({
  parser: "demoparser2",
  parserVersion: getDemoparser2PackageVersion(),
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
      parserWarnings: [
        "Parse aborted before reading demo file (invalid file name or path)",
      ],
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
      parserWarnings: [
        "Parse failed while reading demo bytes or running demoparser2 pipeline",
      ],
      parsedAt,
      errorMessage: message,
    };
  }
};
