import test from "node:test";
import assert from "node:assert/strict";
import {
  createProfile, confirmProfile, applyShapeFeedback, listShapeFeedbackIds, resolvePolicy
} from "../src/index.ts";

test("shape feedback list is the four packaging corrections", () => {
  assert.deepEqual(listShapeFeedbackIds().sort(), ["checklist", "example", "map", "steps"]);
});

test("map vs steps micro-updates shift packaging without inventing ability claims", () => {
  let profile = confirmProfile(createProfile("synthetic"), "2026-10-12T00:00:00.000Z");
  const mapped = applyShapeFeedback(profile, "map", "2026-10-12T01:00:00.000Z");
  assert.equal(mapped.shape, "map");
  assert.match(mapped.tip, /map/i);
  assert.ok(mapped.profile.dimensions.overview_first.value >
    profile.dimensions.overview_first.value);
  assert.ok(mapped.profile.evidence.some(e => e.itemId === "shape_feedback:map"));

  const stepped = applyShapeFeedback(mapped.profile, "steps", "2026-10-12T02:00:00.000Z");
  assert.ok(stepped.profile.dimensions.scaffolding.value >=
    mapped.profile.dimensions.scaffolding.value);
  const policy = resolvePolicy(stepped.profile, "debugging");
  assert.doesNotMatch(JSON.stringify(policy), /iq|percentile|intelligence/i);
  assert.match(mapped.note, /Micro-update/i);
});

test("repeating the same shape refreshes rather than duplicating evidence keys", () => {
  let profile = confirmProfile(createProfile("synthetic"), "2026-10-12T00:00:00.000Z");
  profile = applyShapeFeedback(profile, "example", "2026-10-12T01:00:00.000Z").profile;
  profile = applyShapeFeedback(profile, "example", "2026-10-12T02:00:00.000Z").profile;
  const keys = profile.evidence.filter(e => e.itemId === "shape_feedback:example");
  assert.equal(keys.length, new Set(keys.map(e => e.itemId + ":" + e.dimension)).size);
});
