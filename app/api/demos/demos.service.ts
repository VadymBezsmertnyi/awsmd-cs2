import {
  listDemosResponseSchema,
  parseDemoResponseSchema,
} from "./demos.schemas";
import type {
  ListDemosResponseT,
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
  const result = await parseSelectedDemo(input.fileName);
  return parseDemoResponseSchema.parse({ result });
};
