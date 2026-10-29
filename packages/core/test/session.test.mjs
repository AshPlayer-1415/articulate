import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSESSMENT, COMPARISON_STIMULI, createAssessmentSession, createProfile,
  currentQuestion, displayQuestion, displayVariants, isAssessmentSession, progress,
  submitAssessmentAnswer
} from "../src/index.ts";

const NOW = "2026-10-11T00:00:00.000Z";
const newSession = () => createAssessmentSession("p", "123e4567-e89b-42d3-a456-426614174000", "a", NOW);
test("quiz counts stages, never assumes hardcoded total", () => {
  const p = progress(newSession());
  assert.equal(p.total, ASSESSMENT.length);
  assert.equal(p.completed, 0);
  assert.equal(p.stageTitle, "Background");
  assert.equal(p.percent, 0);
});
test("format comparisons preserve canonical IDs after stable shuffle", () => {
  for (const id of ["format","comparison"]) {
    const set=COMPARISON_STIMULI[id];
    const first=displayVariants(set,"fixed-session");
    const second=displayVariants(set,"fixed-session");
    assert.deepEqual(first, second);
    assert.deepEqual(first.map(v=>v.id).sort(), ["a","b","c"]);
    assert.equal(set.variants.length, 3);
    assert.ok(set.canonicalFacts.length >= 3);
  }
});
test("profile mismatch and invalid responses do not advance", () => {
  const s=newSession();
  const p=createProfile("someone-else",NOW);
  assert.throws(()=>submitAssessmentAnswer(s,p,"hi",NOW),/match/);
  assert.equal(s.nextIndex,0);
  assert.equal(isAssessmentSession({...s,nextIndex:-1}),false);
});
test("resume-friendly transitions don't store raw answers", () => {
  let s=newSession(), p=createProfile("p",NOW);
  const first=submitAssessmentAnswer(s,p,"Studying physics",NOW);
  s=first.session;p=first.profile;
  assert.equal(currentQuestion(s).id,"overview");
  assert.equal(JSON.stringify(s).includes("Studying physics"),false);
  assert.equal(p.evidence.length,0);
  const second=submitAssessmentAnswer(s,p,5,NOW);
  s=second.session;p=second.profile;
  assert.equal(s.nextIndex,2);
  assert.ok(p.dimensions.overview_first.value>0.5);
  const skipped=submitAssessmentAnswer(s,p,null,NOW);
  assert.equal(skipped.session.skippedQuestionIds[0],"depth");
  assert.equal(skipped.profile.evidence.length,p.evidence.length);
});
test("display question exposes comparison stimulus at the right stage", () => {
  let s={...newSession(),nextIndex:ASSESSMENT.findIndex(x=>x.id==="format")};
  assert.equal(displayQuestion(s).comparisons.length,3);
  s={...s,nextIndex:ASSESSMENT.findIndex(x=>x.id==="overview")};
  assert.equal(displayQuestion(s).comparisons,null);
});
test("transfer feedback records binary check separately from style", () => {
  const s={...newSession(),nextIndex:ASSESSMENT.length-1};
  const p=createProfile("p",NOW);
  const result=submitAssessmentAnswer(s,p,"c",NOW);
  assert.equal(result.session.transferCheck.correct,true);
  assert.equal(result.session.nextIndex,ASSESSMENT.length);
  assert.equal(progress(result.session).done,true);
  assert.equal(result.profile.evidence.length,0);
  assert.throws(()=>submitAssessmentAnswer(s,p,"z",NOW),/Choose/);
});
