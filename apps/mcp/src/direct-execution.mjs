import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Node resolves module symlinks, while argv preserves the launch path. */
export function isDirectExecution(moduleUrl, entrypoint = process.argv[1]) {
  if (!entrypoint) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(entrypoint);
  } catch {
    return false;
  }
}
