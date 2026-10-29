import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ArticulateLocalService } from "../src/service.mjs";

async function temporary(fn) {
  const dir=await mkdtemp(path.join(os.tmpdir(),"articulate-contention-"));
  try { await fn(new ArticulateLocalService(dir),new ArticulateLocalService(dir)); }
  finally { await rm(dir,{recursive:true,force:true}); }
}

test("simultaneous MCP clients reject outdated answers rather than scoring them twice",async()=>{
  await temporary(async (a,b)=>{
    const started=await a.start({localStorageConsent:true});
    await a.answer({sessionId:started.sessionId,questionId:"background",answer:"New to recursion"});
    const attempts=await Promise.allSettled([
      a.answer({sessionId:started.sessionId,questionId:"sentence_open",answer:"a"}),
      b.answer({sessionId:started.sessionId,questionId:"sentence_open",answer:"b"})
    ]);
    assert.equal(attempts.filter(r=>r.status==="fulfilled").length,1);
    assert.equal(attempts.filter(r=>r.status==="rejected").length,1);
    assert.match(attempts.find(r=>r.status==="rejected").reason.message,/Stale assessment/);
    const state=await a.next();
    assert.equal(state.question.id,"organization");
    assert.equal(state.progress.completed,2);
    const p=(await a.sessionStore.load()).draftProfile;
    assert.equal(p.evidence.filter(e=>e.itemId.includes("sentence_open")).length>=1,true);
    await assert.rejects(()=>b.answer({
      sessionId:"previous-session",questionId:"organization",answer:4
    }),/Stale assessment/);
    assert.equal((await b.next()).question.id,"organization");
  });
});

test("independent services preserve both approved preference edits",async()=>{
  await temporary(async(a,b)=>{
    const started=await a.start({localStorageConsent:true});
    const raw=await a.profileStore.load();
    await a.exclusive(async()=>a.profileStore.save({
      ...raw,consent:{...raw.consent,sharePolicyWithAiProvider:true}
    }));
    while (!(await a.next()).complete) {
      const step=await a.next();
      await a.answer({sessionId:step.sessionId,questionId:step.question.id,skip:true,userRequestedSkip:true});
    }
    const edits=await Promise.all([
      a.preference({dimension:"overview_first",value:0.95,userApproved:true}),
      b.preference({dimension:"visual_structure",value:0.1,userApproved:true})
    ]);
    assert.deepEqual(edits.map(e=>e.savedLocally),[true,true]);
    const after=(await b.sessionStore.load()).draftProfile;
    assert.equal(after.manualOverrides.overview_first,0.95);
    assert.equal(after.manualOverrides.visual_structure,0.1);
    assert.equal((await b.next()).sessionId,started.sessionId);
    // Revoke disclosure via a third local writer; a previously created
    // service cannot continue to share after the permission flip.
    await a.exclusive(async()=>{
      const current=await a.profileStore.load();
      await a.profileStore.save({
        ...current,consent:{...current.consent,sharePolicyWithAiProvider:false}
      });
    });
    await assert.rejects(()=>b.review(),/sharing is disabled/i);
  });
});

test("interrupted two-file checkpoint can be retried without duplicate evidence",async()=>{
  await temporary(async(a,b)=>{
    const started=await a.start({localStorageConsent:true});
    await a.answer({sessionId:started.sessionId,questionId:"background",answer:"New to algebra"});
    const question=await a.next();
    const {submitAssessmentAnswer}=await import("@articulate/core");
    // Model a process crash after the scored profile was saved but before
    // assessment-session.json advanced. The next request must be idempotent.
    await a.exclusive(async()=>{
      const profile=await a.profileStore.load();
      const session=await a.sessionStore.load();
      const partial=submitAssessmentAnswer(session,profile,"b",new Date().toISOString());
      await a.profileStore.save(partial.profile);
      // Intentionally don't save partial.session.
    });
    const retried=await b.answer({
      sessionId:started.sessionId,questionId:question.question.id,answer:"b"
    });
    assert.equal(retried.progress.completed,2);
    const profile=(await b.sessionStore.load()).draftProfile;
    // One attempt may map to multiple dimensions; idempotent retry must not duplicate keys.
    const keys=profile.evidence.filter(x=>x.itemId.includes("sentence_open")).map(x=>x.itemId+":"+x.dimension);
    assert.equal(keys.length,new Set(keys).size);
    assert.ok(keys.length>=1);
  });
});
