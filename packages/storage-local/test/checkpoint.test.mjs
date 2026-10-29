import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, lstat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  LocalAssessmentCheckpoint, LocalProfileStore, LocalAssessmentSessionStore,
  withRecoveredLocalProfileLock
} from "../src/index.js";
import { createProfile, createAssessmentSession, submitAssessmentAnswer } from "@articulate/core";

async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "articulate-checkpoint-"));
  const profile = new LocalProfileStore(directory);
  const session = new LocalAssessmentSessionStore(directory);
  try { return await run({directory,profile,session}); }
  finally { await rm(directory,{recursive:true,force:true}); }
}

function twoQuestions(profileId) {
  const profile=createProfile(profileId);
  const session=createAssessmentSession(profileId,"session-1","attempt-1",new Date().toISOString());
  const first=submitAssessmentAnswer(session,profile,null,new Date().toISOString());
  return submitAssessmentAnswer(first.session,first.profile,4,new Date().toISOString());
}

test("paired checkpoint commits both files and leaves no pending journal", async()=>{
  await fixture(async({directory,profile,session})=>{
    const pair=twoQuestions("demo");
    await withRecoveredLocalProfileLock(directory,async()=>{
      await new LocalAssessmentCheckpoint(directory,profile,session).commit(pair.profile,pair.session);
    });
    assert.deepEqual(await profile.load(),pair.profile);
    assert.deepEqual(await session.load(),pair.session);
    await assert.rejects(()=>lstat(path.join(directory,".assessment-checkpoint.json")), {code:"ENOENT"});
  });
});

for(const point of ["afterPrepare","afterProfile","afterSession"]) {
  test("interrupted checkpoint "+point+" recovers the same profile + session pair",async()=>{
    await fixture(async({directory,profile,session})=>{
      const baseline=twoQuestions("same-user");
      const changed={...baseline.profile,updatedAt:new Date().toISOString(),
        manualOverrides:{...baseline.profile.manualOverrides,visual_structure:0.87}};
      const nextSession={...baseline.session,nextIndex:baseline.session.nextIndex+1};
      await new LocalAssessmentCheckpoint(directory,profile,session).commit(baseline.profile,baseline.session);
      const interrupted=new LocalAssessmentCheckpoint(directory,profile,session,{
        [point]:async()=>{throw new Error("Simulated sudden process interruption");}
      });
      await assert.rejects(() => withRecoveredLocalProfileLock(directory,()=>{
        return interrupted.commit(changed,nextSession);
      }),/Simulated sudden process interruption/);
      const pending=await lstat(path.join(directory,".assessment-checkpoint.json"));
      assert.ok(pending.isFile());
      // A new process/host must run recovery BEFORE observing the local state.
      let recovered;
      await withRecoveredLocalProfileLock(directory,async()=>{
        recovered={profile:await profile.load(),session:await session.load()};
      });
      assert.deepEqual(recovered.profile,changed);
      assert.deepEqual(recovered.session,nextSession);
      assert.equal(new LocalAssessmentCheckpoint(directory,profile,session).recover instanceof Function,true);
      assert.equal(await withRecoveredLocalProfileLock(directory,
        ()=>new LocalAssessmentCheckpoint(directory,profile,session).recover()),false);
    });
  });
}

test("invalid profile/session pairs never publish a journal",async()=>{
  await fixture(async({directory,profile,session})=>{
    const candidate=twoQuestions("one");
    await assert.rejects(
      ()=>new LocalAssessmentCheckpoint(directory,profile,session).commit(
        candidate.profile,{...candidate.session,profileId:"another"}
      ),/invalid profile\/assessment/);
    assert.equal(await profile.load(),null);
    assert.equal(await session.load(),null);
  });
});

test("tampered pending journal fails closed without overwriting files",async()=>{
  await fixture(async({directory,profile,session})=>{
    const pair=twoQuestions("same");
    await new LocalAssessmentCheckpoint(directory,profile,session).commit(pair.profile,pair.session);
    const pending=new LocalAssessmentCheckpoint(directory,profile,session,{
      afterPrepare:async()=>{throw new Error("interrupt");}
    });
    await assert.rejects(()=>pending.commit(pair.profile,pair.session),/interrupt/);
    const file=path.join(directory,".assessment-checkpoint.json");
    const altered=JSON.parse(await readFile(file,"utf8"));
    altered.profile.manualOverrides={visual_structure:0.4};
    await writeFile(file,JSON.stringify(altered));
    await assert.rejects(()=>withRecoveredLocalProfileLock(directory,async()=>profile.load()),/checksum mismatch/);
    assert.deepEqual(await profile.load(),pair.profile);
  });
});

test("symlink checkpoint journal cannot be replayed",async t=>{
  if(process.platform==="win32")return t.skip("Windows symlink creation varies by runner privileges");
  await fixture(async({directory,profile,session})=>{
    const file=path.join(directory,".assessment-checkpoint.json");
    await symlink(path.join(directory,"unsafe"),file);
    await assert.rejects(
      ()=>withRecoveredLocalProfileLock(directory,async()=>profile.load()),
      /Unsafe or oversized pending/);
    assert.equal(await session.load(),null);
  });
});
