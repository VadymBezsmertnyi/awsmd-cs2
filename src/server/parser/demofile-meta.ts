import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

let cachedDemofileVersion: string | null = null;

export const getDemofilePackageVersion = (): string => {
  if (cachedDemofileVersion !== null) return cachedDemofileVersion;
  try {
    const pkgPath = join(
      process.cwd(),
      "node_modules",
      "demofile",
      "package.json"
    );
    const version = JSON.parse(readFileSync(pkgPath, "utf8"))?.version;
    cachedDemofileVersion =
      typeof version === "string" && version.length > 0 ? version : "unknown";
  } catch {
    cachedDemofileVersion = "unknown";
  }
  return cachedDemofileVersion;
};
