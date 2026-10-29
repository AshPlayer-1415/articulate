import test from "node:test";
import assert from "node:assert/strict";
import {createProfile,confirmProfile,beginAssessment,assessmentProfile,finishAssessment,
  submitAssessmentAnswer,currentQuestion,progress,applyAdaptiveSurfaces,getAssessmentBank,
  displayQuestion,isAssessmentSession,createAssessmentSession,normalizeArticulationPatterns,compileStylePolicy} from "../src/index.ts";
const at="2026-10-23T00:00:00.000Z";
test("draft answers and cancellation leave active evidence unchanged; promotion replaces old round",()=>{
  const active=confirmProfile(createProfile("synthetic"),at);
  let s=beginAssessment(active,"session","attempt",at,"agent_v2");
  const before=structuredClone(active);
  while(!progress(s).done) {
    const q=currentQuestion(s);
    const result=submitAssessmentAnswer(s,active,q.kind==="free_text"?"Synthetic context":q.choices[0].id,at);
    s=result.session;assert.deepEqual(result.profile,before);
  }
  assert.ok(assessmentProfile(active,s).evidence.length>0);
  const promoted=finishAssessment(active,s,at);
  assert.ok(promoted.profile.confirmedAt);
  assert.ok(promoted.profile.evidence.length>0);
  assert.equal(promoted.session.draftProfile,undefined);
});
test("adaptive scoring, kinds, ids and Likert binding cannot change; personalized comparisons are rendered",()=>{
  const bank=getAssessmentBank("agent_v1");
  for(const id of ["sentence_open","overview","format"]) {
    const q=structuredClone(bank.find(q=>q.id===id));
    const mutated=structuredClone(q);
    if(id==="overview") mutated.dimension="detail_level";
    else mutated.choices[0].evidence={detail_level:1};
    assert.equal(applyAdaptiveSurfaces(bank,[mutated]).replacedIds.length,0);
    const wrongKind={...q,kind:q.kind==="likert"?"free_text":"single_choice"};
    assert.equal(applyAdaptiveSurfaces(bank,[wrongKind]).replacedIds.length,0);
  }
  const q=structuredClone(bank.find(q=>q.id==="format"));
  q.prompt="Choose a database transaction presentation.";
  q.choices=q.choices.map(c=>({...c,text:"Database transaction "+c.id}));
  const applied=applyAdaptiveSurfaces(bank,[q]);
  assert.deepEqual(applied.replacedIds,["format"]);
  const active=createProfile("synthetic");
  const s={...beginAssessment(active,"session","attempt",at,"agent_v1",applied.questions),nextIndex:4};
  const displayed=displayQuestion(s);
  for(const option of displayed.comparisons) {
    assert.match(option.text,/Database transaction/);
    assert.doesNotThrow(()=>submitAssessmentAnswer(s,active,option.id,at));
  }
  const tampered=structuredClone(s);
  tampered.surfaceOverrides[4].choices[0].evidence={detail_level:1};
  assert.equal(isAssessmentSession(tampered),false);
});
test("every accepted pattern appears in policy",()=>{
  const p=createProfile("synthetic");
  p.articulationPatterns=normalizeArticulationPatterns(Array.from({length:24},(_,i)=>({
    situation:"Synthetic situation "+(i+1),wantedOutput:"Lead with the relevant decision",gap:"The summary buried the actionable finding",readback:"Read the decision before the detailed evidence"
  })));
  const result=compileStylePolicy(p);
  assert.ok(result.instructions.some(x=>x.includes("Synthetic situation 24:")));
});

 test("legacy sessions cannot mutate a confirmed profile when resumed by the new engine",()=>{
  const active=confirmProfile(createProfile("legacy-synthetic"),at);
  const legacy={...createAssessmentSession(active.profileId,"legacy","attempt",at,"agent_v2"),nextIndex:1};
  const result=submitAssessmentAnswer(legacy,active,"b",at);
  assert.deepEqual(result.profile,active);
  assert.ok(result.session.draftProfile.evidence.length>0);
 });
