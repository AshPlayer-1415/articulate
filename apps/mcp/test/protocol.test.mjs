import release from "../../../release.json" with {type:"json"};
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

test("real stdio JSON-RPC negotiation, tool discovery and consent enforcement", {timeout:30000}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "articulate-protocol-"));
  const client = new Client({ name:"articulate-test-client",version:"0.1.0" });
  const serverFile = fileURLToPath(new URL("../src/server.mjs",import.meta.url));
  const transport = new StdioClientTransport({
    command:process.execPath,
    args:["--experimental-strip-types",serverFile],
    env:{...process.env,ARTICULATE_DATA_DIR:directory}
  });
  try {
    await client.connect(transport);
    const {tools}=await client.listTools();
    const names=tools.map(x=>x.name);
    assert.ok(names.includes("articulate_start"));
    assert.ok(names.includes("articulate_get_policy"));
    assert.ok(names.includes("articulate_open_permission_window"));
    assert.ok(names.includes("articulate_quality_cases"));
    assert.ok(names.includes("articulate_quality_check"));
    assert.ok(names.includes("articulate_present_answer"));
    const presented=await client.callTool({name:'articulate_present_answer',arguments:{blocks:[{kind:'answer',content:'{"saved":false,"error":"E_TEST_19"}'}],layout:'labeled',constraints:{format:'exact'}}});
    const rendered=JSON.parse(presented.content[0].text);
    assert.equal(rendered.answer,'{"saved":false,"error":"E_TEST_19"}');
    assert.equal(rendered.verification.factualAccuracyVerified,false);
    const badPresentation=await client.callTool({name:'articulate_present_answer',arguments:{blocks:[{kind:'answer',content:'synthetic'}],layout:'labeled',constraints:{format:'free'},execute:true}});
    assert.equal(badPresentation.isError,true);
    const nonStringKind=await client.callTool({name:'articulate_present_answer',arguments:{blocks:[{kind:['answer'],content:'synthetic input'}],layout:'labeled',constraints:{format:'free'}}});
    assert.equal(nonStringKind.isError,true);
    assert.ok(names.includes("articulate_pilot_topics"));
    assert.ok(names.includes("articulate_pilot_plan"));
    assert.ok(names.includes("articulate_pattern_kit"));
    assert.ok(names.includes("articulate_list_patterns"));
    assert.ok(names.includes("articulate_style_kit"));
    assert.ok(names.includes("articulate_save_styles"));
    const cases=await client.callTool({name:"articulate_quality_cases",arguments:{}});
    assert.equal(JSON.parse(cases.content[0].text).cases.length,5);
    const pilot=await client.callTool({name:"articulate_pilot_topics",arguments:{}});
    const pilotBody=JSON.parse(pilot.content[0].text);
    assert.equal(pilotBody.pairs.length,2);
    const plan=await client.callTool({name:"articulate_pilot_plan",arguments:{participantSlot:1}});
    const planBody=JSON.parse(plan.content[0].text);
    assert.equal(planBody.scoreSheets.length,4);
    assert.equal(planBody.assignments[0].order[0].condition,"adapted");
    const agg=await client.callTool({name:"articulate_pilot_aggregate",arguments:{records:[
      {participantSlot:0,pairId:"pair-energy-storage",topicId:"topic-photosynthesis-mech",condition:"default",conceptRubric0to3:2,transferCorrect:true},
      {participantSlot:0,pairId:"pair-energy-storage",topicId:"topic-battery-chem-energy",condition:"adapted",conceptRubric0to3:3,transferCorrect:true}
    ]}});
    assert.equal(JSON.parse(agg.content[0].text).status,"DRY_RUN_ONLY_NOT_EFFICACY_EVIDENCE");
    const defect=await client.callTool({name:"articulate_quality_check",arguments:{
      caseId:"math-factorial",candidate:"factorial(4) = 12. The base case is factorial(1) = 1. Multiply 4 × 3 × 2 × 1."
    }});
    const review=JSON.parse(defect.content[0].text);
    assert.equal(review.guardPassed,false);
    assert.ok(review.detectedProhibited.includes("wrong-result"));
    assert.equal(review.candidateWasSaved,false);
    const status=await client.callTool({name:"articulate_status",arguments:{}});
    const statusBody=JSON.parse(status.content[0].text);
    assert.equal(statusBody.hasProfile,false);
    assert.equal(statusBody.claimBar.positioning,"preferences_only");
    assert.equal(statusBody.claimBar.efficacy.status,"NOT_CLAIMED");
    assert.equal(statusBody.bundleVersion,release.version);
    assert.equal(statusBody.hostBootstrap.defaultPath,"named_styles");
    const kit=await client.callTool({name:"articulate_style_kit",arguments:{}});
    assert.equal(JSON.parse(kit.content[0].text).needs.length,5);
    const deniedSave=await client.callTool({name:"articulate_save_styles",arguments:{
      localStorageConsent:false,userApproved:true,styles:[
        {name:"Notes",responseShape:"Verdict first, then the risks.",isDefault:true}
      ]
    }});
    assert.equal(deniedSave.isError,true);
    const denied=await client.callTool({name:"articulate_start",arguments:{localStorageConsent:false}});
    assert.equal(denied.isError,true);
    const begun=await client.callTool({name:"articulate_start",arguments:{localStorageConsent:true}});
    const first=JSON.parse(begun.content[0].text);
    assert.equal(first.question.id,"background");
    const answer=await client.callTool({name:"articulate_answer",arguments:{sessionId:first.sessionId,questionId:"background",answer:"intro algebra"}});
    assert.equal(JSON.parse(answer.content[0].text).question.id,"sentence_open");
    const noConsent=await client.callTool({name:"articulate_open_permission_window",arguments:{userRequested:false}});
    assert.equal(noConsent.isError,true);
    const policy=await client.callTool({name:"articulate_get_policy",arguments:{task:"concept"}});
    assert.equal(policy.isError,true);
    assert.match(policy.content[0].text,/sharing is disabled/i);
    await client.callTool({name:"articulate_cancel_assessment",arguments:{userApproved:true}});
    const saved=await client.callTool({name:"articulate_save_styles",arguments:{
      localStorageConsent:true,
      userApproved:true,
      styles:[
        {name:"Notes",responseShape:"Verdict first, then the risks.",isDefault:true}
      ]
    }});
    assert.equal(JSON.parse(saved.content[0].text).defaultStyle,"Notes");
    const { ArticulateLocalService } = await import("../src/service.mjs");
    const trustedLocal = new ArticulateLocalService(directory);
    await trustedLocal.exclusive(async () => {
      const profile = await trustedLocal.profileStore.load();
      await trustedLocal.profileStore.save({...profile, consent:{...profile.consent,sharePolicyWithAiProvider:true}});
    });
    const styled=await client.callTool({name:"articulate_get_policy",arguments:{task:"concept",styleName:"Notes"}});
    assert.match(JSON.parse(styled.content[0].text).instructionText,/Verdict first/);
    const patterns=await client.callTool({name:"articulate_save_patterns",arguments:{
      localStorageConsent:true,
      userApproved:true,
      patterns:[{
        situation:"Reviewing a pull request",
        wantedOutput:"Verdict first, then the risks.",
        gap:"The reply buried the decision under a long summary.",
        readback:"They skim for the decision line and then the risks."
      }]
    }});
    assert.equal(JSON.parse(patterns.content[0].text).patternCount,1);
    const listed=await client.callTool({name:"articulate_list_patterns",arguments:{}});
    assert.equal(JSON.parse(listed.content[0].text).patterns[0].situation,"Reviewing a pull request");
    const withNotes=await client.callTool({name:"articulate_get_policy",arguments:{task:"concept"}});
    assert.match(JSON.parse(withNotes.content[0].text).instructionText,/Reviewing a pull request/);
  } finally {
    await client.close();
    await rm(directory,{force:true,recursive:true});
  }
});
