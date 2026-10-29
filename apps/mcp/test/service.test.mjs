import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalService } from "../src/service.mjs";

async function withService(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "articulate-mcp-"));
  try { return await fn(createLocalService(dir)); }
  finally { await rm(dir, { force: true, recursive: true }); }
}
test("local MCP service starts only with opted-in persistence; no raw text recorded", async () => {
  await withService(async service => {
    assert.equal((await service.status()).hasProfile, false);
    await assert.rejects(() => service.start({localStorageConsent:false}), /consent/);
    assert.equal(await service.profileStore.load(), null);
    const initial = await service.start({localStorageConsent:true});
    assert.equal(initial.question.id, "background");
    const answer = await service.answer({sessionId:initial.sessionId,questionId:"background",answer:"Sensitive words that should never be saved"});
    assert.equal(answer.question.id, "sentence_open");
    assert.equal(answer.progress.bankId, "agent_v2");
    const state = await service.inspect();
    assert.equal(JSON.stringify(state).includes("Sensitive words"), false);
    assert.equal(state.session.nextIndex, 1);
    const resume = await service.start({localStorageConsent:true});
    assert.equal(resume.resumed,true);
    assert.equal(resume.question.id,"sentence_open");
  });
});

test("scores and compiled policy are not exposed without local authorization", async () => {
  await withService(async service => {
    const started = await service.start({localStorageConsent:true});
    await assert.rejects(() => service.review(), /sharing is disabled/i);
    await assert.rejects(() => service.policy({task:"concept"}), /sharing is disabled/i);
    await assert.rejects(() => service.confirm({userApproved:true,confirmationPhrase:"CONFIRM ARTICULATE PROFILE"}), /sharing is disabled/i);
    assert.equal((await service.status()).policySharingEnabled, false);
    let last;
    for(let i=0;i<6;i++) { const step=await service.next(); last=await service.answer({sessionId:started.sessionId,questionId:step.question.id,skip:true,userRequestedSkip:true}); }
    assert.equal(last.completed,true);
    assert.equal(last.question,null);
    await assert.rejects(() => service.answer({sessionId:started.sessionId,questionId:"comparison",skip:true,userRequestedSkip:true}), /complete/);
    const p=await service.profileStore.load();
    await service.profileStore.save({...p, consent:{...p.consent,sharePolicyWithAiProvider:true}});
    const review=await service.review();
    assert.equal(review.dimensions.visual_structure.provisionalScore,50);
    assert.equal(review.confirmed,false);
    await assert.rejects(() => service.confirm({userApproved:false,confirmationPhrase:"CONFIRM ARTICULATE PROFILE"}),/approve/);
    await assert.rejects(() => service.confirm({userApproved:true}), /confirmationPhrase/);
    await service.confirm({userApproved:true,confirmationPhrase:"CONFIRM ARTICULATE PROFILE"});
    const policy=await service.policy({task:"debugging"});
    assert.match(policy.instructionText,/Preserve exact error/);
    assert.doesNotMatch(policy.instructionText,/local-/);
    const after=await service.comparison({topic:"photosynthesis"});
    for(const fact of after.canonicalFacts)assert.ok(after.adapted.includes(fact));
    await service.preference({dimension:"visual_structure",value:1,userApproved:true});
    const another=await service.policy({task:"concept"});
    assert.match(another.instructionText,/diagram or table/);
    await service.domain({subject:"Physics",level:"beginner",userApproved:true});
    assert.equal((await service.review()).domainFamiliarity.physics.level,"beginner");
    const latest=await service.profileStore.load();
    await service.profileStore.save({...latest,consent:{...latest.consent,sharePolicyWithAiProvider:false}});
    await assert.rejects(() => service.policy({task:"concept"}), /sharing is disabled/i);
  });
});

test("invalid answers or premature confirmation are rejected without advancing", async () => {
  await withService(async service => {
    const started = await service.start({localStorageConsent:true});
    const current=await service.profileStore.load();
    await service.profileStore.save({...current,consent:{...current.consent,sharePolicyWithAiProvider:true}});
    await assert.rejects(() => service.confirm({userApproved:true,confirmationPhrase:"CONFIRM ARTICULATE PROFILE"}), /Finish the assessment/);
    await service.answer({sessionId:started.sessionId,questionId:"background",skip:true,userRequestedSkip:true});
    await assert.rejects(() => service.answer({sessionId:started.sessionId,questionId:"sentence_open",answer:20}), /Choose one option|Invalid selected/);
    assert.equal((await service.next()).question.id,"sentence_open");
    await service.answer({sessionId:started.sessionId,questionId:"sentence_open",skip:true,userRequestedSkip:true});
    await assert.rejects(() => service.answer({sessionId:started.sessionId,questionId:"organization",answer:20}), /Choose one option|Invalid selected/);
    await assert.rejects(() => service.answer({sessionId:started.sessionId,questionId:"background",answer:4}), /Stale assessment/);
    await assert.rejects(() => service.preference({dimension:"overview_first",value:2,userApproved:true}),/between 0 and 1/);
    await assert.rejects(() => service.domain({subject:"Physics",level:"beginner",userApproved:false}),/approval/);
  });
});
