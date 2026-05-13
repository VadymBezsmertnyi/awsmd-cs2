import "server-only";
import fs from "fs";
import path from "path";

export const getSamplesDir = (): string => {
  const dir = path.join(process.cwd(), "samples");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return fs.realpathSync(dir);
};
