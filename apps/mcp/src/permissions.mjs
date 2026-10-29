#!/usr/bin/env node
/** Deliberately *not* exposed as an MCP tool. Human approves locally. */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { ArticulateLocalService } from "./service.mjs";

async function run() {
  const service = new ArticulateLocalService();
  const existing = await service.profileStore.load();
  if (!existing) {
    console.error("No local Articulate profile. Start an assessment first.");
    process.exitCode = 1;
    return;
  }
  const context=await service.sharingContext();
  const choice = process.argv[2] || "status";
  if (choice === "status") {
    console.log(context.sharingEnabled
      ? "Articulate provider sharing: ENABLED (revoke with npm run mcp:revoke)"
      : "Articulate provider sharing: DISABLED");
    return;
  }
  if (choice !== "authorize" && choice !== "revoke")
    throw new Error("Usage: permissions.mjs status|authorize|revoke");
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    if (choice === "authorize") {
      console.log("\nArticulate local-provider disclosure:");
      console.log("- MCP tools run locally. No profile is sent to Articulate-owned servers.");
      console.log("- Claude or another AI host may receive a score summary and compiled presentation policy when tools are invoked.");
      console.log("- Responses to questions typed in a hosted AI chat are already processed by that AI provider.");
      console.log("- Sharing remains opt-in and can be revoked locally at any time.");
      const confirmation = (await rl.question("Type ENABLE ARTICULATE SHARING to allow these MCP disclosures: ")).trim();
      if (confirmation !== "ENABLE ARTICULATE SHARING") {
        console.log("Not authorized; no changes.");
        return;
      }
    } else {
      const confirmation = (await rl.question("Type REVOKE to disable future MCP profile disclosures: ")).trim();
      if (confirmation !== "REVOKE") {
        console.log("Not revoked; no changes.");
        return;
      }
    }
    await service.exclusive(async () => {
      const current = await service.profileStore.load();
      if (!current) throw new Error("Profile disappeared while updating consent.");
      await service.applyLocalSharingDecision({enabled:choice==='authorize',profileId:existing.profileId,context});
    });
    console.log(choice === "authorize" ? "Sharing enabled on this device." : "Sharing disabled on this device.");
  } finally { rl.close(); }
}
run().catch(e => { console.error(e.message); process.exitCode = 1; });
