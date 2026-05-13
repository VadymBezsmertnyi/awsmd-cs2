import "server-only";
import fs from "fs/promises";
import path from "path";

// types
import type { DemoFileT } from "@/app/api/demos/demos.types";

// utils
import { getSamplesDir } from "../shared/paths";

export const scanSampleDemos = async (): Promise<DemoFileT[]> => {
  const root = getSamplesDir();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const demos: DemoFileT[] = [];

  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.toLowerCase().endsWith(".dem")) continue;

    const full = path.join(root, ent.name);
    const st = await fs.stat(full);
    demos.push({
      id: ent.name,
      fileName: ent.name,
      size: st.size,
      modifiedAt: st.mtime.toISOString(),
    });
  }

  demos.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return demos;
};
