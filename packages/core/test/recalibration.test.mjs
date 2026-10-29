import test from "node:test";
import assert from "node:assert/strict";
import {
  createProfile, confirmProfile, setPreferenceOverride,
  recalibrationStatus, withCalibrationSnapshot, buildPersonalFeedback, DEFAULT_CALIBRATION_INTERVAL_DAYS
} from "../src/index.ts";

test("recalibration is due only after the interval from last calibration", () => {
  let profile = confirmProfile(createProfile("synthetic"), "2026-01-01T00:00:00.000Z");
  profile = withCalibrationSnapshot(profile, "2026-01-01T00:00:00.000Z");
  const early = recalibrationStatus(profile, "2026-02-01T00:00:00.000Z");
  assert.equal(early.due, false);
  assert.equal(early.intervalDays, DEFAULT_CALIBRATION_INTERVAL_DAYS);
  const later = recalibrationStatus(profile, "2026-04-02T00:00:00.000Z");
  assert.equal(later.due, true);
  assert.equal(later.requiresUserConfirm, true);
});

test("personal feedback compares local snapshots without percentiles", () => {
  let prior = confirmProfile(createProfile("synthetic"), "2026-01-01T00:00:00.000Z");
  prior = setPreferenceOverride(prior, "visual_structure", 0.2);
  prior = withCalibrationSnapshot(prior, "2026-01-01T00:00:00.000Z");
  let next = setPreferenceOverride(createProfile("synthetic"), "visual_structure", 0.95);
  next = confirmProfile(next, "2026-03-15T00:00:00.000Z");
  const feedback = buildPersonalFeedback(next, prior.calibrationHistory[0]);
  assert.match(feedback.summary, /shift/i);
  assert.ok(feedback.positives.some(p => /diagram|structured|visual/i.test(p)));
  assert.ok(feedback.softTips.length >= 1);
  assert.ok(feedback.prohibitions.every(p => /percentile|intelligence|facts/i.test(p)));
  assert.doesNotMatch(JSON.stringify(feedback), /top\s*\d+\s*%/i);
});

test("first confirmation feedback stays non-comparative and non-ranking", () => {
  const profile = confirmProfile(createProfile("synthetic"), "2026-01-01T00:00:00.000Z");
  const feedback = buildPersonalFeedback(profile, null);
  assert.match(feedback.summary, /first confirmed/i);
  assert.equal(feedback.shifts.length, 0);
  assert.doesNotMatch(feedback.summary, /percentile|top 10/i);
});
