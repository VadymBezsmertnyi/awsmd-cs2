import "server-only";
import { scanSampleDemos } from "../scanner/scan-samples";
import { demosListResponseSchema } from "@/contracts/demos";

export async function listSampleDemos() {
  const demos = await scanSampleDemos();
  return demosListResponseSchema.parse({ demos });
}
