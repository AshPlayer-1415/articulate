import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,symlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {ActivityStore} from '../src/activity.js';
import {event,redact} from '../src/activity-schema.js';
import {importSource} from '../../../apps/activity/src/adapters.mjs';
import {analyzeActivity,validateLocalModel} from '../../../apps/activity/src/analysis.mjs';

async function isolated(run) {
  const root=await mkdtemp(path.join(os.tmpdir(),'articulate-activity-test-'));
  const store=new ActivityStore(path.join(root,'data'),{create:true});
  try {await run(store,root);}finally{store.close();await rm(root,{recursive:true,force:true});}
}
async function source(store,root,{kind='codex',content,retainContent=true,projectId='sample'}={}) {
  const file=path.join(root,kind+(kind==='cursor'?'.md':'.jsonl'));
  await writeFile(file,content??JSON.stringify({type:'response_item',timestamp:'2026-10-20T00:00:00Z',payload:{type:'message',role:'user',content:[{type:'input_text',text:'I prefer a failing test before the fix.'}]}})+'\n');
  return store.addSource({kind,path:file,projectId,retainContent,userApproved:true});
}
test('activity is opt-in; unopened stores do not create files',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'articulate-no-activity-'));
  try {const store=new ActivityStore(root);assert.equal(store.db,null);assert.equal(store.summary().initialized,false);store.close();await assert.rejects(()=>readFile(path.join(root,'activity.sqlite')),/ENOENT/);}finally{await rm(root,{recursive:true,force:true});}
});
test('native import is resumable, idempotent and rereads changed sources',()=>isolated(async(store,root)=>{
  const data=[1,2,3].map(n=>JSON.stringify({type:'response_item',timestamp:'2026-10-20T00:00:00Z',payload:{type:'message',role:'user',content:[{type:'input_text',text:'I prefer a concrete example '+n+'.'}]}})).join('\n')+'\n';
  const selected=await source(store,root,{content:data});
  assert.equal(selected.path,await realpath(path.join(root,'codex.jsonl')),'registration and import must use the same native canonical path, including Windows aliases');
  const first=await importSource(store,selected.id,{limit:1});assert.equal(first.insertedEvents,1);assert.equal(first.hasMore,true);
  await importSource(store,selected.id,{limit:10});assert.equal(store.summary().events,3);
  await importSource(store,selected.id);assert.equal(store.summary().events,3);
  await writeFile(selected.path,data+JSON.stringify({role:'assistant',content:'One additional reply.'})+'\n');
  await importSource(store,selected.id);assert.equal(store.summary().events,4);
}));
test('Codex preserves tools and Claude Code preserves tool blocks',()=>isolated(async(store,root)=>{
  const codex=await source(store,root,{content:[{type:'session_meta',payload:{id:'session-codex',cwd:'/synthetic/project'}},{type:'response_item',payload:{type:'function_call',name:'test',arguments:'node --test',call_id:'call-1'}},{type:'response_item',payload:{type:'function_call_output',output:'9 tests passed',call_id:'call-1'}}].map(JSON.stringify).join('\n')});
  await importSource(store,codex.id);
  const claude=await source(store,root,{kind:'claude-code',content:[{type:'user',uuid:'u1',sessionId:'s1',message:{role:'user',content:'I prefer short examples.'}},{type:'assistant',uuid:'a1',sessionId:'s1',message:{role:'assistant',content:[{type:'text',text:'Running tests.'},{type:'tool_use',id:'t1',name:'Bash',input:{command:'node --test'}}]}},{type:'user',uuid:'u2',sessionId:'s1',message:{role:'user',content:[{type:'tool_result',tool_use_id:'t1',content:'PASS'}]}}].map(JSON.stringify).join('\n')});
  await importSource(store,claude.id);
  const events=store.events({limit:100});assert.equal(events.filter(e=>e.kind==='tool_call').length,2);assert.equal(events.filter(e=>e.kind==='tool_result').length,2);
  assert(events.some(e=>e.role==='user'&&e.content==='I prefer short examples.'));
}));
test('Cursor role-labelled exports are imported without inventing timestamps',()=>isolated(async(store,root)=>{
  const selected=await source(store,root,{kind:'cursor',content:'# User\nI prefer examples before abstractions.\n\n# Assistant\nHere is an example.\n'});
  await importSource(store,selected.id);const events=store.events({limit:10});assert.deepEqual(events.map(e=>e.role),['user','assistant']);assert(events.every(e=>e.timestamp===null));
}));
test('unsupported formats and malformed records do not fabricate activity',()=>isolated(async(store,root)=>{
  const selected=await source(store,root,{content:'{"unrecognized":"schema"}\n'});
  await assert.rejects(()=>importSource(store,selected.id),/Unsupported source schema/);assert.equal(store.summary().events,0);
  await writeFile(selected.path,'{"role":');await assert.rejects(()=>importSource(store,selected.id),/Invalid activity JSONL/);assert.equal(store.summary().events,0);
}));
test('credential redaction and metadata-only retention precede analysis',()=>isolated(async(store,root)=>{
  const secret='sk-ant-TESTSECRET0123456789';
  assert(!redact('API_KEY="private-value" Bearer abc123 '+secret).includes('private-value'));
  assert(!redact('{"api_key":"private-value"}').includes('private-value'));
  const selected=await source(store,root,{retainContent:false,content:JSON.stringify({role:'user',content:'I prefer examples. '+secret})+'\n'});
  await importSource(store,selected.id);assert.equal(store.events({limit:1})[0].content,null);
  const analysis=await analyzeActivity(store);assert.equal(analysis.proposed,0);assert.equal(analysis.eventsWithoutRetainedContent,1);
  assert(!(await readFile(store.file)).includes(Buffer.from(secret)));
}));
test('explicit extraction proposes evidence-backed rules and never auto-approves',()=>isolated(async(store,root)=>{
  const selected=await source(store,root);await importSource(store,selected.id);
  const result=await analyzeActivity(store);assert.equal(result.proposed,1);
  const item=store.observations()[0];assert.equal(item.status,'proposed');assert.equal(item.scope.projectId,'sample');assert.equal(item.supportCount,1);
  assert.equal(store.applicable({projectId:'sample',task:'debugging'}).length,0);
  assert.equal((await analyzeActivity(store)).processedEvents,0);
  store.review({id:item.id,action:'approve',userApproved:true,expectedRevision:0});
  assert.equal(store.applicable({projectId:'sample',task:'debugging'}).length,1);
  assert.equal(store.applicable({projectId:'other',task:'debugging'}).length,0);
}));
test('review revisions reject stale changes and support rollback',()=>isolated(async(store,root)=>{
  const selected=await source(store,root);await importSource(store,selected.id);await analyzeActivity(store);
  const item=store.observations()[0];store.review({id:item.id,action:'approve',userApproved:true,expectedRevision:0});
  assert.throws(()=>store.review({id:item.id,action:'reject',userApproved:true,expectedRevision:0}),/revision changed/);
  store.review({id:item.id,action:'edit',rule:'Show the exact failing test, then a minimal fix.',userApproved:true,expectedRevision:1});
  assert.equal(store.observation(item.id).origin,'user-edit');
  store.rollback({revision:2,expectedRevision:2,userApproved:true});assert.equal(store.observation(item.id).rule,item.rule);assert.equal(store.revision,3);
}));
test('client grants are authenticated, scoped and independently revocable',()=>isolated(async(store)=>{
  const codex=store.enroll({id:'codex',name:'Codex',projects:['sample']});const cursor=store.enroll({id:'cursor',name:'Cursor'});
  assert.throws(()=>store.authenticate({id:'codex',token:cursor.token}),/Invalid local client/);
  const a={id:codex.id,token:codex.token},b={id:cursor.id,token:cursor.token};
  assert.throws(()=>store.authenticate(a),/sharing is disabled/);store.grant(a,true);store.grant(b,true);
  assert.throws(()=>store.authenticate(a,{projectId:'other'}),/not permitted/);
  store.revoke('codex');assert.throws(()=>store.authenticate(a),/sharing is disabled/);assert.equal(store.authenticate(b).sharing,true);
}));
test('removing a source erases derived rules, rollback copies and analysis caches',()=>isolated(async(store,root)=>{
  const selected=await source(store,root);await importSource(store,selected.id);await analyzeActivity(store);
  const item=store.observations()[0];store.review({id:item.id,action:'approve',userApproved:true,expectedRevision:0});
  const result=store.forgetSource(selected.id);assert.equal(result.removedEvents,1);assert.equal(store.observations().length,0);assert.equal(store.summary().events,0);
  assert.throws(()=>store.rollback({revision:1,expectedRevision:store.revision,userApproved:true}),/Unknown or erased/);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM analyses').get().n,0);
  assert(!(await readFile(store.file)).includes(Buffer.from('I prefer a failing test')));
}));
test('local analysis refuses remote endpoints and cloud models before requests',()=>{
  for(const endpoint of ['https://example.com','http://127.0.0.1.evil.test:11434','http://127.0.0.1:11434/redirect','http://user:pass@127.0.0.1:11434'])assert.throws(()=>validateLocalModel({endpoint,model:'local-model'}),/loopback/);
  assert.throws(()=>validateLocalModel({model:'large-model:cloud'}),/cloud models/);
});
test('competing local processes preserve all activity contributions',()=>isolated(async(store,root)=>{
  const selected=await source(store,root);
  const worker=new URL('./activity-worker.mjs',import.meta.url);
  await Promise.all(['a','b','c','d'].map(id=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[fileURLToPath(worker),store.directory,selected.id,id],{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',value=>stderr+=value);child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(stderr)));
  })));
  assert.equal(store.summary().events,100);
}));
test('changed source records are rejected and removing/reimporting resets analysis progress',()=>isolated(async(store,root)=>{
  const selected=await source(store,root);await importSource(store,selected.id);await analyzeActivity(store);
  await writeFile(selected.path,JSON.stringify({type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'I prefer the decision first.'}]}})+'\n');
  await assert.rejects(()=>importSource(store,selected.id),/source record changed/);
  store.forgetSource(selected.id);
  const again=await source(store,root);await importSource(store,again.id);assert.equal((await analyzeActivity(store)).proposed,1);
}));
test('explicit analysis does not make a network request',()=>isolated(async(store,root)=>{
  const selected=await source(store,root);await importSource(store,selected.id);
  const previous=http.request;let calls=0;http.request=()=>{calls++;throw new Error('Network blocked by offline test');};
  try {assert.equal((await analyzeActivity(store)).proposed,1);assert.equal(calls,0);}finally{http.request=previous;}
}));
test('oversized JSONL records are skipped with explicit coverage diagnostics',()=>isolated(async(store,root)=>{
  const selected=await source(store,root,{content:JSON.stringify({role:'user',content:'x'.repeat(1024*1024+1)})+'\n'+JSON.stringify({role:'user',content:'I prefer a concrete example.'})+'\n'});
  const result=await importSource(store,selected.id);assert.equal(result.oversizedRecords,1);assert.equal(store.summary().events,1);assert(result.warnings.some(w=>w.includes('oversized')));
}));
test('retained source content is purged when an existing store is opened after expiry',()=>isolated(async(store,root)=>{
  const marker='SYNTHETIC_RETAINED_CONTENT_12481';
  const selected=await source(store,root,{content:JSON.stringify({role:'user',content:marker})+'\n'});await importSource(store,selected.id);
  const item=store.events({limit:1})[0];const body={...item,importedAt:new Date(Date.now()-31*86400000).toISOString()};delete body.sequence;delete body.content;
  store.db.prepare('UPDATE events SET body=?,content_expires_at=? WHERE id=?').run(JSON.stringify(body),new Date(Date.now()-86400000).toISOString(),item.id);
  const reopened=new ActivityStore(store.directory);
  try {assert.equal(reopened.events({limit:1})[0].content,null);assert(!(await readFile(reopened.file)).includes(Buffer.from(marker)));}finally{reopened.close();}
}));
test('session memory requires matching task, project, session and unexpired scope',()=>isolated(async(store,root)=>{
  const selected=await source(store,root);await importSource(store,selected.id);const evidence=store.events({limit:1})[0];
  const item=store.propose({rule:'Show the failing test for this debugging session.',task:'debugging',scope:{kind:'session',projectId:'sample',sessionId:evidence.sessionId,expiresAt:'2026-10-24T00:00:00Z'},evidenceIds:[evidence.id]});
  store.review({id:item.id,action:'approve',expectedRevision:0,userApproved:true});
  assert.equal(store.applicable({projectId:'sample',sessionId:evidence.sessionId,task:'debugging',at:'2026-10-23T00:00:00Z'}).length,1);
  assert.equal(store.applicable({projectId:'sample',sessionId:'other',task:'debugging',at:'2026-10-23T00:00:00Z'}).length,0);
  assert.equal(store.applicable({projectId:'sample',sessionId:evidence.sessionId,task:'shipping',at:'2026-10-23T00:00:00Z'}).length,0);
  assert.equal(store.applicable({projectId:'sample',sessionId:evidence.sessionId,task:'debugging',at:'2026-10-25T00:00:00Z'}).length,0);
}));
test('matching cross-tool observations merge evidence without inflating copied support or undoing review',()=>isolated(async(store,root)=>{
  const first=await source(store,root);await importSource(store,first.id);await analyzeActivity(store);
  const item=store.observations()[0];store.review({id:item.id,action:'reject',expectedRevision:0,userApproved:true});
  const second=await source(store,root,{kind:'cursor',content:'# User\nI prefer a failing test before the fix.\n'});await importSource(store,second.id);await analyzeActivity(store);
  const merged=store.observation(item.id);assert.equal(merged.evidenceIds.length,2);assert.equal(merged.supportCount,1);assert.deepEqual(merged.sourceKinds.sort(),['codex','cursor']);assert.equal(merged.status,'rejected');
  store.review({id:item.id,action:'edit',rule:'Use a short failing test and explain the fix directly.',expectedRevision:1,userApproved:true});
  const before=store.observation(item.id);store.propose({rule:item.rule,scope:item.scope,task:item.task,evidenceIds:[merged.evidenceIds[1]],origin:'explicit-request'});
  assert.deepEqual(store.observation(item.id),before);
}));
