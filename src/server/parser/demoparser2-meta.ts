import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

let cachedVersion: string | null = null;

export const getDemoparser2PackageVersion = (): string => {
  if (cachedVersion !== null) return cachedVersion;
  try {
    const pkgPath = join(
      process.cwd(),
      "node_modules",
      "@laihoe",
      "demoparser2",
      "package.json"
    );
    const version = JSON.parse(readFileSync(pkgPath, "utf8"))?.version;
    cachedVersion =
      typeof version === "string" && version.length > 0 ? version : "unknown";
  } catch {
    cachedVersion = "unknown";
  }
  return cachedVersion;
};
