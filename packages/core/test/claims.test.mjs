import test from "node:test";
import assert from "node:assert/strict";
import { getClaimBar, CLAIM_BAR_VERSION, POSITIONING_MODE } from "../src/claims.ts";

test("claim bar is preferences-only with efficacy not claimed", () => {
  const bar = getClaimBar();
  assert.equal(bar.version, CLAIM_BAR_VERSION);
  assert.equal(bar.positioning, POSITIONING_MODE);
  assert.equal(bar.efficacy.status, "NOT_CLAIMED");
  assert.ok(bar.mayClaim.length >= 4);
  assert.ok(bar.mustNotClaim.some(c => /percentile/i.test(c)));
  assert.ok(bar.mustNotClaim.some(c => /efficac|learning gain/i.test(c)));
  assert.match(bar.summary, /does not prove/i);
  assert.ok(bar.mayClaim.some(c=>/host answers still require task-specific verification/i.test(c)));
  assert.ok(bar.mustNotClaim.some(c=>/improvement of every personalized answer/i.test(c)));
});
