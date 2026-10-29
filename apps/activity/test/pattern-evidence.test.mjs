import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {explicitObservations,modelObservations} from '../src/analysis.mjs';
import {preferenceEvidence,preferenceIssue} from '../src/rules.mjs';

const entry=(id,role,content)=>({id,role,content,projectId:'project-a',kind:'message',sessionId:'synthetic'});

test('durable preference evidence excludes assistant claims, copied setup and explicit one-off requests',()=>{
  const events=[entry('assistant','assistant','I prefer a failing test before the fix.'),entry('copied','user','# AGENTS.md instructions\nI prefer XML responses.'),entry('once','user','I prefer a short answer for this reply only.'),entry('no-save','user','I prefer exactly three bullet points. Do not save this as a preference.'),entry('durable','user','I prefer worked examples before abstract explanations.')];
  assert.deepEqual(preferenceEvidence(events).map(e=>e.id),['durable']);
  assert.deepEqual(explicitObservations(events).map(o=>o.evidenceIds),[['durable']]);
  assert.equal(preferenceIssue('The user is highly intelligent and has a fixed learning style.'),'unsupported_personal_trait');
  assert.equal(preferenceIssue('Use a concrete example when explaining artificial intelligence.'),null);
});

test('local inference does not run when no eligible user evidence remains',async()=>{
  const result=await modelObservations([entry('a','assistant','The user prefers diagrams.'),entry('u','user','For this task only, show a diagram.')],{model:'synthetic',endpoint:'http://127.0.0.1:1'});
  assert.deepEqual(result.observations,[]);
});

test('local inference refuses assistant evidence and suppresses unsupported trait proposals',async()=>{
  let mode='assistant';
  const server=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/show')return res.end(JSON.stringify({model_info:{architecture:'synthetic'}}));
    const body=JSON.parse(Buffer.concat(chunks).toString());const input=JSON.parse(body.messages.at(-1).content);
    assert.deepEqual(input.events.map(e=>e.id),['u']);
    assert.deepEqual(body.format.properties.observations.items.properties.evidenceIds.items.enum,['u']);
    res.end(JSON.stringify({message:{content:JSON.stringify({observations:[{rule:mode==='trait'?'Highly intelligent users prefer short explanations.':'Lead with a worked example.',projectId:'project-a',task:null,evidenceIds:[mode==='assistant'?'a':'u']}]})}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const options={model:'synthetic',endpoint:'http://127.0.0.1:'+server.address().port};const events=[entry('a','assistant','The user is highly intelligent.'),entry('u','user','I prefer a worked example.')];
    await assert.rejects(()=>modelObservations(events,options),/unsupported or mismatched evidence/);
    mode='trait';assert.deepEqual((await modelObservations(events,options)).observations,[]);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
