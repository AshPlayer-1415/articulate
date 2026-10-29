import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { isArticulateProfile, isAssessmentSession } from "@articulate/core";

const JOURNAL_NAME = ".assessment-checkpoint.json";
const MAX_JOURNAL_BYTES = 1_200_000;

/**
 * Recoverable write-ahead journal for the two existing JSON stores.
 *
 * Caller MUST already hold withLocalProfileLock for the entire operation.
 * A fully validated journal is atomically published BEFORE changing either
 * store. Recovery replays exactly the recorded profile+session pair.
 *
 * This protects against a process crash between the two saves. It does not
 * promise power-loss durability on all filesystems or defend against malware.
 */
export class LocalAssessmentCheckpoint {
  constructor(directory, profileStore, sessionStore, hooks = {}) {
    if (!path.isAbsolute(directory)) throw new Error("Checkpoint needs an absolute local directory");
    this.directory = directory;
    this.profileStore = profileStore;
    this.sessionStore = sessionStore;
    this.file = path.join(directory, JOURNAL_NAME);
    this.hooks = hooks;
  }

  validatePair(profile, session) {
    if (!isArticulateProfile(profile) || !profile.consent.localPersistence ||
        !isAssessmentSession(session) || session.profileId !== profile.profileId)
      throw new Error("Refusing invalid profile/assessment checkpoint pair");
    this.profileStore.serialize(profile);
    this.sessionStore.serialize(session);
  }

  checksum(profile, session) {
    return createHash("sha256").update(JSON.stringify([profile, session])).digest("hex");
  }

  async ensureDirectory() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Unsafe local checkpoint directory");
  }

  async journalExists() {
    let stat;
    try { stat = await fs.lstat(this.file); }
    catch (error) { if (error.code === "ENOENT") return false; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_JOURNAL_BYTES)
      throw new Error("Unsafe or oversized pending Articulate checkpoint; manual recovery needed");
    return true;
  }

  /** Run only under the shared profile lock, BEFORE reading current data. */
  async recover() {
    if (!(await this.journalExists())) return false;
    let journal;
    try {
      journal = JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch {
      throw new Error("Invalid pending Articulate checkpoint; refusing automatic recovery");
    }
    const { version, transactionId, profile, session, digest } = journal ?? {};
    if (version !== 1 || typeof transactionId !== "string" ||
        !/^[0-9a-f-]{36}$/.test(transactionId) ||
        typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest))
      throw new Error("Invalid pending Articulate checkpoint metadata");
    this.validatePair(profile, session);
    if (this.checksum(profile, session) !== digest)
      throw new Error("Pending Articulate checkpoint checksum mismatch; refusing to overwrite local data");

    // Re-applying these exact values is idempotent even if a previous process
    // crashed after either individual rename, or after both were written.
    await this.profileStore.save(profile);
    await this.sessionStore.save(session);
    await fs.unlink(this.file);
    return true;
  }

  /** Explicit local erase must work even when recovery is impossible. Caller holds the lock. */
  async discard() {
    await fs.rm(this.file,{force:true});
    for (const name of await fs.readdir(this.directory)) {
      if (/^\.(?:profile|session|checkpoint)-[a-f0-9-]{36}\.tmp$/.test(name))
        await fs.rm(path.join(this.directory,name),{force:true});
    }
  }

  /** Caller already holds shared lock; failures after publishing journal are replayable. */
  async commit(profile, session) {
    this.validatePair(profile, session);
    await this.ensureDirectory();
    // Never replace an unfinished transaction.
    await this.recover();
    const journal = {
      version: 1,
      transactionId: randomUUID(),
      preparedAt: new Date().toISOString(),
      profile, session,
      digest: this.checksum(profile, session)
    };
    const content = JSON.stringify(journal) + "\n";
    if (Buffer.byteLength(content) > MAX_JOURNAL_BYTES)
      throw new Error("Articulate assessment checkpoint exceeds local size limit");
    const tmp = path.join(this.directory, ".checkpoint-" + randomUUID() + ".tmp");
    let handle;
    try {
      handle = await fs.open(tmp, "wx", 0o600);
      await handle.writeFile(content, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      // Prepared journal becomes visible via one atomic rename.
      await fs.rename(tmp, this.file);
    } finally {
      if (handle) await handle.close();
      await fs.rm(tmp, { force: true });
    }
    await this.hooks.afterPrepare?.();
    await this.profileStore.save(profile);
    await this.hooks.afterProfile?.();
    await this.sessionStore.save(session);
    await this.hooks.afterSession?.();
    await fs.unlink(this.file);
    return { committed: true };
  }
}
