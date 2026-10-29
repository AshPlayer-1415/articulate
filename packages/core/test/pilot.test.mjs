import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isPilotCatalog,
  listPilotTopics,
  assignPilotPair,
  buildPilotSessionPlan,
  aggregatePilotScores,
  screenTransferAnswer,
  validatePilotRecord
} from "../src/pilot.ts";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const catalog = JSON.parse(
  await readFile(path.join(root, "quality/pilot-topics.json"), "utf8")
);

test("pilot catalog validates and lists four synthetic topics", () => {
  assert.equal(isPilotCatalog(catalog), true);
  assert.equal(listPilotTopics(catalog).length, 4);
  assert.equal(catalog.pairs.length, 2);
});

test("counterbalance flips default/adapted by participant slot", () => {
  const even = assignPilotPair(catalog, "pair-energy-storage", 0);
  const odd = assignPilotPair(catalog, "pair-energy-storage", 1);
  assert.equal(even.order[0].condition, "default");
  assert.equal(even.order[1].condition, "adapted");
  assert.equal(odd.order[0].condition, "adapted");
  assert.equal(odd.order[1].condition, "default");
});

test("session plan blanks scores and lists prohibitions", () => {
  const plan = buildPilotSessionPlan(catalog, 2);
  assert.equal(plan.scoreSheets.length, 4);
  assert.ok(plan.scoreSheets.every(s => s.conceptRubric0to3 === null));
  assert.ok(plan.prohibitions.some(p => /efficacy/i.test(p)));
});

test("aggregate is always dry-run not efficacy", () => {
  const records=buildPilotSessionPlan(catalog,0).scoreSheets.map(s=>({...s,
    conceptRubric0to3:s.condition==="adapted"?3:2,transferCorrect:true,safetyGateFailed:false
  }));
  const summary=aggregatePilotScores(records);
  assert.equal(summary.status, "DRY_RUN_ONLY_NOT_EFFICACY_EVIDENCE");
  assert.equal(summary.nPairedConceptScores, 2);
  assert.equal(summary.meanAdaptedMinusDefault, 1);
  assert.match(summary.disclaimer, /NOT.*efficacy/i);
});

test("validatePilotRecord rejects bad rubrics", () => {
  assert.throws(() => validatePilotRecord({
    topicId: "x", condition: "default", conceptRubric0to3: 4, transferCorrect: true
  }));
});

test("transfer screen is literal cue only", () => {
  const topic = listPilotTopics(catalog).find(t => t.id === "topic-photosynthesis-mech");
  const hit = screenTransferAnswer(topic, "Oxygen would increase in the closed terrarium.");
  assert.equal(hit.likelyCorrect, true);
  assert.ok(hit.note.includes("Human rubric"));
});

 test("pilot aggregation preserves participants and rejects duplicates, with safety exclusions",()=>{
  const records=[0,1].flatMap(slot=>buildPilotSessionPlan(catalog,slot).scoreSheets.map(s=>({...s,
    conceptRubric0to3:s.condition==="adapted"?3:1,transferCorrect:true,safetyGateFailed:false
  })));
  assert.equal(aggregatePilotScores(records).nPairedConceptScores,4);
  assert.throws(()=>aggregatePilotScores([...records,records[0]]),/Duplicate/);
  records[0].safetyGateFailed=true;
  const result=aggregatePilotScores(records);
  assert.equal(result.excludedSafetyPairs,1);
  assert.equal(result.nPairedConceptScores,3);
 });
