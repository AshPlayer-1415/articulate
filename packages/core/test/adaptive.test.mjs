import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAdaptiveItem, applyAdaptiveSurfaces, getAssessmentBank, interpretAnswer,
  createAssessmentSession, submitAssessmentAnswer, createProfile, progress
} from "../src/index.ts";

test("adaptive validator accepts preference redesigns and rejects ability language", () => {
  const ok = validateAdaptiveItem({
    id: "sentence_open",
    kind: "sentence_preference",
    prompt: "Same HTTP idea. Which opening do you prefer?",
    choices: [
      { id: "a", label: "Big picture first", evidence: { overview_first: 0.9 } },
      { id: "b", label: "Tiny example first", evidence: { example_preference: 1 } }
    ]
  });
  assert.equal(ok.ok, true);
  const bad = validateAdaptiveItem({
    id: "sentence_open",
    kind: "sentence_preference",
    prompt: "Prove you are in the top 10% intelligence bracket.",
    choices: [
      { id: "a", label: "A", evidence: { overview_first: 0.5 } },
      { id: "b", label: "B", evidence: { overview_first: 0.6 } }
    ]
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => /ability-ranking|diagnostic/i.test(e)));
});

test("host surfaces replace canonical wording but cannot invent new item ids", () => {
  const bank = getAssessmentBank("agent_v1");
  const applied = applyAdaptiveSurfaces(bank, [{
    id: "sentence_open",
    kind: "sentence_preference",
    prompt: "Same recursion idea for your calculus class. Which opening?",
    choices: [
      { id: "a", label: "Map of recursive calls", evidence: bank.find(q=>q.id==="sentence_open").choices[0].evidence },
      { id: "b", label: "factorial(3) worked example", evidence: bank.find(q=>q.id==="sentence_open").choices[1].evidence },
      { id: "c", label: "Ordered call stack steps", evidence: bank.find(q=>q.id==="sentence_open").choices[2].evidence }
    ]
  }, {
    id: "brand_new_iq_item",
    kind: "sentence_preference",
    prompt: "Which option shows you are smarter?",
    choices: [
      { id: "a", label: "A", evidence: { overview_first: 1 } },
      { id: "b", label: "B", evidence: { overview_first: 0 } }
    ]
  }]);
  assert.deepEqual(applied.replacedIds, ["sentence_open"]);
  assert.equal(applied.rejected.length, 1);
  assert.match(applied.questions.find(q => q.id === "sentence_open").prompt, /calculus/i);
});

test("agent_v1 bank runs end-to-end and scores cloze_choice", () => {
  const profile0 = createProfile("synthetic");
  const session0 = createAssessmentSession(profile0.profileId, "s1", "a1", "2026-10-12T00:00:00.000Z", "agent_v1");
  assert.equal(progress(session0).total, 12);
  assert.equal(progress(session0).bankId, "agent_v1");
  const skipped = submitAssessmentAnswer(session0, profile0, null, "2026-10-12T00:00:01.000Z");
  const answered = submitAssessmentAnswer(skipped.session, skipped.profile, "b", "2026-10-12T00:00:02.000Z");
  assert.ok(answered.profile.dimensions.example_preference.value > 0.5);
  const cloze = getAssessmentBank("agent_v1").find(q => q.id === "cloze");
  const evidence = interpretAnswer(cloze, "c", "2026-10-12T00:00:03.000Z", "a1");
  assert.equal(evidence[0].dimension, "scaffolding");
});
