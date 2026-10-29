import test from "node:test";
import assert from "node:assert/strict";
import {
  proposeHabitsFromSignals, applyHabitPriors, createProfile, getAssessmentBank,
  createAssessmentSession, progress, submitAssessmentAnswer
} from "../src/index.ts";

test("habit proposal maps signals to priors and draft instructions", () => {
  const p = proposeHabitsFromSignals(["example_first", "diagrams", "map_first"]);
  assert.equal(p.path, "habit_first");
  assert.equal(p.bankId, "agent_v2");
  assert.ok(p.habitPrior.example_preference > 0.6);
  assert.ok(p.habitPrior.visual_structure > 0.6);
  assert.ok(p.draftInstructions.length >= 1);
  assert.match(p.draftPolicyText, /ARTICULATE/);
});

test("agent_v2 is a 6-item bank and runs end-to-end with habit priors", () => {
  assert.equal(getAssessmentBank("agent_v2").length, 6);
  let profile = createProfile("synthetic");
  profile = applyHabitPriors(profile, { example_preference: 0.8, overview_first: 0.7 }, "2026-10-12T00:00:00.000Z");
  assert.ok(profile.evidence.some(e => e.source === "habit_prior"));
  let session = createAssessmentSession(profile.profileId, "s", "a", "2026-10-12T00:00:00.000Z", "agent_v2");
  assert.equal(progress(session).total, 6);
  assert.equal(progress(session).bankId, "agent_v2");
  const answers = {
    background: "shipping systems",
    sentence_open: "b",
    organization: "a",
    format: "b",
    cloze: "b",
    comparison: "c"
  };
  for (let i = 0; i < 6; i++) {
    const q = getAssessmentBank("agent_v2")[session.nextIndex];
    const next = submitAssessmentAnswer(session, profile, answers[q.id], `2026-10-12T00:00:0${i + 1}.000Z`);
    session = next.session;
    profile = next.profile;
  }
  assert.equal(progress(session).done, true);
  assert.ok(profile.dimensions.example_preference.value > 0.5);
});
