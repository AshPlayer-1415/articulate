import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import {
  LocalAssessmentSessionStore, LocalProfileStore, withRecoveredLocalProfileLock
} from "../src/index.js";

test("real killed writer recovers pending profile/session pair on restart", {timeout:35_000},async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"articulate-hard-crash-"));
  const childScript=fileURLToPath(new URL("./checkpoint-worker.mjs",import.meta.url));
  try {
    const exitCode=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,["--experimental-strip-types",childScript,directory],{
        stdio:["ignore","ignore","pipe"]
      });
      let stderr="";
      child.stderr.on("data",chunk=>{stderr+=String(chunk);});
      child.once("error",reject);
      child.once("exit",(code)=>code===null?reject(new Error("Worker killed unexpectedly: "+stderr)):resolve(code));
    });
    assert.equal(exitCode,47);
    const profile=new LocalProfileStore(directory);
    const session=new LocalAssessmentSessionStore(directory);
    // A *separate* process was killed with the shared lock still held.
    // The recovered lock removes that abandoned owner and replays the journal.
    const pair=await withRecoveredLocalProfileLock(directory,async()=>({
      profile:await profile.load(),session:await session.load()
    }), { timeoutMs:10_000 });
    assert.equal(pair.profile.profileId,"crash-user");
    assert.equal(pair.session.profileId,pair.profile.profileId);
    assert.equal(pair.session.sessionId,"crash-session");
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
});
