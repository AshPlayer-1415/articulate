import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createProfile,isArticulateProfile,confirmProfile} from "@articulate/core";
import {ArticulateLocalService} from "../src/service.mjs";
import {importExport,loadExport} from "../src/import-profile.mjs";

test("local browser export import revokes provider-sharing and discards stale session",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"articulate-import-"));
 const pathToExport=path.join(dir,"from-browser.json");
 const local=path.join(dir,"profile-storage");
 try {
   const src=confirmProfile(createProfile("user-owned","2026-10-11T00:00:00Z"),"2026-10-11T00:05:00Z");
   src.consent.sharePolicyWithAiProvider=true; // exported old-device permission must not transfer
   await writeFile(pathToExport,JSON.stringify(src));
   const saved=await loadExport(pathToExport);
   assert.equal(isArticulateProfile(saved),true);
   await importExport(pathToExport,{directory:local});
   const service=new ArticulateLocalService(local);
   const p=await service.profileStore.load();
   assert.equal(p.confirmedAt,"2026-10-11T00:05:00Z");
   assert.equal(p.consent.sharePolicyWithAiProvider,false);
   await assert.rejects(()=>service.policy({task:"concept"}),/sharing is disabled/i);
   await assert.rejects(()=>importExport(pathToExport,{directory:local}),/replacement authorization required/);
   await importExport(pathToExport,{directory:local,replaceApproved:true});
   assert.equal((await service.profileStore.load()).consent.sharePolicyWithAiProvider,false);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test("refuse invalid export file",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"articulate-import-bad-"));
 try {
  const f=path.join(dir,"invalid.json");
  await writeFile(f,'{"notAProfile":true}');
  await assert.rejects(()=>loadExport(f),/Invalid or unsupported/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
