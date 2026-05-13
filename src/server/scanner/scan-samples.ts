import "server-only";
import fs from "fs/promises";
import path from "path";
import { getSamplesDir } from "../shared/paths";
import type { DemoFileEntry } from "@/contracts/demos";

export async function scanSampleDemos(): Promise<DemoFileEntry[]> {
  const root = getSamplesDir();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const demos: DemoFileEntry[] = [];

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
}
