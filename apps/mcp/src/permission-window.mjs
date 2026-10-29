#!/usr/bin/env node
import { isDirectExecution } from "./direct-execution.mjs";
import { ArticulateLocalService } from "./service.mjs";
import { createConsentWindow, launchSystemBrowser } from "./permission-ui.mjs";

/** Human-invoked fallback if an AI host cannot launch local browser windows.
 * The secret URL is printed ONLY to the user's trusted local terminal.
 */
export async function runPermissionsWindow() {
  const service=new ArticulateLocalService();
  const window=await createConsentWindow(service);
  try {
    console.log("Articulate local permission page (valid for two minutes):");
    console.log(window.url);
    console.log("The URL stays on this machine. Never share it in AI chats or messages.");
    try { await launchSystemBrowser(window.url); }
    catch { console.log("Browser could not open automatically; paste the URL into your device's browser."); }
    await window.done;
    console.log("Local permission window closed.");
  } finally { await window.close(); }
}
if (isDirectExecution(import.meta.url)) {
  runPermissionsWindow().catch(e=>{console.error(e.message);process.exitCode=1;});
}
