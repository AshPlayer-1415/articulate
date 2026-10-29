import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {ActivityStore,readClientCredentials} from '../../../packages/storage-local/src/activity.js';
import {projectIdentity,discoverProjectActivity} from '../src/project-discovery.mjs';
import {runGuidedSetup} from '../src/setup.mjs';
import {runActivityCli} from '../src/cli.mjs';
import {clientConfiguration} from '../src/memory.mjs';
import {ArticulateLocalService} from '../../mcp/src/service.mjs';
import {createConsentWindow} from '../../mcp/src/permission-ui.mjs';
import {connectInteractively} from '../src/connection-flow.mjs';

async function repo(directory){await mkdir(directory,{recursive:true});execFileSync('git',['init','-q',directory],{stdio:'pipe'});return directory;}
test('equal folder names and missing historical paths never establish repository identity',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'articulate-project-identity-'));
  try {const a=await projectIdentity(await repo(path.join(root,'team-a','project'))),b=await projectIdentity(await repo(path.join(root,'team-b','project')));assert.equal(a.name,b.name);assert.notEqual(a.id,b.id);const x=await projectIdentity(path.join(root,'missing-a','project'),{allowMissing:true}),y=await projectIdentity(path.join(root,'missing-b','project'),{allowMissing:true});assert.equal(x.name,y.name);assert.notEqual(x.id,y.id);assert.equal(x.git,false);assert.equal(y.git,false);}finally{await rm(root,{recursive:true,force:true});}
});
async function put(file,records){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,records.map(r=>JSON.stringify(r)).join('\n')+'\n');}
const codex=(cwd,text)=>[{type:'session_meta',payload:{id:'session-'+path.basename(cwd),cwd}},{type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text}]}}];
async function fixture(run) {
  const root=await mkdtemp(path.join(os.tmpdir(),'articulate-setup-test-'));
  try {
    const a=await repo(path.join(root,'repo-a')),b=await repo(path.join(root,'repo-b'));
    const codexRoot=path.join(root,'codex'),claudeRoot=path.join(root,'claude'),cursorRoot=path.join(root,'cursor');
    const roots=[{kind:'codex',path:codexRoot},{kind:'claude-code',path:claudeRoot},{kind:'cursor',path:cursorRoot}];
    await put(path.join(codexRoot,'a.jsonl'),codex(a,'When debugging, show the failing test before the fix.'));
    await put(path.join(codexRoot,'b.jsonl'),codex(b,'I prefer a small example before a long explanation.'));
    await put(path.join(claudeRoot,'a.jsonl'),[{type:'user',uuid:'claude-user',cwd:a,message:{role:'user',content:'When debugging, show the failing test before the fix.'}}]);
    const slug=a.replace(/[^a-zA-Z0-9]/g,'-').replace(/^-+/,'');
    await put(path.join(cursorRoot,slug,'agent-transcripts','a.jsonl'),[{role:'user',content:'I prefer concise steps when reviewing code.'}]);
    await run({root,a,b,roots,directory:path.join(root,'data'),codexRoot,claudeRoot,cursorRoot});
  }finally{await rm(root,{recursive:true,force:true});}
}
function questions(values){return async question=>{assert(values.length,'Unexpected question: '+question);return values.shift();};}
async function permit(service) {const window=await createConsentWindow(service);try{const response=await fetch(window.url,{method:'POST',headers:{Origin:new URL(window.url).origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({action:'enable',agree:'yes'})});assert.equal(response.status,200);await window.done;}finally{await window.close();}}

test('one selected repository combines Codex, Claude and Cursor traces automatically',()=>fixture(async f=>{
  const found=await discoverProjectActivity({projectPath:f.a,roots:f.roots});
  assert.equal(found.projects.length,1);assert.deepEqual(found.projects[0].agents,{codex:1,'claude-code':1,cursor:1});
  assert.equal(found.projects[0].id,(await projectIdentity(f.a)).id);
  assert(found.projects[0].traces.every(t=>!t.path.endsWith('b.jsonl')));
  await assert.rejects(()=>lstat(f.directory),/ENOENT/);
}));

test('project setup merges evidence, reviews once and creates disabled per-agent connections',()=>fixture(async f=>{
  const lines=[];
  const result=await runGuidedSetup({mode:'project',projectPath:f.a,directory:f.directory,discovery:{roots:f.roots},ask:questions(['yes','all','yes']),output:l=>lines.push(l)});
  assert.equal(result.status,'ready');assert.equal(result.connections.length,4);assert.equal(result.projectIds.length,1);
  const store=new ActivityStore(f.directory);
  try {assert.equal(store.summary().events,3);assert.equal(store.clients().length,4);assert(store.clients().every(c=>!c.sharing));const rules=store.observations({status:'approved'});assert.equal(rules.length,2);const combined=rules.find(r=>r.rule.startsWith('When debugging'));assert.deepEqual(new Set(combined.sourceKinds),new Set(['codex','claude-code']));assert.equal(combined.supportCount,1);}finally{store.close();}
  const connection=result.connections.find(c=>c.host==='cursor');const config=JSON.parse(await readFile(connection.file,'utf8')).mcpServers.articulate;
  const service=new ArticulateLocalService(f.directory,{credentials:readClientCredentials(config.env)});
  await assert.rejects(()=>service.policy({task:'debugging'}),/sharing is disabled/);
  await permit(service);
  const policy=await service.policy({task:'debugging'});assert.equal(policy.memory.projectId,result.projectIds[0]);assert.equal(policy.memory.appliedIds.length,1);
  const byPath=await service.policy({task:'debugging',projectPath:f.a});assert.equal(byPath.memory.projectId,result.projectIds[0]);
  await assert.rejects(()=>service.policy({task:'debugging',projectPath:f.b}),/not permitted/);
  assert(lines.some(l=>l.trimStart().startsWith('Done')));assert((await readFile(path.join(path.dirname(connection.file),'CONNECT.md'),'utf8')).includes('projectPath'));
}));

test('all-project setup keeps separate repositories under one reviewed profile',()=>fixture(async f=>{
  const result=await runGuidedSetup({mode:'all',directory:f.directory,discovery:{roots:f.roots},ask:questions(['yes','all','yes']),output:()=>{}});
  assert.equal(result.status,'ready');assert.equal(result.projectIds.length,2);assert.equal(result.projects.find(p=>p.id===(result.projects.find(x=>x.agents.cursor)?.id)).agents.cursor,1);
  const store=new ActivityStore(f.directory);try{assert(store.clients().every(c=>c.projects.includes('*')));assert.equal(new Set(store.observations({status:'approved'}).map(o=>o.scope.projectId)).size,2);}finally{store.close();}
  const config=await clientConfiguration(f.directory,{id:result.connections[0].clientId,host:'cursor',server:path.resolve('apps/mcp/src/server.mjs')});
  const service=new ArticulateLocalService(f.directory,{credentials:readClientCredentials(config.mcpServers.articulate.env)});await permit(service);
  const policy=await service.policy({task:'concept',projectPath:f.b});assert.equal(policy.memory.projectId,(await projectIdentity(f.b)).id);assert.equal(policy.memory.appliedIds.length,1);
  assert(!policy.instructionText.includes('failing test before the fix'));
}));

test('worktrees combine with their repository; nested repositories and mid-session switches stay isolated',()=>fixture(async f=>{
  execFileSync('git',['-C',f.a,'-c','user.name=Synthetic Test','-c','user.email=synthetic@example.invalid','commit','--allow-empty','-qm','fixture'],{stdio:'pipe'});
  const worktree=path.join(f.root,'worktree');execFileSync('git',['-C',f.a,'worktree','add','--detach',worktree],{stdio:'pipe'});
  await put(path.join(f.codexRoot,'worktree.jsonl'),codex(worktree,'I prefer a verification step after changes.'));
  const nested=await repo(path.join(f.a,'nested'));
  await put(path.join(f.codexRoot,'switch.jsonl'),[...codex(f.a,'I prefer a precise summary.'),{type:'turn_context',payload:{cwd:nested}},{type:'response_item',payload:{type:'message',role:'user',content:'I prefer this nested repository SECRET_MARKER to stay separate.'}},{type:'turn_context',payload:{cwd:f.a}},{type:'response_item',payload:{type:'message',role:'user',content:'I prefer a final test command.'}}]);
  assert.equal((await projectIdentity(worktree)).id,(await projectIdentity(f.a)).id);
  const result=await runGuidedSetup({mode:'project',projectPath:f.a,directory:f.directory,discovery:{roots:f.roots},ask:questions(['yes','all','no']),output:()=>{}});
  assert.equal(result.status,'ready');const store=new ActivityStore(f.directory);
  try{const events=store.events({limit:100});assert(events.some(e=>e.content.includes('verification step')));assert(events.some(e=>e.content.includes('final test command')));assert(!events.some(e=>e.content.includes('SECRET_MARKER')));}finally{store.close();}
}));

test('scope cancellation and no-activity paths leave the profile untouched',()=>fixture(async f=>{
  const cancelled=await runGuidedSetup({mode:'project',projectPath:f.a,directory:f.directory,discovery:{roots:f.roots},ask:questions(['no']),output:()=>{}});assert.equal(cancelled.status,'cancelled');await assert.rejects(()=>lstat(f.directory),/ENOENT/);
  const missing=await runGuidedSetup({mode:'project',projectPath:f.a,directory:f.directory,discovery:{roots:[]},ask:questions(['yes']),output:()=>{}});assert.equal(missing.status,'no_activity');await assert.rejects(()=>lstat(f.directory),/ENOENT/);
}));

test('a skipped review stays a draft; rerunning resumes and preserves approved memory',()=>fixture(async f=>{
  const options={mode:'project',projectPath:f.a,directory:f.directory,discovery:{roots:f.roots},output:()=>{}};
  const draft=await runGuidedSetup({...options,ask:questions(['yes','skip'])});assert.equal(draft.status,'review_required');await assert.rejects(()=>lstat(path.join(f.directory,'client-credentials')),/ENOENT/);
  const ready=await runGuidedSetup({...options,ask:questions(['yes','all','yes'])});assert.equal(ready.importedEvents,0);assert.equal(ready.status,'ready');
  const again=await runGuidedSetup({...options,ask:questions(['yes','yes'])});assert.equal(again.importedEvents,0);assert.equal(again.revision,ready.revision);assert.deepEqual(again.connections,ready.connections);
}));

test('unattributed Cursor files and discovery limits are reported without guessing a project',()=>fixture(async f=>{
  await put(path.join(f.cursorRoot,'unknown','agent-transcripts','unknown.jsonl'),[{role:'user',content:'I prefer UNATTRIBUTED_MARKER.'}]);
  const all=await discoverProjectActivity({roots:f.roots});assert.equal(all.unattributedFiles,1);assert.equal(all.projects.length,2);
  const bounded=await discoverProjectActivity({roots:f.roots,maxFiles:1});assert.equal(bounded.filesExamined,1);assert.equal(bounded.incomplete,true);
}));

test('analysis without user preferences never claims a ready profile',()=>fixture(async f=>{
  await rm(f.claudeRoot,{recursive:true});await rm(f.cursorRoot,{recursive:true});
  await put(path.join(f.codexRoot,'a.jsonl'),[{type:'session_meta',payload:{id:'assistant-only',cwd:f.a}},{type:'response_item',payload:{type:'message',role:'assistant',content:'Task complete.'}}]);
  const result=await runGuidedSetup({mode:'project',projectPath:f.a,directory:f.directory,discovery:{roots:f.roots},ask:questions(['yes']),output:()=>{}});
  assert.equal(result.status,'no_rules');await assert.rejects(()=>lstat(path.join(f.directory,'profile.json')),/ENOENT/);await assert.rejects(()=>lstat(path.join(f.directory,'client-credentials')),/ENOENT/);
}));

test('source erasure clears the project catalog and complete erasure removes generated connections',()=>fixture(async f=>{
  await runGuidedSetup({mode:'project',projectPath:f.a,directory:f.directory,discovery:{roots:f.roots},ask:questions(['yes','all','yes']),output:()=>{}});
  const store=new ActivityStore(f.directory);try{for(const source of store.sources())store.forgetSource(source.id);assert.deepEqual(JSON.parse(store.setting('project_catalog')),[]);}finally{store.close();}
  const previous=process.env.ARTICULATE_DATA_DIR;process.env.ARTICULATE_DATA_DIR=f.directory;
  try{await runActivityCli(['erase','--confirmation','DELETE LOCAL ARTICULATE DATA','--approve'],{output:()=>{}});await assert.rejects(()=>lstat(path.join(f.directory,'connections')),/ENOENT/);assert((await readFile(path.join(f.codexRoot,'a.jsonl'),'utf8')).includes('failing test'));}finally{if(previous===undefined)delete process.env.ARTICULATE_DATA_DIR;else process.env.ARTICULATE_DATA_DIR=previous;}
}));

test('interactive setup receives checkbox choices and still requires explicit review before connection preparation',()=>fixture(async f=>{
  const lines=[],answers=['yes',[0],'yes'],questionsSeen=[];
  const ui=Object.fromEntries(['welcome','section','progress','stopProgress','success','note','warning','write'].map(k=>[k,(...v)=>lines.push(v.join(' '))]));
  const result=await runGuidedSetup({mode:'project',projectPath:f.a,directory:f.directory,discovery:{roots:f.roots},ui,output:ui.write,ask:async(q,options)=>{questionsSeen.push(options);return answers.shift();}});
  assert.equal(result.status,'ready');assert.equal(result.connections.length,4);
  assert.equal(questionsSeen[0].initial,1);assert.equal(questionsSeen[1].multiple,true);assert.equal(questionsSeen[1].choices.length,2);
  const store=new ActivityStore(f.directory);try{assert.equal(store.observations({status:'approved'}).length,1);assert(store.clients().every(c=>!c.sharing));}finally{store.close();}
  assert(lines.some(l=>l.includes('4 / 4')));assert(!lines.some(l=>l.includes('evidence fingerprints')));
}));

test('interactive empty-history setup saves only the preferences chosen by the person and keeps client sharing off',()=>fixture(async f=>{
  const ui=Object.fromEntries(['welcome','section','progress','stopProgress','success','note','warning','write'].map(k=>[k,()=>{}]));
  const answers=['yes',[2],'yes'];
  const result=await runGuidedSetup({mode:'all',directory:f.directory,discovery:{roots:[]},ui,output:()=>{},ask:async()=>answers.shift()});
  assert.equal(result.status,'manual_ready');assert.equal(result.analysis,'user-chosen-preferences');assert.equal(result.connections.length,4);
  const store=new ActivityStore(f.directory);try{assert.equal(store.sources().length,0);const notes=store.observations({status:'approved'});assert.equal(notes.length,1);assert.equal(notes[0].origin,'user-edit');assert.deepEqual(notes[0].evidenceIds,[]);assert.equal(notes[0].scope.kind,'user');assert(store.clients().every(c=>!c.sharing));}finally{store.close();}
  const repeat=['yes','yes'];const again=await runGuidedSetup({mode:'all',directory:f.directory,discovery:{roots:[]},ui,output:()=>{},ask:async()=>repeat.shift()});assert.equal(again.revision,result.revision);
}));

test('all-project setup keeps broad connection scope when only one repository is found',()=>fixture(async f=>{
  await rm(path.join(f.codexRoot,'b.jsonl'));
  const result=await runGuidedSetup({mode:'all',directory:f.directory,discovery:{roots:[{kind:'codex',path:f.codexRoot}]},ask:questions(['yes','all','yes']),output:()=>{}});
  assert.equal(result.projectIds.length,1);
  const paths=Object.fromEntries(result.connections.map(c=>[c.host,path.join(f.root,'hosts',c.host+(c.host==='codex'?'.toml':'.json'))]));
  const {connectHosts}=await import('../src/connections.mjs');const installed=await connectHosts(f.directory,{approved:true,paths,output:()=>{}});
  assert.equal(installed.hosts.length,4);assert(installed.hosts.every(h=>h.clientId.startsWith('setup-'+h.host+'-')));
  const store=new ActivityStore(f.directory);try{const {processActivity}=await import('../src/pipeline.mjs');await processActivity(store);assert.equal(JSON.parse(store.setting('activity-progress')).latestScope,'all-projects');assert(store.clients().every(c=>c.projects.includes('*')));}finally{store.close();}
}));

test('manual project preferences remain project-scoped and reuse the existing review',()=>fixture(async f=>{
  const ui=Object.fromEntries(['welcome','section','progress','stopProgress','success','note','warning','write'].map(k=>[k,()=>{}]));let welcomes=0;ui.welcome=()=>welcomes++;
  const answers=['yes',[0],'yes'];const options={mode:'project',projectPath:f.a,directory:f.directory,discovery:{roots:[]},ui,showWelcome:false,output:()=>{}};
  const result=await runGuidedSetup({...options,ask:async()=>answers.shift()});assert.equal(result.status,'manual_ready');assert.equal(welcomes,0);
  const store=new ActivityStore(f.directory);try{const rules=store.observations({status:'approved'});assert.equal(rules.length,1);assert.equal(rules[0].scope.kind,'project');assert.equal(rules[0].scope.projectId,result.projectIds[0]);assert.equal(rules[0].scope.sessionId,null);assert(store.clients().every(c=>c.projects.length===1&&c.projects[0]===result.projectIds[0]));}finally{store.close();}
  const repeat=['yes','no'];const again=await runGuidedSetup({...options,ask:async()=>repeat.shift()});assert.equal(again.revision,result.revision);assert.equal(again.manualPreferences,1);
}));

test('skipping empty-history preferences does not create a profile or enroll clients',()=>fixture(async f=>{
  const ui=Object.fromEntries(['welcome','section','progress','stopProgress','success','note','warning','write'].map(k=>[k,()=>{}]));const answers=['yes',[]];
  const result=await runGuidedSetup({mode:'all',directory:f.directory,discovery:{roots:[]},ui,output:()=>{},ask:async()=>answers.shift()});
  assert.equal(result.status,'review_required');await assert.rejects(()=>lstat(path.join(f.directory,'profile.json')),/ENOENT/);await assert.rejects(()=>lstat(path.join(f.directory,'client-credentials')),/ENOENT/);
}));

test('interactive connection skips existing grants, approves only selected clients and reports the actual saved status',()=>fixture(async f=>{
  const prepared=await runGuidedSetup({mode:'all',directory:f.directory,discovery:{roots:f.roots},ask:questions(['yes','all','yes']),output:()=>{}});
  const codex=prepared.connections.find(c=>c.host==='codex'),claude=prepared.connections.find(c=>c.host==='claude-code');
  const cfg=await clientConfiguration(f.directory,{id:codex.clientId,host:'cursor',server:path.resolve('apps/mcp/src/server.mjs')});
  await permit(new ArticulateLocalService(f.directory,{credentials:readClientCredentials(cfg.mcpServers.articulate.env)}));
  const lines=[],asked=[];let opened=0;
  const ui=Object.fromEntries(['note','success','warning','section','progress','stopProgress'].map(k=>[k,(...v)=>lines.push(v.join(' '))]));
  ui.ask=async(q,options)=>{asked.push(options);return asked.length===1?'yes':[claude.clientId];};
  const paths=Object.fromEntries(prepared.connections.map(c=>[c.host,path.join(f.root,'hosts',c.host+(c.host==='codex'?'.toml':'.json'))]));
  const browser=async url=>{opened++;const response=await fetch(url,{method:'POST',headers:{Origin:new URL(url).origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({action:'enable',agree:'yes'})});assert.equal(response.status,200);};
  const result=await connectInteractively(f.directory,{ui,paths,browser,output:()=>{}});
  assert.equal(result.status,'configured');assert.equal(opened,1);assert.equal(asked[1].choices.length,3);assert(!asked[1].choices.some(c=>c.value===codex.clientId));
  const store=new ActivityStore(f.directory);try{assert.equal(store.clients().filter(c=>c.sharing).length,2);}finally{store.close();}
  assert(lines.includes('Codex · approved'));assert(lines.includes('Claude Code · approved'));assert(lines.includes('Cursor · sharing off'));
}));
