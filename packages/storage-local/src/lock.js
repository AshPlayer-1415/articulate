import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const LOCK_NAME = ".articulate-write-lock";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_MS = 300_000;
const MIN_RECLAIM_AGE_MS = 1_500;

/**
 * Cross-process advisory lock for the ONE device-local Articulate profile directory.
 * The atomic mkdir is the ownership primitive (works on Windows/macOS/Linux).
 *
 * ALL local profile/session mutators must participate. The lock is not a
 * security boundary against malware or non-cooperating processes on the device.
 */
export async function withLocalProfileLock(directory, operation, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  staleMs = DEFAULT_STALE_MS,
  retryMs = 40
} = {}) {
  if (typeof directory !== "string" || !path.isAbsolute(directory) ||
      typeof operation !== "function") throw new Error("Absolute storage directory and callback required");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 120_000 ||
      !Number.isInteger(staleMs) || staleMs < MIN_RECLAIM_AGE_MS || staleMs > 3_600_000 ||
      !Number.isInteger(retryMs) || retryMs < 1 || retryMs > 1_000)
    throw new Error("Invalid local lock settings");

  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const root = await fs.lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink())
    throw new Error("Storage directory must be a real directory");

  const lockPath = path.join(directory, LOCK_NAME);
  const ownerFile = path.join(lockPath, "owner.json");
  const token = randomUUID();
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      await fs.mkdir(lockPath, { mode: 0o700 });
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const st = await fs.lstat(lockPath).catch(err => {
        if (err.code === "ENOENT") return null;
        throw err;
      });
      if (!st) continue;
      if (!st.isDirectory() || st.isSymbolicLink())
        throw new Error("Unsafe local profile lock path");
      const age = Date.now() - st.mtimeMs;
      if (age >= MIN_RECLAIM_AGE_MS) {
        let owner;
        try {
          const value = JSON.parse(await fs.readFile(ownerFile, "utf8"));
          if (value && typeof value.pid === "number" && value.pid > 0 &&
              typeof value.hostname === "string" && typeof value.token === "string") owner = value;
        } catch (err) {
          if (err.code !== "ENOENT" && !(err instanceof SyntaxError)) throw err;
        }
        let canReclaim = false;
        if (owner?.hostname === os.hostname()) {
          try { process.kill(owner.pid, 0); }
          catch (err) { if (err.code === "ESRCH") canReclaim = true; }
        } else if (!owner && age > staleMs) {
          // A crashed writer may have died between mkdir and writing owner.json.
          canReclaim = true;
        }
        if (canReclaim) {
          // Confirm ownership did not change during the liveness check.
          const recent = await fs.lstat(lockPath).catch(() => null);
          if (recent && recent.ino === st.ino && recent.mtimeMs === st.mtimeMs) {
            const sameOwner = owner
              ? (await fs.readFile(ownerFile, "utf8").catch(() => "")).includes(`"token": "${owner.token}"`)
              : !(await fs.stat(ownerFile).then(() => true).catch(() => false));
            if (sameOwner) {
              await fs.rm(lockPath, { recursive: true, force: true }).catch(err => {
                if (err.code !== "ENOENT") throw err;
              });
              continue;
            }
          }
        }
      }
      if (Date.now() >= deadline)
        throw new Error("Articulate profile is busy in another local process. Retry shortly; no data was changed.");
      await delay(retryMs);
    }
  }

  let initialized = false;
  try {
    await fs.writeFile(ownerFile, JSON.stringify({
      token, pid: process.pid, hostname: os.hostname(), acquiredAt: new Date().toISOString()
    }, null, 2), { flag: "wx", mode: 0o600 });
    initialized = true;
    return await operation();
  } finally {
    // Only the owner may remove this lock. Preserve a replacement lock, if any.
    if (initialized) {
      const current = await fs.readFile(ownerFile, "utf8").then(JSON.parse).catch(() => null);
      if (current?.token === token)
        await fs.rm(lockPath, { recursive: true, force: true });
    } else {
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  }
}
