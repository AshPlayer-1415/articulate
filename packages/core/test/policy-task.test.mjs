import test from "node:test";
import assert from "node:assert/strict";
import {
  createProfile, setPreferenceOverride, resolvePolicy, policyToPrompt, listLearningTasks
} from "../src/index.ts";

test("learning tasks include shipping and condition packaging", () => {
  assert.ok(listLearningTasks().includes("shipping"));
  assert.ok(listLearningTasks().includes("debugging"));
  let profile = createProfile("synthetic");
  profile = setPreferenceOverride(profile, "scaffolding", 0.55);
  profile = setPreferenceOverride(profile, "example_preference", 0.55);
  profile = setPreferenceOverride(profile, "interaction_level", 0.45);

  const concept = resolvePolicy(profile, "concept");
  const debug = resolvePolicy(profile, "debugging");
  const ship = resolvePolicy(profile, "shipping");
  const research = resolvePolicy(profile, "research");

  assert.match(policyToPrompt(debug), /task=debugging/);
  assert.match(debug.instructions.join("\n"), /exact error/);
  assert.ok(debug.instructions.some(i => /intermediate steps|worked example/i.test(i)));
  assert.match(ship.instructions.join("\n"), /ship checklist/i);
  assert.ok(ship.taskConditioning.appliedBiases.some(b => b.startsWith("task:shipping")));
  assert.match(research.instructions.join("\n"), /known vs unknown/i);
  assert.notDeepEqual(concept.instructions, ship.instructions);
});

test("task conditioning never drops factual invariants", () => {
  const profile = setPreferenceOverride(createProfile("x"), "overview_first", 0.9);
  for (const task of listLearningTasks()) {
    const policy = resolvePolicy(profile, task);
    assert.ok(policy.invariants.some(i => /Never change facts/i.test(i)));
    assert.ok(policy.invariants.some(i => /Task conditioning changes packaging/i.test(i)));
  }
});
