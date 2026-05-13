import { apiHandler } from "@/src/server/api-handler";

import { postParseAllDemos } from "../demos.service";

export const POST = async () =>
  apiHandler(async () => {
    return postParseAllDemos();
  });
