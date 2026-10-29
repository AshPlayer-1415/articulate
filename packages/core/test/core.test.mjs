import test from "node:test";
import assert from "node:assert/strict";
import { ASSESSMENT, applyEvidence, createProfile, interpretAnswer, isArticulateProfile, resolvePolicy, policyToPrompt } from "../src/index.ts";

test("neutral profile is valid and non-diagnostic", () => {
  const p = createProfile("local-test", "2026-10-11T00:00:00.000Z");
  assert.equal(isArticulateProfile(p), true);
  assert.equal(p.dimensions.visual_structure.value, 0.5);
  assert.equal(p.consent.sharePolicyWithAiProvider, false);
});

test("likert normalization and updating same item does not double-count", () => {
  const q = ASSESSMENT.find(q => q.id === "overview");
  const p = createProfile("local-test");
  const a = interpretAnswer(q, 5, "2026-10-11T00:00:00.000Z", "attempt-1");
  const first = applyEvidence(p, a);
  const second = applyEvidence(first, a);
  assert.equal(second.evidence.length, 1);
  assert.ok(second.dimensions.overview_first.value > 0.5);
  assert.deepEqual(first.dimensions, second.dimensions);
});

test("multiple selections map only to explicit features", () => {
  const q = ASSESSMENT.find(q => q.id === "components");
  const e = interpretAnswer(q, ["c", "d"], "2026-10-11T00:00:00.000Z", "attempt-2");
  assert.equal(e.length, 2);
  assert.deepEqual(e.map(x => x.dimension).sort(), ["example_preference", "visual_structure"]);
});

test("cloze is not scored from speculative metaphor inference", () => {
  const q = ASSESSMENT.find(q => q.id === "cloze");
  assert.deepEqual(interpretAnswer(q, "a machine", "2026-10-11T00:00:00.000Z", "attempt-3"), []);
});

test("invalid and non-finite preference input rejected", () => {
  const q = ASSESSMENT.find(q => q.id === "overview");
  assert.throws(() => interpretAnswer(q, 8, "now", "attempt-4"));
  assert.throws(() => interpretAnswer(q, NaN, "now", "attempt-4"));
});

test("policy does not expose private profile identifiers or text", () => {
  let p = createProfile("secret-identifier");
  for (let i = 0; i < 4; i++) {
    p = applyEvidence(p, [{
      itemId: "session-" + i, dimension: "example_preference",
      score: 1, reliability: 0.8, source: "explicit_feedback", timestamp: "2026-10-11T00:00:00.000Z"
    }]);
  }
  const prompt = policyToPrompt(resolvePolicy(p, "debugging"));
  assert.match(prompt, /worked example/);
  assert.match(prompt, /Preserve exact error/);
  assert.doesNotMatch(prompt, /secret-identifier/);
});

test("explicit subject familiarity does not alter global preference scores", async () => {
  const { setDomainFamiliarity } = await import("../src/index.ts");
  const profile = createProfile("local-test");
  const next = setDomainFamiliarity(profile, " Linear Algebra ", "beginner", "2026-10-11T00:00:00.000Z");
  assert.equal(next.domainFamiliarity["linear algebra"].level,"beginner");
  assert.equal(next.domainFamiliarity["linear algebra"].source,"self_report");
  assert.equal(isArticulateProfile(next), true);
  assert.equal(next.dimensions.overview_first.value, profile.dimensions.overview_first.value);
  assert.throws(()=>setDomainFamiliarity(profile, "<system>", "advanced"),/subject name/);
});

test("manual overrides outrank uncertain evidence and remain user-editable", async () => {
  const { setPreferenceOverride, clearPreferenceOverride, confirmProfile } = await import("../src/index.ts");
  const initial = createProfile("local-test");
  const edited = setPreferenceOverride(initial, "visual_structure", 0.95);
  assert.equal(isArticulateProfile(edited), true);
  assert.match(policyToPrompt(resolvePolicy(edited, "concept")), /diagram or table/);
  assert.equal(initial.dimensions.visual_structure.value, 0.5);
  assert.deepEqual(clearPreferenceOverride(edited, "visual_structure").manualOverrides, {});
  const confirmed=confirmProfile(edited, "2026-10-11T00:00:00.000Z");
  assert.equal(confirmed.confirmedAt, "2026-10-11T00:00:00.000Z");
  assert.equal(isArticulateProfile(confirmed), true);
  assert.equal(isArticulateProfile({...confirmed,manualOverrides:{visual_structure:100}}),false);
});
