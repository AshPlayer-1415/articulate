import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, lstat, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalProfileStore } from "../src/index.js";
import { createProfile } from "@articulate/core";

test("local profile roundtrip and deletion", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "articulate-test-"));
  try {
    const store = new LocalProfileStore(dir);
    assert.equal(await store.load(), null);
    const profile = createProfile("synthetic-test");
    await store.save(profile);
    assert.equal((await store.load()).profileId, "synthetic-test");
    assert.equal(JSON.parse(await readFile(path.join(dir, "profile.json"))).profileId, "synthetic-test");
    if (process.platform !== "win32") {
      const st = await lstat(path.join(dir, "profile.json"));
      assert.equal(st.mode & 0o077, 0);
    }
    await store.remove();
    assert.equal(await store.load(), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("store refuses provider or local-persistence disabled profile", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "articulate-test-"));
  try {
    const profile = createProfile("synthetic-test");
    profile.consent.localPersistence = false;
    await assert.rejects(() => new LocalProfileStore(dir).save(profile));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("store refuses symlink profile", async t => {
  if (process.platform === "win32") return t.skip("symlink permissions vary on Windows");
  const dir = await mkdtemp(path.join(os.tmpdir(), "articulate-test-"));
  try {
    await symlink(path.join(dir, "another.json"), path.join(dir, "profile.json"));
    await assert.rejects(() => new LocalProfileStore(dir).save(createProfile("test")));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("session persistence roundtrip, no raw answers, delete", async () => {
  const { LocalAssessmentSessionStore } = await import("../src/index.js");
  const { createAssessmentSession } = await import("@articulate/core");
  const dir = await mkdtemp(path.join(os.tmpdir(), "articulate-session-test-"));
  try {
    const store = new LocalAssessmentSessionStore(dir);
    assert.equal(await store.load(), null);
    const session = createAssessmentSession("profile", "session", "attempt", new Date().toISOString());
    await store.save(session);
    assert.deepEqual(await store.load(), session);
    assert.equal(JSON.stringify(await store.load()).includes("rawAnswer"), false);
    await store.remove();
    assert.equal(await store.load(), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
