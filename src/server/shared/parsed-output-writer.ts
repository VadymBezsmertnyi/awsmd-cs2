import "server-only";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";

import type { NormalizedParseResultT } from "@/app/api/demos/demos.types";

import { assertSafeDemFileName } from "./safe-file-name";

export const getOutputsDir = (): string => {
  const dir = path.join(process.cwd(), "outputs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return fs.realpathSync(dir);
};

export type WriteParsedDemoJsonResultT =
  | { ok: true; fileName: string }
  | { ok: false; message: string };

export const writeParsedDemoJson = async (
  safeDemBasename: string,
  payload: NormalizedParseResultT
): Promise<WriteParsedDemoJsonResultT> => {
  try {
    const safe = assertSafeDemFileName(safeDemBasename);
    const outName = `${safe}.parsed.json`;
    const root = getOutputsDir();
    const target = path.resolve(root, outName);
    if (!target.startsWith(root + path.sep)) {
      return {
        ok: false,
        message: "Resolved output path outside outputs directory",
      };
    }
    await fsPromises.writeFile(
      target,
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8"
    );
    return { ok: true, fileName: outName };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
};
