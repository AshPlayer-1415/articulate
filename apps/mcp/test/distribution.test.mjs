import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ArticulateLocalService } from "../src/service.mjs";

const styles = [{name:"Brief",responseShape:"Lead with the decision and the essential caveat.",isDefault:true}];
const patterns = [{situation:"Reviewing a code change",wantedOutput:"Consequential defects before a summary",gap:"The decision was buried under narration",readback:"Scan the findings then inspect the evidence"}];
async function isolated(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(),"articulate-distribution-"));
  try { await run(new ArticulateLocalService(dir),dir); }
  finally { await rm(dir,{recursive:true,force:true}); }
}
async function grant(service,enabled=true) {
  await service.exclusive(async()=>{
    const p=await service.profileStore.load();
    await service.profileStore.save({...p,consent:{...p.consent,sharePolicyWithAiProvider:enabled}});
  });
}
test("every style/pattern save preserves local consent across restart and revocation",async()=>{
  await isolated(async(s,dir)=>{
    for(const [method,input] of [["saveStyles",{styles}],["savePatterns",{patterns}]]) {
      await s[method]({...input,localStorageConsent:true,userApproved:true});
      await assert.rejects(()=>s.policy({}),/sharing is disabled/i);
      await assert.rejects(()=>s[method]({...input,localStorageConsent:true,userApproved:true,sharePolicyWithAiProvider:true}),/local permission window/);
      await grant(s);
      await s[method]({...input,localStorageConsent:true,userApproved:true});
      assert.equal((await s.status()).policySharingEnabled,true);
      await grant(s,false);
      s=new ArticulateLocalService(dir);
      await s[method]({...input,localStorageConsent:true,userApproved:true});
      await assert.rejects(()=>s.policy({}),/sharing is disabled/i);
    }
  });
});
test("recalibration survives restart without replacing live policy; cancel and confirm are explicit",async()=>{
  await isolated(async(s,dir)=>{
    await s.saveStyles({styles,localStorageConsent:true,userApproved:true});
    await grant(s);
    const before=await s.profileStore.load();
    const policy=(await s.policy({})).instructionText;
    let step=await s.start({localStorageConsent:true,recalibrate:true});
    step=await s.answer({sessionId:step.sessionId,questionId:step.question.id,answer:"Synthetic context"});
    await s.answer({sessionId:step.sessionId,questionId:step.question.id,answer:"b"});
    s=new ArticulateLocalService(dir);
    assert.equal((await s.policy({})).instructionText,policy);
    assert.deepEqual(await s.profileStore.load(),before);
    await assert.rejects(()=>s.saveStyles({styles,localStorageConsent:true,userApproved:true}),/Finish or cancel/);
    await s.cancelAssessment({userApproved:true});
    assert.deepEqual(await s.profileStore.load(),before);
    await s.start({localStorageConsent:true,recalibrate:true});
    while(!(await s.next()).complete) {
      const q=await s.next();
      await s.answer({sessionId:q.sessionId,questionId:q.question.id,skip:true,userRequestedSkip:true});
    }
    await s.preference({dimension:"visual_structure",value:1,userApproved:true});
    assert.equal((await s.profileStore.load()).manualOverrides.visual_structure,undefined);
    await s.confirm({userApproved:true,confirmationPhrase:"CONFIRM ARTICULATE PROFILE"});
    assert.equal((await s.profileStore.load()).manualOverrides.visual_structure,1);
    assert.equal((await s.sessionStore.load()).draftProfile,undefined);
  });
});
test("erasure works despite an invalid recovery journal",async()=>{
  await isolated(async(s,dir)=>{
    await s.saveStyles({styles,localStorageConsent:true,userApproved:true});
    await writeFile(path.join(dir,".assessment-checkpoint.json"),"invalid pending journal");
    await assert.rejects(()=>s.status(),/Invalid pending/);
    await s.deleteLocalData({userApproved:true,confirmationPhrase:"DELETE LOCAL ARTICULATE DATA"});
    assert.equal((await s.status()).hasProfile,false);
  });
});
test("named styles never report a successful dimension correction that cannot affect policy",async()=>{
  await isolated(async s=>{
    await s.saveStyles({styles,localStorageConsent:true,userApproved:true});
    await grant(s);
    await assert.rejects(()=>s.shapeFeedback({shape:"map",userApproved:true}),/Edit its response rule/);
    await assert.rejects(()=>s.preference({dimension:"visual_structure",value:1,userApproved:true}),/Edit the named response rule/);
    const preview=await s.valuePreview();
    assert.equal(preview.reflectsNamedStyle,false);
    assert.match(preview.policyExcerpt,/Lead with the decision/);
    assert.equal(preview.withYourPackaging,undefined);
  });
});
