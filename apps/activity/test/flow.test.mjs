import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,realpath,lstat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {ActivityStore,readClientCredentials} from '../../../packages/storage-local/src/activity.js';
import {LocalProfileStore} from '../../../packages/storage-local/src/index.js';
import {enrollClient,reviewLocalMemory} from '../src/memory.mjs';
import {importSource} from '../src/adapters.mjs';
import {analyzeActivity} from '../src/analysis.mjs';
import {runActivityCli} from '../src/cli.mjs';
import {ArticulateLocalService} from '../../mcp/src/service.mjs';
import {createConsentWindow} from '../../mcp/src/permission-ui.mjs';

async function isolated(run) {
  const root=await mkdtemp(path.join(os.tmpdir(),'articulate-memory-flow-'));
  try {await run(path.join(root,'data'),root);}finally{await rm(root,{recursive:true,force:true});}
}
async function client(directory,id,projects=['*']) {
  const registration=await enrollClient(directory,{id,name:id,projects,userApproved:true});
  const credentials=readClientCredentials(registration.env);
  return {registration,service:new ArticulateLocalService(directory,{credentials}),credentials};
}
async function decide(service,action) {
  const window=await createConsentWindow(service);
  try {
    const get=await fetch(window.url);assert.equal(get.status,200);
    const html=await get.text();
    const response=await fetch(window.url,{method:'POST',headers:{Origin:new URL(window.url).origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({action,...(action==='enable'?{agree:'yes'}:{})})});
    assert.equal(response.status,200);await window.done;return html;
  }finally{await window.close();}
}
async function importExample(directory,root) {
  const file=path.join(root,'cursor.md');await writeFile(file,'# User\nI prefer a failing test before the fix.\n# Assistant\nI can show the failing test.\n');
  const store=new ActivityStore(directory,{create:true});
  try {const source=store.addSource({kind:'cursor',path:file,projectId:'sample',retainContent:true,userApproved:true});await importSource(store,source.id);await analyzeActivity(store);return {source,observation:store.observations()[0],revision:store.revision};}finally{store.close();}
}
test('enrollment preserves preferences and disables legacy global disclosure',()=>isolated(async(directory)=>{
  const old=new ArticulateLocalService(directory,{credentials:null});
  await old.saveStyles({styles:[{name:'Existing',responseShape:'Lead with the answer and its caveat.',isDefault:true}],localStorageConsent:true,userApproved:true});
  await decide(old,'enable');const before=await old.profileStore.load();
  await assert.rejects(()=>enrollClient(directory,{id:'bad/id',name:'Bad',userApproved:true}),/Invalid client/);
  assert.equal((await old.profileStore.load()).consent.sharePolicyWithAiProvider,true);
  const a=await client(directory,'codex');
  const after=await old.profileStore.load();assert.deepEqual(after.styles,before.styles);assert.equal(after.consent.sharePolicyWithAiProvider,false);
  await assert.rejects(()=>old.policy({}),/not registered/);
  assert.equal((await a.service.status()).policySharingEnabled,false);
  if(process.platform!=='win32')assert.equal((await lstat(a.registration.tokenFile)).mode&0o077,0);
  assert(!JSON.stringify(a.registration).includes(a.credentials.token));
}));
test('Cursor evidence is approved once and reused by three independently granted clients',()=>isolated(async(directory,root)=>{
  const imported=await importExample(directory,root);
  const a=await client(directory,'codex',['sample']);const b=await client(directory,'claude',['sample']);const c=await client(directory,'cursor',['sample']);
  assert.match(await decide(a.service,'enable'),/Registered client/);await decide(b.service,'enable');await decide(c.service,'enable');
  await a.service.reviewMemory({id:imported.observation.id,action:'approve',expectedRevision:0,userApproved:true});
  for(const current of [a,b,c]) {
    const policy=await current.service.policy({task:'debugging',projectId:'sample'});
    assert.match(policy.instructionText,/I prefer a failing test before the fix/);assert.equal(policy.memory.appliedIds.length,1);assert.equal(policy.memory.revision,1);
    await assert.rejects(()=>current.service.policy({task:'debugging',projectId:'other'}),/not permitted/);
  }
  await decide(a.service,'disable');await assert.rejects(()=>a.service.policy({task:'debugging',projectId:'sample'}),/sharing is disabled/);
  assert.equal((await b.service.policy({task:'debugging',projectId:'sample'})).memory.appliedIds.length,1);
  assert.equal((await new LocalProfileStore(directory).load()).consent.sharePolicyWithAiProvider,false);
}));
test('registered pattern writes merge; replacement and style edits require a fresh profile revision',()=>isolated(async(directory)=>{
  const a=await client(directory,'codex');const b=await client(directory,'cursor');
  await decide(a.service,'enable');await decide(b.service,'enable');
  const note=n=>({situation:'Reviewing code '+n,wantedOutput:'Show the consequential defects first.',gap:'The decision was buried in narration.',readback:'Scan findings and then inspect evidence.'});
  await a.service.savePatterns({patterns:[note('A')],userApproved:true,localStorageConsent:true});
  const old=await a.service.listPatterns();
  await b.service.savePatterns({patterns:[note('B')],userApproved:true,localStorageConsent:true});
  assert.equal((await a.service.listPatterns()).patternCount,2);
  await assert.rejects(()=>a.service.savePatterns({patterns:[note('C')],mode:'replace',expectedProfileRevision:old.profileRevision,userApproved:true,localStorageConsent:true}),/revision changed/);
  const styles=[{name:'Brief',responseShape:'Show the decision and essential caveat.',isDefault:true}];
  await a.service.saveStyles({styles,userApproved:true,localStorageConsent:true});const snapshot=await a.service.listStyles();
  await assert.rejects(()=>b.service.saveStyles({styles,userApproved:true,localStorageConsent:true}),/profileRevision/);
  await b.service.saveStyles({styles:[{...styles[0],name:'Review'}],expectedProfileRevision:snapshot.profileRevision,userApproved:true,localStorageConsent:true});
  assert.equal((await a.service.listStyles()).styles.length,2);
}));
test('native directory imports restrict activity to the approved project',()=>isolated(async(directory,root)=>{
  const logs=path.join(root,'logs');const project=path.join(root,'project');await mkdir(logs);await mkdir(project);
  const canonical=await realpath(project);
  const record=cwd=>[{type:'session_meta',payload:{id:cwd,cwd}},{role:'user',content:'I prefer concise review findings.'}].map(JSON.stringify).join('\n');
  await writeFile(path.join(logs,'selected.jsonl'),record(canonical));await writeFile(path.join(logs,'other.jsonl'),record('/different/project'));
  const store=new ActivityStore(directory,{create:true});
  try {const source=store.addSource({kind:'codex',path:logs,projectId:'sample',projectPath:canonical,retainContent:true,userApproved:true});await importSource(store,source.id);assert.equal(store.summary().events,1);}finally{store.close();}
}));
test('local model protocol is bounded, evidence checked and incremental',()=>isolated(async(directory,root)=>{
  const imported=await importExample(directory,root);let calls=0;let badEvidence=false;
  const server=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());calls++;
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/show')return res.end(JSON.stringify({model_info:{architecture:'synthetic'},capabilities:['completion']}));
    assert.equal(body.stream,false);assert.equal(body.format.type,'object');assert.deepEqual(body.format.properties.observations.items.properties.task.enum,[null,'concept','debugging','mathematics','research','shipping']);
    const input=JSON.parse(body.messages.at(-1).content);const evidence=input.events.find(e=>e.role==='user');
    assert(input.events.every(e=>e.role==='user'));assert(!JSON.stringify(input).includes('I can show the failing test'));
    res.end(JSON.stringify({message:{content:JSON.stringify({observations:[{rule:'Show a minimal failing test before the fix.',projectId:evidence.projectId,task:'debugging',evidenceIds:[badEvidence?'invented-event':evidence.id]}]})}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const store=new ActivityStore(directory);
  try {
    const endpoint='http://127.0.0.1:'+server.address().port;
    const result=await analyzeActivity(store,{engine:'ollama',model:'synthetic-local',endpoint});assert.equal(result.proposed,1);assert.equal(calls,2);
    assert.equal((await analyzeActivity(store,{engine:'ollama',model:'synthetic-local',endpoint})).processedEvents,0);assert.equal(calls,2);
    badEvidence=true;await assert.rejects(()=>analyzeActivity(store,{engine:'ollama',model:'other-local',endpoint}),/unsupported or mismatched evidence/);assert.equal(store.observations().length,2);
    assert.equal(store.observation(imported.observation.id).status,'proposed');
  }finally{store.close();await new Promise(resolve=>server.close(resolve));}
}));
test('CLI refuses unapproved imports and exports only derived memory',()=>isolated(async(directory,root)=>{
  const previous=process.env.ARTICULATE_DATA_DIR;process.env.ARTICULATE_DATA_DIR=directory;
  const output=[];
  try {
    await assert.rejects(()=>runActivityCli(['source','add','--kind','cursor','--path',path.join(root,'missing.md'),'--project','sample'],{output:x=>output.push(x)}),/requires --approve/);
    const imported=await importExample(directory,root);await reviewLocalMemory(directory,{id:imported.observation.id,action:'approve',expectedRevision:0,userApproved:true});
    const file=path.join(root,'memory-export.json');await runActivityCli(['export','--path',file,'--approve'],{output:x=>output.push(x)});
    const exported=JSON.parse(await readFile(file,'utf8'));assert.equal(exported.observations.length,1);assert.equal(exported.events,undefined);assert.equal(exported.clients,undefined);
  }finally{if(previous===undefined)delete process.env.ARTICULATE_DATA_DIR;else process.env.ARTICULATE_DATA_DIR=previous;}
}));
test('local model cloud metadata, redirects and timeouts fail without a fallback',()=>isolated(async(directory,root)=>{
  await importExample(directory,root);let mode='cloud',chatCalls=0;
  const server=http.createServer(async(req,res)=>{
    for await(const _chunk of req){};
    if(mode==='timeout')return;
    if(mode==='drip') {
      res.setHeader('Content-Type','application/json');res.flushHeaders();
      const interval=setInterval(()=>res.write(' '),20);
      const timer=setTimeout(()=>{clearInterval(interval);res.end(JSON.stringify({model_info:{architecture:'synthetic'}}));},300);
      res.on('close',()=>{clearInterval(interval);clearTimeout(timer);});return;
    }
    if(mode==='redirect'){res.writeHead(302,{Location:'https://example.invalid/collect'});return res.end();}
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/chat')chatCalls++;
    res.end(JSON.stringify({model_info:{architecture:'synthetic'},remote_model:'remote-provider-model'}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const store=new ActivityStore(directory);
  try {
    const endpoint='http://127.0.0.1:'+server.address().port;
    await assert.rejects(()=>analyzeActivity(store,{engine:'ollama',model:'synthetic-a',endpoint}),/locally installed/);assert.equal(chatCalls,0);
    mode='redirect';await assert.rejects(()=>analyzeActivity(store,{engine:'ollama',model:'synthetic-b',endpoint}),/no cloud fallback/);assert.equal(chatCalls,0);
    mode='timeout';await assert.rejects(()=>analyzeActivity(store,{engine:'ollama',model:'synthetic-c',endpoint,timeoutMs:100}),/timed out/);assert.equal(chatCalls,0);
    mode='drip';await assert.rejects(()=>analyzeActivity(store,{engine:'ollama',model:'synthetic-d',endpoint,timeoutMs:100}),/timed out/);assert.equal(chatCalls,0);
  }finally{store.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}));
test('explicit local erasure works with a corrupt activity database and preserves source files',()=>isolated(async(directory,root)=>{
  const imported=await importExample(directory,root);await client(directory,'test-client');
  await writeFile(path.join(directory,'activity.sqlite'),'invalid sqlite content');await writeFile(path.join(directory,'.assessment-checkpoint.json'),'invalid journal');
  const previous=process.env.ARTICULATE_DATA_DIR;process.env.ARTICULATE_DATA_DIR=directory;
  try {
    await assert.rejects(()=>runActivityCli(['erase','--approve'],{output:()=>{}}),/exact local-data deletion confirmation/);
    await runActivityCli(['erase','--confirmation','DELETE LOCAL ARTICULATE DATA','--approve'],{output:()=>{}});
    await assert.rejects(()=>lstat(path.join(directory,'activity.sqlite')),/ENOENT/);await assert.rejects(()=>lstat(path.join(directory,'client-credentials')),/ENOENT/);
    assert((await readFile(imported.source.path,'utf8')).includes('I prefer a failing test'));
  }finally{if(previous===undefined)delete process.env.ARTICULATE_DATA_DIR;else process.env.ARTICULATE_DATA_DIR=previous;}
}));

test('generated source configuration starts a registered MCP client on each platform',{timeout:30000},()=>isolated(async(directory)=>{
  await enrollClient(directory,{id:'config-trial',name:'Config trial',projects:['sample'],userApproved:true});
  const previous=process.env.ARTICULATE_DATA_DIR;process.env.ARTICULATE_DATA_DIR=directory;
  const host=new Client({name:'generated-config-test',version:'1'});
  let transport;
  try {
    const config=await runActivityCli(['client','config','--id','config-trial','--host','cursor'],{output:()=>{}});
    const entry=config.mcpServers.articulate;
    transport=new StdioClientTransport({...entry,env:{...process.env,...entry.env,ARTICULATE_EXTENSION_DATA_DIR:''},stderr:'pipe'});
    await host.connect(transport);
    const response=await host.callTool({name:'articulate_status',arguments:{}});
    assert.equal(response.isError,undefined);
    const status=JSON.parse(response.content[0].text);
    assert.equal(status.memory.registered,true);
    assert.equal(status.memory.clientName,'Config trial');
    assert.equal(status.memory.sharingEnabled,false);
  } finally {
    await host.close();await transport?.close();
    if(previous===undefined)delete process.env.ARTICULATE_DATA_DIR;else process.env.ARTICULATE_DATA_DIR=previous;
  }
}));
