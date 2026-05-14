import "server-only";
import fs from "fs/promises";

// types
import type {
  NormalizedParseResultT,
  ParserMetaT,
} from "@/app/api/demos/demos.types";

// utils
import { parseDemoBuffer } from "../parser/parse-demo";
import { getDemoparser2PackageVersion } from "../parser/demoparser2-meta";
import { attachParseSummary } from "../shared/parse-summary";
import { writeParsedDemoJson } from "../shared/parsed-output-writer";
import { resolveSampleDemPath } from "../shared/resolve-sample-dem";
import { assertSafeDemFileName } from "../shared/safe-file-name";

export type ParseSelectedDemoResultT = {
  result: NormalizedParseResultT;
  outputFileName: string | null;
};

const buildParserMeta = (
  parseDurationMs: number,
  protocol: number | null = null
): ParserMetaT => ({
  parser: "demoparser2",
  parserVersion: getDemoparser2PackageVersion(),
  parseDurationMs,
  protocol,
});

const persistParsedJson = async (
  safeName: string,
  result: NormalizedParseResultT
): Promise<{
  result: NormalizedParseResultT;
  outputFileName: string | null;
}> => {
  const written = await writeParsedDemoJson(safeName, result);
  if (written.ok) {
    return { result, outputFileName: written.fileName };
  }
  return {
    result: attachParseSummary({
      ...result,
      parserWarnings: [
        ...result.parserWarnings,
        `Failed to write parsed output: ${written.message}`,
      ],
    }),
    outputFileName: null,
  };
};

export const parseSelectedDemo = async (
  fileName: string
): Promise<ParseSelectedDemoResultT> => {
  const outerStarted = Date.now();
  const parsedAt = new Date().toISOString();

  let safeName: string;
  try {
    safeName = assertSafeDemFileName(fileName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result = attachParseSummary({
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
      playerPositions: [],
      playerDamageEvents: [],
      utilityEvents: [],
      parserMeta: buildParserMeta(Date.now() - outerStarted, null),
      parserWarnings: [
        "Parse aborted before reading demo file (invalid file name or path)",
        "Parsed output JSON not written (no safe .dem basename for outputs/)",
      ],
      parsedAt,
      errorMessage: message,
    });
    return { result, outputFileName: null };
  }

  try {
    const absolutePath = resolveSampleDemPath(safeName);
    const st = await fs.stat(absolutePath);
    const buffer = await fs.readFile(absolutePath);
    const parsed = await parseDemoBuffer(buffer, safeName, st.size);
    return persistParsedJson(safeName, parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result = attachParseSummary({
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
      playerPositions: [],
      playerDamageEvents: [],
      utilityEvents: [],
      parserMeta: buildParserMeta(Date.now() - outerStarted, null),
      parserWarnings: [
        "Parse failed while reading demo bytes or running demoparser2 pipeline",
      ],
      parsedAt,
      errorMessage: message,
    });
    return persistParsedJson(safeName, result);
  }
};
