import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { ArticulateLocalService } from "../src/service.mjs";
import { createConsentWindow } from "../src/permission-ui.mjs";

const serverFile=fileURLToPath(new URL("../src/server.mjs",import.meta.url));

async function connect(directory, operation) {
  const client=new Client({name:"articulate-restart-test",version:"0.1.0"});
  const transport=new StdioClientTransport({
    command:process.execPath,
    args:["--experimental-strip-types",serverFile],
    env:{...process.env,ARTICULATE_DATA_DIR:directory}
  });
  try {
    await client.connect(transport);
    return await operation(client);
  } finally { await client.close(); }
}

async function tool(client, name, args={}) {
  const response=await client.callTool({name,arguments:args});
  return {error:!!response.isError, data: (()=>{try{return JSON.parse(response.content[0].text);}catch{return response.content[0].text;}})()};
}
async function choose(service, action, agree) {
  const window=await createConsentWindow(service);
  try {
    const answer=await fetch(window.url,{
      method:"POST",headers:{Origin:new URL(window.url).origin,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({action,...(agree?{agree:"yes"}:{})})
    });
    assert.equal(answer.status,200);
    await window.done;
  } finally {await window.close();}
}

test("device profile survives separate MCP host connections, approvals and revocation", {timeout:50000},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"articulate-cross-chat-"));
  try {
    // Chat 1: user opts in to assessment and answers the first question.
    await connect(dir,async client=>{
      const first=await tool(client,"articulate_start",{localStorageConsent:true});
      assert.equal(first.error,false);
      assert.equal(first.data.question.id,"background");
      const second=await tool(client,"articulate_answer",{sessionId:first.data.sessionId,questionId:"background",answer:"Exploring linear algebra"});
      assert.equal(second.data.question.id,"sentence_open");
      const blocked=await tool(client,"articulate_review_profile",{});
      assert.equal(blocked.error,true);
    });

    // Chat 2: profile and progress restored without remote sync.
    await connect(dir,async client=>{
      const state=await tool(client,"articulate_status",{});
      assert.equal(state.data.hasProfile,true);
      assert.equal(state.data.policySharingEnabled,false);
      const question=await tool(client,"articulate_next",{});
      assert.equal(question.data.question.id,"sentence_open");
      for(let i=0;i<5;i++){
        const current=await tool(client,"articulate_next",{});
        const next=await tool(client,"articulate_answer",{sessionId:current.data.sessionId,questionId:current.data.question.id,skip:true,userRequestedSkip:true});
        assert.equal(next.error,false);
        if(i===4)assert.equal(next.data.completed,true);
      }
      const profilePolicy=await tool(client,"articulate_get_policy",{task:"concept"});
      assert.equal(profilePolicy.error,true);
    });

    // Physical device approval happens in an independent, short-lived browser window.
    const service=new ArticulateLocalService(dir);
    await choose(service,"enable",true);

    // Chat 3: only now can an invoked AI host review and confirm.
    await connect(dir,async client=>{
      const review=await tool(client,"articulate_review_profile");
      assert.equal(review.error,false);
      assert.equal(review.data.confirmed,false);
      assert.equal(review.data.dimensions.overview_first.provisionalScore,50);
      const confirmed=await tool(client,"articulate_confirm_profile",{userApproved:true,confirmationPhrase:"CONFIRM ARTICULATE PROFILE"});
      assert.equal(confirmed.data.confirmed,true);
      const policy=await tool(client,"articulate_get_policy",{task:"concept"});
      assert.equal(policy.error,false);
      assert.equal(typeof policy.data.instructionText,"string");
    });

    // Chat 4: authorization and confirmed policy persist between host restarts.
    await connect(dir,async client=>{
      const status=await tool(client,"articulate_status");
      assert.equal(status.data.confirmed,true);
      assert.equal(status.data.policySharingEnabled,true);
      const policy=await tool(client,"articulate_get_policy",{task:"concept"});
      assert.equal(policy.error,false);
    });

    // Device revocation takes effect for later calls with the same host storage.
    await choose(service,"disable");
    await connect(dir,async client=>{
      const denied=await tool(client,"articulate_get_policy",{task:"concept"});
      assert.equal(denied.error,true);
      assert.match(String(denied.data),/disabled/);
    });
  }finally{await rm(dir,{recursive:true,force:true});}
});
