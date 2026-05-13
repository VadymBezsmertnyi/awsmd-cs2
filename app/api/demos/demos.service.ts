import {
  listDemosResponseSchema,
  parseAllDemosResponseSchema,
  parseDemoResponseSchema,
} from "./demos.schemas";
import type {
  ListDemosResponseT,
  ParseAllDemosResponseT,
  ParseDemoRequestT,
  ParseDemoResponseT,
} from "./demos.types";
import { parseSelectedDemo } from "@/src/server/services/demo-parse-service";
import { scanSampleDemos } from "@/src/server/scanner/scan-samples";

export const listDemos = async (): Promise<ListDemosResponseT> => {
  const demos = await scanSampleDemos();
  return listDemosResponseSchema.parse({ demos });
};

export const postParseDemo = async (
  input: ParseDemoRequestT
): Promise<ParseDemoResponseT> => {
  const { result } = await parseSelectedDemo(input.fileName);
  return parseDemoResponseSchema.parse({ result });
};

export const postParseAllDemos = async (): Promise<ParseAllDemosResponseT> => {
  const parsedAt = new Date().toISOString();
  const demos = await scanSampleDemos();
  let successCount = 0;
  let errorCount = 0;
  const results = [];

  for (const d of demos) {
    const { result, outputFileName } = await parseSelectedDemo(d.fileName);
    if (result.status === "success") successCount += 1;
    else errorCount += 1;
    results.push({
      fileName: result.fileName,
      status: result.status,
      summary: result.summary,
      parserWarnings: result.parserWarnings,
      errorMessage: result.errorMessage,
      outputFileName: outputFileName ?? null,
    });
  }

  return parseAllDemosResponseSchema.parse({
    parsedAt,
    total: demos.length,
    successCount,
    errorCount,
    results,
  });
};
