import "server-only";
import fs from "fs";
import path from "path";
import { getSamplesDir } from "./paths";
import { assertSafeDemFileName } from "./safe-file-name";

export function resolveSampleDemPath(fileName: string): string {
  const safeName = assertSafeDemFileName(fileName);
  const root = getSamplesDir();
  const target = path.resolve(root, safeName);
  if (!target.startsWith(root + path.sep))
    throw new Error("Path is outside samples directory");
  if (!fs.existsSync(target) || !fs.statSync(target).isFile())
    throw new Error("Demo file not found");

  return target;
}
