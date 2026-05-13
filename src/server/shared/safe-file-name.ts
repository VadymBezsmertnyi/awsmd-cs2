import "server-only";
import path from "path";

const MAX_NAME_LEN = 512;

export function assertSafeDemFileName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LEN)
    throw new Error("Invalid demo file name");
  if (trimmed !== path.basename(trimmed))
    throw new Error("Invalid demo file name");
  if (trimmed.includes("..") || /[/\\]/.test(trimmed))
    throw new Error("Invalid demo file name");
  if (!trimmed.toLowerCase().endsWith(".dem"))
    throw new Error("File must have .dem extension");

  return trimmed;
}
