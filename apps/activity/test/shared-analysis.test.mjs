import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {runGuidedSetup} from '../src/setup.mjs';
import {processActivity} from '../src/pipeline.mjs';
import {sharedAnalysis,syncAnalysis} from '../src/shared-analysis.mjs';
import {ActivityStore,readClientCredentials,withActivityStore} from '../../../packages/storage-local/src/activity.js';
import {ArticulateLocalService} from '../../mcp/src/service.mjs';
import {clientConfiguration} from '../src/memory.mjs';
import {createConsentWindow} from '../../mcp/src/permission-ui.mjs';
import {connectHosts,hostConfigPaths,mergeCodex} from '../src/connections.mjs';
import {event} from '../../../packages/storage-local/src/activity-schema.js';
import {analyzeActivity} from '../src/analysis.mjs';

async function fixture(run){const root=await mkdtemp(path.join(os.tmpdir(),'articulate-shared-test-'));try{const project=path.join(root,'repo'),history=path.join(root,'history'),data=path.join(root,'data');await mkdir(project);await mkdir(history);execFileSync('git',['init','-q',project],{stdio:'pipe'});for(const [id,rule] of [['a','I prefer a concrete example.'],['b','I prefer a verification command.']])await writeFile(path.join(history,id+'.jsonl'),[{type:'session_meta',payload:{id,cwd:project}},{type:'response_item',payload:{type:'message',role:'user',content:rule}}].map(JSON.stringify).join('\n')+'\n');await run({root,project,history,data});}finally{await rm(root,{recursive:true,force:true});}}
const ask=values=>async()=>values.shift()??'';
const setup=(f,answers,options={})=>runGuidedSetup({mode:'project',projectPath:f.project,directory:f.data,discovery:{roots:[{kind:'codex',path:f.history}]},ask:ask(answers),output:()=>{},...options});
async function granted(f,id){const config=await clientConfiguration(f.data,{id,host:'cursor',server:path.resolve('apps/mcp/src/server.mjs')});const service=new ArticulateLocalService(f.data,{credentials:readClientCredentials(config.mcpServers.articulate.env)});const window=await createConsentWindow(service);try{const result=await fetch(window.url,{method:'POST',headers:{Origin:new URL(window.url).origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({action:'enable',agree:'yes'})});assert.equal(result.status,200);await window.done;}finally{await window.close();}return service;}

test('manual working notes do not create an overdue history import',()=>fixture(async f=>{
  const store=new ActivityStore(f.data,{create:true});try{store.writeWorkingNote({rule:'Show a concrete example before the abstract explanation.',scope:{kind:'project',projectId:'manual-only'},expectedRevision:0,userApproved:true});const report=sharedAnalysis(store);assert.equal(report.workingRules.length,1);assert.equal(report.refresh.scheduled,false);assert.equal(report.refresh.due,false);assert.equal(report.refresh.reason,null);assert.equal(report.refresh.dueAt,null);assert.equal(report.refresh.command,null);assert.match(report.refresh.instruction,/Do not append reminders to unrelated task answers/);}finally{store.close();}
}));

test('manual-only scopes cannot make a completed history scope stale',()=>fixture(async f=>{
  await setup(f,['yes','all','yes']);const store=new ActivityStore(f.data);
  try {const before=sharedAnalysis(store);store.writeWorkingNote({rule:'Keep an exact verification example beside the fix.',scope:{kind:'project',projectId:'manual-only'},expectedRevision:store.revision,userApproved:true});const all=sharedAnalysis(store);assert.equal(all.refresh.lastCompletedAt,before.refresh.lastCompletedAt);assert.equal(all.refresh.dueAt,before.refresh.dueAt);assert.equal(all.refresh.due,false);
    const future=new Date(Date.parse(before.refresh.lastCompletedAt)+61*86400000).toISOString();assert.equal(sharedAnalysis(store,{at:future}).refresh.reason,'age');assert.equal(sharedAnalysis(store,{projects:['manual-only'],at:future}).refresh.scheduled,false);assert.equal(sharedAnalysis(store,{projects:['manual-only'],at:future}).refresh.due,false);
    for(const source of store.sources())store.forgetSource(source.id);const removed=sharedAnalysis(store,{at:future});assert.equal(removed.refresh.scheduled,false);assert.equal(removed.refresh.due,false);assert.equal(removed.refresh.lastCompletedAt,null);
  }finally{store.close();}
}));

test('agent coverage groups mixed message and tool events by their actual source agent',()=>fixture(async f=>{
  const store=new ActivityStore(f.data,{create:true});
  try {
    const kinds={codex:['message','tool_call','tool_result'],'claude-code':['message','tool_result'],cursor:['tool_call','tool_call','message','message']};
    for(const [agent,records] of Object.entries(kinds)) {
      const file=path.join(f.history,agent+'.jsonl');await writeFile(file,'');
      const source=store.addSource({kind:agent,path:file,projectId:'mixed-project',retainContent:true,userApproved:true});
      const events=records.map((kind,i)=>event({sessionId:'session-'+agent,nativeId:'event-'+i,projectId:'mixed-project',role:kind==='tool_result'?'tool':kind==='tool_call'?'assistant':'user',kind,content:'Synthetic record '+agent+' '+i}));
      store.importBatch(source.id,events,{fileKey:agent,checkpoint:{signature:'fixture',line:records.length,complete:true}});
    }
    await analyzeActivity(store,{projectId:'mixed-project'});
    const report=sharedAnalysis(store);
    assert.deepEqual(report.agents,{codex:{imported:3,analyzed:3},'claude-code':{imported:2,analyzed:2},cursor:{imported:4,analyzed:4}});
    assert.equal(Object.values(report.agents).reduce((sum,c)=>sum+c.imported,0),report.importedEvents);
    assert.equal(report.pendingEvents,0);
  }finally{store.close();}
}));

test('Cursor compaction artifacts and control-only files stay out of preference evidence and retain their classification on refresh',()=>fixture(async f=>{
  const dir=path.join(f.history,'agent-transcripts','session','compaction');await mkdir(dir,{recursive:true});
  const compaction=path.join(dir,'segment_000.md'),control=path.join(f.history,'control.jsonl'),real=path.join(f.history,'real.jsonl');
  await writeFile(compaction,'# User\nI prefer this auxiliary summary to become a rule.\n');
  await writeFile(control,JSON.stringify({type:'turn_ended',status:'error',error:'Synthetic stopped turn'})+'\n');
  await writeFile(real,JSON.stringify({role:'user',content:'I prefer a concrete example.'})+'\n');
  const store=new ActivityStore(f.data,{create:true});
  try {
    for(const file of [compaction,control,real])store.addSource({kind:'cursor',path:file,projectId:'pilot',retainContent:true,userApproved:true});
    for(let i=0;i<2;i++){
      const result=await processActivity(store);assert.equal(result.failedSources,0);assert.equal(result.excludedSources,2);
      const report=sharedAnalysis(store);assert.equal(report.importedEvents,1);assert.equal(report.auxiliarySources,1);assert.equal(report.metadataOnlySources,1);
      assert.equal(report.processingStatus,'complete_with_gaps');assert.equal(report.pendingEvents,0);
      assert(!store.observations().some(o=>o.rule.includes('auxiliary')));
    }
  }finally{store.close();}
}));

test('unknown Cursor records mixed with control metadata remain a visible coverage gap',()=>fixture(async f=>{
  const file=path.join(f.history,'mixed-cursor.jsonl');await writeFile(file,[{type:'turn_ended',status:'error'},{type:'unknown_future_record',payload:'Not a conversation'}].map(JSON.stringify).join('\n')+'\n');
  const store=new ActivityStore(f.data,{create:true});
  try{store.addSource({kind:'cursor',path:file,projectId:'pilot',retainContent:true,userApproved:true});for(let i=0;i<2;i++){const result=await processActivity(store);assert.equal(result.excludedSources,0);assert.equal(result.sourcesWithGaps,1);const report=sharedAnalysis(store);assert.equal(report.metadataOnlySources,0);assert.equal(report.importedEvents,0);assert.equal(report.processingStatus,'complete_with_gaps');}}finally{store.close();}
}));

test('small budgets resume later sources and never claim a complete profile prematurely',()=>fixture(async f=>{
  const first=await setup(f,['yes','all','no'],{maxImportBatches:1});assert.equal(first.status,'in_progress');
  const second=await setup(f,['yes','all','no'],{maxImportBatches:1});
  assert.equal((await withActivityStore(f.data,s=>s.summary())).events,2);
  const third=await setup(f,['yes','no'],{maxImportBatches:1});assert.equal(third.status,'ready');
  const report=JSON.parse(await readFile(path.join(f.data,'analysis.json'),'utf8'));assert.equal(report.pendingEvents,0);assert.equal(report.pendingSourceChecks,0);assert.equal(report.processingStatus,'complete');
}));

test('reviewed cross-client notes use revisions, keep proposals inactive, and refresh the shared files',()=>fixture(async f=>{
  const ready=await setup(f,['yes','all','yes']);assert.equal(ready.connections.length,4);
  const first=await granted(f,ready.connections.find(c=>c.host==='codex').clientId),other=await granted(f,ready.connections.find(c=>c.host==='claude-code').clientId);
  const before=await first.getAnalysis({projectPath:f.project});assert.equal(before.pendingEvents,0);assert.equal(before.refresh.due,false);
  const proposal=await first.updateAnalysis({rule:'Lead debugging replies with a minimal reproducible example.',scope:{kind:'project',projectId:ready.projectIds[0]},expectedRevision:before.memoryRevision,userApproved:false});
  assert.equal(proposal.observation.status,'proposed');assert(!(await other.getAnalysis({projectPath:f.project})).workingRules.some(r=>r.id===proposal.observation.id));
  await assert.rejects(()=>other.updateAnalysis({rule:'Keep the verification command near the fix.',scope:{kind:'project',projectId:ready.projectIds[0]},expectedRevision:before.memoryRevision,userApproved:true}),/revision changed/);
  await other.reviewMemory({id:proposal.observation.id,action:'approve',expectedRevision:proposal.revision,userApproved:true});
  const report=await first.getAnalysis({projectPath:f.project});assert(report.workingRules.some(r=>r.id===proposal.observation.id));assert.equal(report.refresh.dueAt,before.refresh.dueAt);
  assert((await readFile(path.join(f.data,'analysis.md'),'utf8')).includes('minimal reproducible example'));
  assert.equal(JSON.parse(await readFile(path.join(f.data,'analysis.json'),'utf8')).memoryRevision,report.memoryRevision);
  const future=new Date(Date.parse(before.refresh.lastCompletedAt)+61*86400000).toISOString();
  const due=await withActivityStore(f.data,s=>sharedAnalysis(s,{at:future}));assert.equal(due.refresh.due,true);assert.equal(due.refresh.reason,'age');assert.equal(due.refresh.intervalDays,60);
}));

test('context boilerplate and incomplete fragments never become automatically applied preferences',()=>fixture(async f=>{
  await writeFile(path.join(f.history,'a.jsonl'),[{type:'session_meta',payload:{id:'a',cwd:f.project}},{type:'response_item',payload:{type:'message',role:'user',content:'# AGENTS.md instructions\nAlways check first.\nAlways invoke articulate_status.'}},{type:'response_item',payload:{type:'message',role:'user',content:'Always include in explanation:\nI prefer a concrete example.'}}].map(JSON.stringify).join('\n')+'\n');
  const ready=await setup(f,['yes','all','yes']);const rules=await withActivityStore(f.data,s=>s.observations({status:'approved'}));assert(rules.every(r=>!r.rule.includes('Always')));
  const service=await granted(f,ready.connections[0].clientId);const report=await service.getAnalysis({projectPath:f.project});
  const added=await service.updateAnalysis({rule:'Always check first.',scope:{kind:'project',projectId:ready.projectIds[0]},expectedRevision:report.memoryRevision,userApproved:false});
  await service.reviewMemory({id:added.observation.id,action:'approve',expectedRevision:added.revision,userApproved:true});
  const analysis=await service.getAnalysis({projectPath:f.project});assert(analysis.needsReview.some(r=>r.id===added.observation.id));assert(!analysis.workingRules.some(r=>r.id===added.observation.id));
  assert(!(await service.policy({task:'concept',projectPath:f.project})).memory.appliedIds.includes(added.observation.id));
  await service.updateAnalysis({id:added.observation.id,rule:'Check the concrete failing case before suggesting a change.',scope:{kind:'project',projectId:ready.projectIds[0]},expectedRevision:analysis.memoryRevision,userApproved:true});assert((await service.getAnalysis({projectPath:f.project})).workingRules.some(r=>r.id===added.observation.id));
}));

test('native oversized Claude records are skipped without discarding subsequent attributed requests',()=>fixture(async f=>{
  const claude=path.join(f.root,'claude');await mkdir(claude);
  const rows=[{type:'user',cwd:f.project,uuid:'u1',message:{role:'user',content:'I prefer a worked example.'}},{type:'assistant',cwd:f.project,uuid:'large',message:{role:'assistant',content:'x'.repeat(1024*1024+10)}},{type:'user',cwd:f.project,uuid:'u2',message:{role:'user',content:'I prefer a final verification command.'}}];
  await writeFile(path.join(claude,'a.jsonl'),rows.map(JSON.stringify).join('\n')+'\n');
  const result=await runGuidedSetup({mode:'project',projectPath:f.project,directory:f.data,discovery:{roots:[{kind:'claude-code',path:claude}]},ask:ask(['yes','all','no']),output:()=>{}});
  assert.equal(result.status,'complete_with_gaps');const report=JSON.parse(await readFile(path.join(f.data,'analysis.json'),'utf8'));assert.equal(report.agents['claude-code'].imported,2);assert.equal(report.agents['claude-code'].analyzed,2);assert.equal(report.pendingEvents,0);
}));

test('connection installation preserves other settings, keeps backups private, and leaves sharing disabled',()=>fixture(async f=>{
  const setupResult=await setup(f,['yes','all','yes']);const paths=hostConfigPaths({home:path.join(f.root,'home'),env:{},platform:'darwin'});
  for(const [host,file] of Object.entries(paths)){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,host==='codex'?'model = "synthetic"\n[mcp_servers.keep]\ncommand = "existing"\n[mcp_servers.articulate]\ncommand = "old"\n':JSON.stringify({unrelated:'synthetic-setting',mcpServers:{keep:{command:'existing'}}}));}
  const result=await connectHosts(f.data,{approved:true,paths,output:()=>{},serverEntry:path.resolve('apps/mcp/src/server.mjs')});assert.equal(result.hosts.length,4);
  const codex=await readFile(paths.codex,'utf8');assert(codex.includes('model = "synthetic"'));assert(codex.includes('[mcp_servers.keep]'));assert(!codex.includes('command = "old"'));
  for(const host of ['cursor','claude','claude-code']){const config=JSON.parse(await readFile(paths[host],'utf8'));assert.equal(config.unrelated,'synthetic-setting');assert.equal(config.mcpServers.keep.command,'existing');assert(config.mcpServers.articulate.env.ARTICULATE_CLIENT_ID.includes('setup-'));}
  const backup=path.join(result.backupDirectory,'claude-code.json');assert((await lstat(backup)).isFile());if(process.platform!=='win32')assert.equal((await lstat(backup)).mode&0o777,0o600);
  assert((await withActivityStore(f.data,s=>s.clients())).every(c=>!c.sharing));
  assert.throws(()=>mergeCodex('example = """\n[mcp_servers.articulate]\n"""','replacement'),/Complex Codex/);
}));

test('working notes support rollback and reject project-scope escalation',()=>fixture(async f=>{
  const ready=await setup(f,['yes','all','yes']);const service=await granted(f,ready.connections[0].clientId);const before=await service.getAnalysis({projectPath:f.project});
  await assert.rejects(()=>service.updateAnalysis({rule:'Use this preference globally.',scope:{kind:'user'},expectedRevision:before.memoryRevision,userApproved:true}),/all projects/);
  const note=await service.updateAnalysis({rule:'Keep the response short when I ask for a quick check.',scope:{kind:'project',projectId:ready.projectIds[0]},expectedRevision:before.memoryRevision,userApproved:true});
  const store=new ActivityStore(f.data);try{const undo=store.rollback({revision:note.revision,expectedRevision:note.revision,userApproved:true});assert.equal(store.observation(note.observation.id),null);store.rollback({revision:undo.revision,expectedRevision:undo.revision,userApproved:true});assert.equal(store.observation(note.observation.id).status,'approved');}finally{store.close();}
}));

test('older profile-sharing grants do not implicitly disclose the new analysis summary',()=>fixture(async f=>{
  const ready=await setup(f,['yes','all','yes']);const service=await granted(f,ready.connections[0].clientId);
  const store=new ActivityStore(f.data);try{store.db.prepare('DELETE FROM settings WHERE key=?').run('analysis-grant:'+ready.connections[0].clientId);}finally{store.close();}
  await assert.rejects(()=>service.getAnalysis({projectPath:f.project}),/updated local approval/);
  const policy=await service.policy({task:'concept',projectPath:f.project});assert.equal(policy.memory.refresh,null);
  const approved=await granted(f,ready.connections[0].clientId);assert((await approved.getAnalysis({projectPath:f.project})).workingRules.length>0);
}));

test('late import checkpoints cannot rewind another process’s completed cursor',()=>fixture(async f=>{
  await setup(f,['yes','all','no']);const store=new ActivityStore(f.data);
  try{const row=store.db.prepare('SELECT source_id,file_key,body FROM checkpoints LIMIT 1').get();const before=JSON.parse(row.body);assert(before.complete);store.importBatch(row.source_id,[],{fileKey:row.file_key,checkpoint:{...before,line:0,complete:false}});const after=store.checkpoint(row.source_id,row.file_key);assert.equal(after.line,before.line);assert.equal(after.complete,true);}finally{store.close();}
}));
