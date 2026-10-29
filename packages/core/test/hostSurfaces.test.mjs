import test from "node:test";
import assert from "node:assert/strict";
import {
  getHostSurfaceKit, buildDomainAdaptiveDrafts, applyAdaptiveSurfaces,
  getAssessmentBank, validateAdaptiveItem, ARTICULATE_VERSION
} from "../src/index.ts";

test("host surface kit exposes locked evidence and pattern signals", () => {
  const kit = getHostSurfaceKit();
  assert.equal(kit.version, ARTICULATE_VERSION);
  assert.ok(kit.minPersonalizedSlots >= 5);
  assert.ok(kit.patternSignals.some(s => s.id === "builder_context"));
  assert.ok(kit.slots.some(s => s.id === "sentence_open" && s.lockedEvidence?.b?.example_preference === 1));
});

test("domain drafts personalize agent_v1 without inventing item ids", () => {
  const drafts = buildDomainAdaptiveDrafts("ML engineering");
  assert.ok(drafts.length >= 5);
  for (const d of drafts) {
    const v = validateAdaptiveItem(d);
    assert.equal(v.ok, true, `${d.id}: ${v.errors?.join("; ")}`);
  }
  const applied = applyAdaptiveSurfaces(getAssessmentBank("agent_v1"), drafts);
  assert.ok(applied.replacedIds.length >= 5);
  assert.equal(applied.rejected.length, 0);
  assert.match(applied.questions.find(q => q.id === "sentence_open").prompt, /ML engineering/i);
  assert.match(applied.questions.find(q => q.id === "background").prompt, /ML engineering/i);
});

test("free_text adaptive surfaces are allowed for background only", () => {
  const ok = validateAdaptiveItem({
    id: "background",
    kind: "free_text",
    prompt: "What do you usually use AI for at work, briefly?"
  });
  assert.equal(ok.ok, true);
  const bad = validateAdaptiveItem({
    id: "background",
    kind: "free_text",
    prompt: "Prove your IQ with a short essay.",
    dimension: "overview_first"
  });
  assert.equal(bad.ok, false);
});
