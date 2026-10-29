import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,lstat} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createProfile,createAssessmentSession} from "@articulate/core";
import {LocalProfileStore,LocalAssessmentSessionStore,LocalAssessmentCheckpoint,resolveDataDirectory} from "../src/index.js";
test("checkpoint preflights exact profile bytes and leaves previous data readable",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"articulate-boundary-"));
  try {
    const store=new LocalProfileStore(dir), sessions=new LocalAssessmentSessionStore(dir);
    const checkpoint=new LocalAssessmentCheckpoint(dir,store,sessions);
    const p=createProfile("synthetic");
    const s=createAssessmentSession(p.profileId,"session","attempt",new Date().toISOString());
    await checkpoint.commit(p,s);
    const large={...p,evidence:Array.from({length:5000},(_,i)=>({
      itemId:"synthetic-audit-"+i,dimension:"detail_level",score:0.5,reliability:0.5,
      source:"single_choice",timestamp:"2026-10-23T00:00:00.000Z"
    }))};
    await assert.rejects(()=>checkpoint.commit(large,s),/Profile is too large/);
    await assert.rejects(()=>lstat(checkpoint.file),{code:"ENOENT"});
    assert.deepEqual(await store.load(),p);
    assert.equal(await checkpoint.recover(),false);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test("CLI and stores use the configured directory without accessing the ordinary profile",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"articulate-cli-isolated-"));
  try {
    await new LocalProfileStore(dir).save(createProfile("synthetic-cli-isolation"));
    assert.equal(resolveDataDirectory(dir),dir);
    assert.throws(()=>resolveDataDirectory("relative"),/absolute/);
    const cli=fileURLToPath(new URL("../../../apps/cli/src/index.mjs",import.meta.url));
    const {stdout}=await promisify(execFile)(process.execPath,["--experimental-strip-types",cli,"profile"],{
      env:{...process.env,ARTICULATE_DATA_DIR:dir},timeout:10000
    });
    assert.equal(JSON.parse(stdout).profileId,"synthetic-cli-isolation");
  } finally {await rm(dir,{recursive:true,force:true});}
});
