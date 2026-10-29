import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isArticulateProfile, isAssessmentSession } from "@articulate/core";

const MAX_PROFILE_BYTES = 1024 * 1024;

export function resolveDataDirectory(directory = process.env.ARTICULATE_DATA_DIR) {
  if (directory === undefined) return path.join(os.homedir(), ".articulate");
  if (typeof directory !== "string" || !path.isAbsolute(directory) || directory.length>4096)
    throw new Error("ARTICULATE_DATA_DIR must be an absolute local directory");
  return directory;
}


/** Device-local JSON store; zero network traffic. One profile per OS user (alpha). */
export class LocalProfileStore {
  constructor(directory = resolveDataDirectory()) {
    this.directory = directory;
    this.file = path.join(directory, "profile.json");
  }

  async load() {
    let stat;
    try { stat = await fs.lstat(this.file); }
    catch (e) { if (e.code === "ENOENT") return null; throw e; }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Profile path must be a regular file");
    if (stat.size > MAX_PROFILE_BYTES) throw new Error("Profile is too large");
    const profile = JSON.parse(await fs.readFile(this.file, "utf8"));
    if (!isArticulateProfile(profile)) throw new Error("Unsupported or invalid Articulate profile");
    return profile;
  }

  serialize(profile) {
    if (!isArticulateProfile(profile)) throw new Error("Refusing to store invalid profile");
    if (!profile.consent.localPersistence) throw new Error("Local persistence consent is disabled");
    const contents = JSON.stringify(profile, null, 2) + "\n";
    if (Buffer.byteLength(contents) > MAX_PROFILE_BYTES) throw new Error("Profile is too large");
    return contents;
  }

  async save(profile) {
    const contents = this.serialize(profile);
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const dirStat = await fs.lstat(this.directory);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error("Storage path must be a real directory");
    // Reject a symlink at the target path.
    try {
      const existing = await fs.lstat(this.file);
      if (!existing.isFile() || existing.isSymbolicLink()) throw new Error("Refusing unsafe profile path");
    } catch (e) { if (e.code !== "ENOENT") throw e; }
    const tmp = path.join(this.directory, ".profile-" + randomUUID() + ".tmp");
    try {
      await fs.writeFile(tmp, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await fs.rename(tmp, this.file);
      await fs.chmod(this.file, 0o600);
    } finally {
      await fs.rm(tmp, { force: true });
    }
  }

  async remove() {
    try { await fs.unlink(this.file); }
    catch (e) { if (e.code !== "ENOENT") throw e; }
  }
}

/**
 * Crash-safe, device-only progress state. Does not store free-text answers
 * or full transcripts, only question index, session IDs and transfer result.
 */
export class LocalAssessmentSessionStore {
  constructor(directory = resolveDataDirectory()) {
    this.directory = directory;
    this.file = path.join(directory, "assessment-session.json");
  }

  async load() {
    let stat;
    try { stat = await fs.lstat(this.file); }
    catch (e) { if (e.code === "ENOENT") return null; throw e; }
    // Allow host-personalized surfaces (still tiny vs profiles; no raw answers).
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 96 * 1024)
      throw new Error("Unsafe or oversized assessment session file");
    const data = JSON.parse(await fs.readFile(this.file, "utf8"));
    if (!isAssessmentSession(data)) throw new Error("Invalid or unsupported assessment session");
    return data;
  }

  serialize(session) {
    if (!isAssessmentSession(session)) throw new Error("Refusing invalid assessment session");
    const contents = JSON.stringify(session, null, 2) + "\n";
    if (Buffer.byteLength(contents) > 96 * 1024) throw new Error("Assessment session is too large");
    return contents;
  }

  async save(session) {
    const contents = this.serialize(session);
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const dirStat = await fs.lstat(this.directory);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error("Unsafe assessment directory");
    try {
      const existing = await fs.lstat(this.file);
      if (!existing.isFile() || existing.isSymbolicLink()) throw new Error("Unsafe assessment session path");
    } catch (e) { if (e.code !== "ENOENT") throw e; }
    const tmp = path.join(this.directory, ".session-" + randomUUID() + ".tmp");
    try {
      await fs.writeFile(tmp, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await fs.rename(tmp, this.file);
      await fs.chmod(this.file, 0o600);
    } finally { await fs.rm(tmp, { force: true }); }
  }

  async remove() {
    try { await fs.unlink(this.file); }
    catch (e) { if (e.code !== "ENOENT") throw e; }
  }
}

export { withLocalProfileLock } from "./lock.js";

// Shared recovery boundary: local consumers wrap reads AND writes.
// Recovery happens under the same cross-process advisory lock.
import { withLocalProfileLock } from "./lock.js";
import { LocalAssessmentCheckpoint } from "./checkpoint.js";

export { LocalAssessmentCheckpoint } from "./checkpoint.js";

export async function withRecoveredLocalProfileLock(directory, operation) {
  return withLocalProfileLock(directory, async () => {
    const checkpoint = new LocalAssessmentCheckpoint(
      directory, new LocalProfileStore(directory), new LocalAssessmentSessionStore(directory)
    );
    await checkpoint.recover();
    return operation();
  });
}
