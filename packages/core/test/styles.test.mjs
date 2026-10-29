import test from "node:test";
import assert from "node:assert/strict";
import {
  createProfile,
  getStyleQuestionKit,
  normalizeNamedStyles,
  normalizeArticulationPatterns,
  storedStylesAreValid,
  compileStylePolicy,
  stylePolicyToPrompt,
  isArticulateProfile
} from "../src/index.ts";

const sample = [
  { name: "PR review", responseShape: "Verdict first, then risks, skip the history.", isDefault: true },
  { name: "Learning Rust", responseShape: "Short explanation, one example, then one check question.", isDefault: false }
];

test("style kit asks the host to phrase needs from the project", () => {
  const kit = getStyleQuestionKit();
  assert.equal(kit.needs.length, 5);
  assert.ok(kit.spine[0].includes("one-line answer"));
  assert.ok(kit.needs.some(n => n.id === "style_name_and_shape"));
  assert.match(kit.hostInstructions.join(" "), /Do not send project text/i);
});

test("normalize keeps one default and rejects dumps", () => {
  const styles = normalizeNamedStyles(sample);
  assert.equal(storedStylesAreValid(styles), true);
  assert.equal(styles[0].id, "style-1");
  assert.equal(styles.filter(s => s.isDefault).length, 1);
  assert.throws(() => normalizeNamedStyles([
    { name: "Notes", responseShape: "Keep it short and lead with the decision.", isDefault: false }
  ]), /exactly one default/i);
  assert.throws(() => normalizeNamedStyles([
    { name: "Dump", responseShape: "User: hello\nAssistant: hi\nUser: more\nAssistant: ok", isDefault: true }
  ]), /transcript/i);
  assert.throws(() => normalizeNamedStyles([
    { name: "X".repeat(41), responseShape: "Verdict first, then the risks only.", isDefault: true }
  ]), /40/);
});

test("named style leads policy and spine stays underneath", () => {
  const profile = {
    ...createProfile("local-test"),
    schemaVersion: "0.2.0",
    styles: normalizeNamedStyles(sample),
    confirmedAt: "2026-10-19T00:00:00.000Z",
    consent: {
      localPersistence: true,
      sharePolicyWithAiProvider: true,
      optionalResearchTelemetry: false
    }
  };
  assert.equal(isArticulateProfile(profile), true);
  const policy = compileStylePolicy(profile, "concept", "Learning Rust");
  assert.equal(policy.source, "named_style");
  assert.equal(policy.styleName, "Learning Rust");
  assert.equal(policy.instructions[0], sample[1].responseShape);
  assert.ok(policy.instructions.some(line => line.includes("don't-miss")));
  const text = stylePolicyToPrompt(policy);
  assert.match(text, /Never change facts/);
  assert.match(text, /Learning Rust/);
});

test("approved pattern notes enter policy and transcripts are refused", () => {
  const notes = normalizeArticulationPatterns([{
    situation: "Reviewing a pull request",
    wantedOutput: "Verdict first, then the risks.",
    gap: "The reply buried the decision under a long summary.",
    readback: "They skim for the decision line and then the risks."
  }]);
  const profile = {
    ...createProfile("local-patterns"),
    schemaVersion: "0.2.0",
    articulationPatterns: notes,
    confirmedAt: "2026-10-22T00:00:00.000Z",
    consent: {
      localPersistence: true,
      sharePolicyWithAiProvider: true,
      optionalResearchTelemetry: false
    }
  };
  assert.equal(isArticulateProfile(profile), true);
  const text = stylePolicyToPrompt(compileStylePolicy(profile, "concept"));
  assert.match(text, /Reviewing a pull request/);
  assert.match(text, /buried the decision/);
  assert.throws(() => normalizeArticulationPatterns([{
    situation: "User: hi\nAssistant: hello\nUser: more\nAssistant: ok",
    wantedOutput: "Keep the answer short and lead with the decision.",
    gap: "The reply was too long to skim.",
    readback: "They look for the first line only."
  }]), /transcript/i);
});

test("profiles without styles keep the spine and dimension instructions", () => {
  const profile = createProfile("local-old");
  profile.confirmedAt = "2026-10-19T00:00:00.000Z";
  const policy = compileStylePolicy(profile, "concept");
  assert.equal(policy.source, "spine_and_dimensions");
  assert.match(policy.instructions[0], /one-line answer/);
  assert.equal(isArticulateProfile(profile), true);
});
