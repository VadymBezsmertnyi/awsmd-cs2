import "server-only";
import fs from "fs/promises";
import { assertSafeDemFileName } from "../shared/safe-file-name";
import { resolveSampleDemPath } from "../shared/resolve-sample-dem";
import { parseDemoBuffer } from "../parser/parse-demo";
import type { NormalizedParseResult } from "@/contracts/demos";

export async function parseSelectedDemo(
  fileName: string
): Promise<NormalizedParseResult> {
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
      parserWarnings: [],
      parsedAt,
      errorMessage: message,
    };
  }
}
