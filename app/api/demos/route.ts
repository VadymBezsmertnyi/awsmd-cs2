import { apiHandler } from "@/src/server/api-handler";

import { listDemos } from "./demos.service";

export const GET = async () =>
  apiHandler(async () => {
    return listDemos();
  });
