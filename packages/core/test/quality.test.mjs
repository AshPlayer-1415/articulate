import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createProfile, setPreferenceOverride, createComparisonPreview,
  COMPARISON_STIMULI, isQualityFixture, evaluateQuality, evaluateQualitySuite,
  normalizeQualityText, policyToPrompt, resolvePolicy
} from "../src/index.ts";

const data=JSON.parse(await readFile(new URL("../../../quality/fixtures.json",import.meta.url),"utf8"));
const fixtures=data.fixtures;

test("quality fixtures are valid, unique, and cover every task",()=>{
  assert.equal(data.version,1);
  assert.equal(new Set(fixtures.map(x=>x.id)).size,fixtures.length);
  assert.deepEqual(new Set(fixtures.map(x=>x.task)),new Set([
    "concept","mathematics","debugging","research"
  ]));
  for(const fixture of fixtures)assert.equal(isQualityFixture(fixture),true,fixture.id);
});

test("every original baseline and adapted exemplar passes; every seeded omission/contradiction is blocked",()=>{
  const report=evaluateQualitySuite(fixtures);
  assert.deepEqual(report.failures,[]);
  assert.equal(report.passed,true);
  assert.equal(report.positiveCasesPassed,fixtures.length*2);
  assert.equal(report.negativeCasesRejected,fixtures.reduce((total,f)=>total+f.examples.regressions.length,0));
});

test("checker provides redacted anchor IDs, not private candidate text",()=>{
  const fixture=fixtures.find(f=>f.id==="debugging-undefined");
  const privateMarker="LOCAL_SECRET_STRING_FOR_NEGATIVE_TEST";
  const report=evaluateQuality(fixture,privateMarker);
  assert.equal(report.guardPassed,false);
  assert.ok(report.missingRequired.includes("exact-error"));
  assert.equal(report.manualSemanticReviewRequired,true);
  assert.equal(JSON.stringify(report).includes(privateMarker),false);
});

test("advisory formatting signal cannot override factual guard",()=>{
  const fixture=fixtures.find(f=>f.id==="math-factorial");
  const sample="### Worked steps\n1. The base case is factorial(1) = 1. Now use 4 × 3 × 2 × 1.";
  const report=evaluateQuality(fixture,sample);
  assert.equal(report.missingFormatSignals.length,0);
  assert.equal(report.guardPassed,false);
  assert.ok(report.missingRequired.includes("result"));
});

test("the literal guard is not presented as a semantic checker",()=>{
  const fixture=fixtures.find(f=>f.id==="research-uncertainty");
  // This contains every positive span and none of the fixed forbidden spans,
  // but it could still be misleading. Human semantic review remains mandatory.
  const superficiallyPassing=fixture.examples.baseline+
    " It may imply something important in practice.";
  const report=evaluateQuality(fixture,superficiallyPassing);
  assert.equal(report.guardPassed,true);
  assert.equal(report.manualSemanticReviewRequired,true);
  assert.match(report.notes.join(" "),/cannot|does not|cannot prove/i);
});

test("normalization tolerates whitespace and typography but not changed quantities",()=>{
  assert.equal(normalizeQualityText("  “FACT” \n Test —  24 "),'\"fact\" test - 24');
  const fixture=fixtures.find(f=>f.id==="math-factorial");
  const altered=fixture.examples.adapted.replace("factorial(4) = 24","factorial(4) = 25");
  assert.equal(evaluateQuality(fixture,altered).guardPassed,false);
});

test("invalid fixtures and oversized candidates fail closed",()=>{
  const fixture=fixtures[0];
  assert.equal(isQualityFixture({...fixture,required:[]}),false);
  assert.equal(isQualityFixture({...fixture,required:[...fixture.required,fixture.required[0]]}),false);
  assert.equal(isQualityFixture({...fixture,prohibited:[{id:"bad",label:"bad",oneOf:[""]}]}),false);
  assert.throws(()=>evaluateQuality(fixture,"x".repeat(32769)),/32768/);
  assert.throws(()=>evaluateQualitySuite([fixture,fixture]),/Invalid or duplicate/);
});

test("all curated previews preserve literal canonical claims across preference extremes",()=>{
  const topics=Object.keys(COMPARISON_STIMULI);
  for(const visual of [0,0.5,1]){
    for(const overview of [0,1]){
      let profile=createProfile("synthetic-only");
      profile=setPreferenceOverride(profile,"visual_structure",visual);
      profile=setPreferenceOverride(profile,"overview_first",overview);
      for(const topic of topics){
        const preview=createComparisonPreview(profile,topic);
        for(const fact of preview.canonicalFacts){
          assert.ok(preview.standard.includes(fact),topic+": missing standard fact "+fact);
          assert.ok(preview.adapted.includes(fact),topic+": missing adapted fact "+fact);
        }
      }
    }
  }
});

test("all task policies retain invariant safety and factual constraints",()=>{
  const profile=setPreferenceOverride(createProfile("synthetic"),"scaffolding",1);
  for(const task of ["concept","debugging","mathematics","research"]){
    const prompt=policyToPrompt(resolvePolicy(profile,task));
    assert.match(prompt,/Never change facts, numbers, uncertainty, equations/);
    assert.match(prompt,/Higher-priority host and safety instructions/);
    assert.doesNotMatch(prompt,/synthetic/);
  }
});
