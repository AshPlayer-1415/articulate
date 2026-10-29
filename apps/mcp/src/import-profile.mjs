#!/usr/bin/env node
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDirectExecution } from "./direct-execution.mjs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { isArticulateProfile } from "@articulate/core";
import { ArticulateLocalService } from "./service.mjs";

const MAX_BYTES = 1024 * 1024;

// Trusted local command, deliberately not an MCP tool. Does not call a server.
export async function loadExport(filename) {
  if (!filename || typeof filename !== "string") throw new Error("Supply a local JSON file path");
  const absolute = resolve(filename);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES)
    throw new Error("Expected a regular, non-symlink JSON profile file of at most 1 MB");
  let profile;
  try { profile = JSON.parse(await readFile(absolute, "utf8")); }
  catch { throw new Error("Invalid JSON profile export"); }
  if (!isArticulateProfile(profile) || !profile.consent.localPersistence)
    throw new Error("Invalid or unsupported Articulate profile");
  return profile;
}

export async function importExport(filename, { directory, replaceApproved = false } = {}) {
  const incoming = await loadExport(filename);
  const service = new ArticulateLocalService(directory);
  return service.exclusive(async () => {
    const existing = await service.profileStore.load();
    if (existing && !replaceApproved)
      throw new Error("Existing local profile: explicit replacement authorization required.");
    const safe = {
      ...incoming,
      updatedAt: new Date().toISOString(),
      consent: { ...incoming.consent, sharePolicyWithAiProvider: false }
    };
    // Imported device permissions NEVER carry over.
    await service.profileStore.save(safe);
    await service.sessionStore.remove();
    return { imported:true, confirmed:!!safe.confirmedAt, providerSharingEnabled:false };
  });
}

async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error("Usage: npm run mcp:import -- /path/to/articulate-profile.json");
  await loadExport(filename);
  const service = new ArticulateLocalService();
  const existing = await service.profileStore.load();
  console.log("This imports a local Articulate profile; provider sharing will be disabled.");
  if (existing) console.log("It will REPLACE your existing local profile and any incomplete MCP assessment progress.");
  const rl = createInterface({input:stdin,output:stdout});
  try {
    const response = await rl.question("Type IMPORT ARTICULATE to proceed: ");
    if (response.trim() !== "IMPORT ARTICULATE") {
      console.log("No changes made.");
      return;
    }
    const result = await importExport(filename,{replaceApproved:true});
    console.log(result.confirmed
      ? "Profile imported locally. Run npm run mcp:authorize only if you want AI-provider access."
      : "Provisional profile imported locally; complete confirmation before personalization.");
  } finally { rl.close(); }
}

if (isDirectExecution(import.meta.url)) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
