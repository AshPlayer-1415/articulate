import test from "node:test";
import assert from "node:assert/strict";
import { applyEvidence, createComparisonPreview, createProfile } from "../src/index.ts";

test("standard and adapted preview contain every canonical fact unchanged", () => {
  const p=createProfile("synthetic");
  const preview=createComparisonPreview(p);
  for (const claim of preview.canonicalFacts) {
    assert.ok(preview.standard.includes(claim), "missing baseline fact: " + claim);
    assert.ok(preview.adapted.includes(claim), "missing adapted fact: " + claim);
  }
  assert.notEqual(preview.standard, preview.adapted);
  assert.equal(preview.standard.includes("Articulate"),false);
});
test("overview-first evidence changes preview structure without losing facts", () => {
  let p=createProfile("synthetic");
  for (let i=0;i<4;i++){
    p=applyEvidence(p,[{itemId:"item-"+i,dimension:"overview_first",score:1,reliability:0.8,
      source:"explicit_feedback",timestamp:"2026-10-11T00:00:00.000Z"}]);
  }
  const preview=createComparisonPreview(p);
  assert.ok(preview.adapted.includes("### Big picture"));
  assert.equal(preview.adapted.includes("### Worked example"),true);
});

test("all curated demo topics preserve each canonical fact verbatim", async () => {
  const { COMPARISON_STIMULI } = await import("../src/index.ts");
  const p = createProfile("synthetic");
  for (const topic of ["comparison","format","photosynthesis"]) {
    const example = createComparisonPreview(p, topic);
    assert.equal(example.title, COMPARISON_STIMULI[topic].concept);
    for (const fact of example.canonicalFacts) {
      assert.ok(example.standard.includes(fact),topic+" standard omitted "+fact);
      assert.ok(example.adapted.includes(fact),topic+" adapted omitted "+fact);
    }
  }
});
