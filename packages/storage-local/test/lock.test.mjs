import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, utimes } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { withLocalProfileLock } from "../src/index.js";

async function fixture(fn) {
  const dir=await mkdtemp(path.join(os.tmpdir(),"articulate-lock-"));
  try { await fn(dir); } finally { await rm(dir,{recursive:true,force:true}); }
}
function worker(dir,count){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,["--experimental-strip-types",fileURLToPath(new URL("./lock-worker.mjs",import.meta.url)),dir,String(count)],{
      stdio:["ignore","pipe","pipe"]
    });
    let stderr="";
    child.stderr.on("data",s=>{stderr+=String(s);});
    child.on("error",reject);
    child.on("exit",code=>code===0?resolve():reject(new Error("Worker exited "+code+": "+stderr)));
  });
}

test("independent Node processes serialize updates without lost writes", {timeout:60_000},async()=>{
  await fixture(async dir=>{
    await Promise.all([worker(dir,20),worker(dir,20),worker(dir,20)]);
    assert.equal(Number(await readFile(path.join(dir,"counter.txt"),"utf8")),60);
  });
});
test("live lock cannot be stolen and times out without changing state",async()=>{
  await fixture(async dir=>{
    let release;
    let acquired;
    const entered=new Promise(resolve=>{acquired=resolve;});
    const blocker=new Promise(resolve=>{release=resolve;});
    const first=withLocalProfileLock(dir,async()=>{acquired();await blocker;});
    await entered;
    await assert.rejects(()=>withLocalProfileLock(dir,async()=>{throw new Error("unexpected acquisition");},{timeoutMs:85,retryMs:15}),/profile is busy/);
    release();
    await first;
    assert.equal(await withLocalProfileLock(dir,async()=>42),42);
  });
});
test("callback failures release local lock",async()=>{
  await fixture(async dir=>{
    await assert.rejects(()=>withLocalProfileLock(dir,async()=>{throw new Error("deliberate");}),/deliberate/);
    assert.equal(await withLocalProfileLock(dir,async()=>"recovered"),"recovered");
  });
});
test("dead owner process can be recovered after minimum grace period",async()=>{
  await fixture(async dir=>{
    const lock=path.join(dir,".articulate-write-lock");
    await mkdir(lock,{mode:0o700});
    await writeFile(path.join(lock,"owner.json"),JSON.stringify({
      token:"dead-owner",pid:2147483646,hostname:os.hostname(),acquiredAt:"2026-01-01T00:00:00Z"
    },null,2));
    const old=new Date(Date.now()-10_000);
    await utimes(lock,old,old);
    const result=await withLocalProfileLock(dir,async()=>true,{timeoutMs:1000,retryMs:10});
    assert.equal(result,true);
  });
});
test("unsafe symlink lock path is rejected",async t=>{
  if(process.platform==="win32")return t.skip("Windows symlink creation depends on privileges");
  await fixture(async dir=>{
    await symlink(dir,path.join(dir,".articulate-write-lock"),"dir");
    await assert.rejects(()=>withLocalProfileLock(dir,async()=>true),/Unsafe local profile lock path/);
  });
});
