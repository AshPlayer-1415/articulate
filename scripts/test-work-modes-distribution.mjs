// Exercise the code-only npm installation, never a real profile or agent history.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {ArticulateLocalService} from '../apps/mcp/src/service.mjs';
import {createConsentWindow} from '../apps/mcp/src/permission-ui.mjs';
import {prepareConnections} from '../apps/activity/src/connections.mjs';
import {clientConfiguration} from '../apps/activity/src/memory.mjs';
import {readClientCredentials} from '../packages/storage-local/src/activity.js';
import release from '../release.json' with {type:'json'};

const root=process.cwd(),temp=await mkdtemp(path.join(os.tmpdir(),'articulate modes distribution '));
const checks=[],clients=[];
const report={version:release.version,node:process.version,platform:process.platform,arch:process.arch,passed:false,checks,syntheticDataOnly:true,realHostGuiTested:false};
const directory=path.join(temp,'synthetic data'),project=path.join(temp,'project with spaces');
const env={...process.env,ARTICULATE_DATA_DIR:directory,ARTICULATE_EXTENSION_DATA_DIR:'',ARTICULATE_CLIENT_ID:'',ARTICULATE_CLIENT_TOKEN_FILE:'',ARTICULATE_LOCAL_MODEL:''};
const npm=process.env.npm_execpath;
if(!npm)throw new Error('Run with npm run test:work-modes');
const npmRun=args=>execFileSync(process.execPath,[npm,...args],{cwd:root,env,encoding:'utf8',timeout:180000,stdio:['ignore','pipe','pipe']});
const decode=result=>{assert(!result.isError,result.content?.[0]?.text);return JSON.parse(result.content[0].text);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 await mkdir(project);await mkdir(path.join(project,'docs'));const documentation=path.join(project,'docs','security.md');await writeFile(documentation,'Reviewed synthetic authorization checklist.');
 const packed=JSON.parse(npmRun(['pack','./dist/local','--json','--ignore-scripts','--pack-destination',temp]))[0];
 assert.equal(packed.files.length,7);const prefix=path.join(temp,'global installation');
 npmRun(['install','--global','--prefix',prefix,path.join(temp,packed.filename),'--ignore-scripts','--offline','--no-audit','--no-fund']);
 const installed=path.join(prefix,...(process.platform==='win32'?[]:['lib']),'node_modules','articulate-local');
 const cli=path.join(installed,'bin','articulate.mjs'),server=path.join(installed,'server','index.mjs');
 const run=args=>JSON.parse(execFileSync(process.execPath,[cli,...args],{env,cwd:project,encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));
 const author=new ArticulateLocalService(directory,{credentials:null});await author.saveStyles({styles:[{name:'General fixture',responseShape:'Use a long general explanation with XML sections.',isDefault:true}],localStorageConsent:true,userApproved:true});
 const input=path.join(temp,'mode.json');async function create(name,rule){await writeFile(input,JSON.stringify({name,preferences:[{rule}]}));return run(['mode','create','--input',input,'--project',project,'--approve']);}
 const work=await create('Work','Lead with a concise verification checklist.'),personal=await create('Personal','Use a friendly worked example.');
 assert.equal(work.revision,1);assert.equal(run(['mode','list']).modes.length,2);checks.push('installed CLI creates two isolated profiles through paths containing spaces');
 const definition={key:'SR4',aliases:['#56','**1'],title:'Review one authorization boundary',steps:['Inspect the selected route and object ownership checks.'],verification:['Report allowed and denied cases with untested assumptions.'],requiredInputs:[{name:'route',description:'The exact handler to inspect.'}],projectVersions:['v1'],references:[{projectId:work.projects[0],path:'docs/security.md',sha256:hash(await readFile(documentation))}]};
 const file=path.join(temp,'workflow.json');await writeFile(file,JSON.stringify(definition));const workflow=run(['workflow','save','--mode','Work','--input',file,'--approve']);
 await writeFile(file,JSON.stringify({...definition,title:'Revised authorization review'}));assert.equal(run(['workflow','save','--mode','Work','--input',file,'--id',workflow.id,'--revision','1','--approve']).revision,2);
 checks.push('installed CLI saves immutable shortcut revisions and aliases');
 const prepared=await prepareConnections(directory,{serverEntry:server});assert.equal(prepared.length,4);
 const grants={codex:[work.id],'claude-code':[work.id,personal.id],claude:[work.id],cursor:[personal.id]};
 async function consent(clientEnv,ids){const service=new ArticulateLocalService(directory,{credentials:readClientCredentials(clientEnv)});const window=await createConsentWindow(service);try{const body=new URLSearchParams({action:'enable',agree:'yes'});for(const id of ids)body.append('mode',id);const response=await fetch(window.url,{method:'POST',headers:{Origin:new URL(window.url).origin,'Content-Type':'application/x-www-form-urlencoded'},body});assert.equal(response.status,200);await window.done;}finally{await window.close();}}
 for(const item of prepared){const configuration=await clientConfiguration(directory,{id:item.clientId,host:'cursor',server});const clientEnv={...env,...configuration.mcpServers.articulate.env};await consent(clientEnv,grants[item.host]);const client=new Client({name:'synthetic-'+item.host,version:'1.0.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:[server],env:clientEnv,stderr:'pipe'}));clients.push({host:item.host,client,env:clientEnv});
  const call=(name,args={})=>client.callTool({name,arguments:args});const status=decode(await call('articulate_status'));assert.equal(status.bundleVersion,release.version);assert.equal(status.memory.legacySharingEnabled,false);assert.equal(status.recalibration,undefined);
  const permitted=decode(await call('articulate_list_modes'));assert.deepEqual(permitted.modes.map(m=>m.id).sort(),[...grants[item.host]].sort());
  const ref=item.host==='cursor'?'Personal':'Work';const policy=decode(await call('articulate_get_policy',{modeRef:ref,projectPath:project,task:'debugging',maxContextBytes:1800}));assert.equal(policy.mode.id,ref==='Work'?work.id:personal.id);assert(Buffer.byteLength(JSON.stringify(policy))<=1800);assert(!JSON.stringify(policy).includes('XML'));assert(!JSON.stringify(policy).includes(ref==='Work'?'friendly':'verification checklist'));
  const analysis=decode(await call('articulate_get_analysis',{modeRef:ref,projectPath:project}));assert.equal(analysis.mode.id,policy.mode.id);assert.equal(analysis.rawHistoryShared,false);
  assert((await call('articulate_get_policy',{modeRef:'legacy',projectPath:project})).isError);if(item.host!=='claude-code')assert((await call('articulate_get_policy',{modeRef:ref==='Work'?'Personal':'Work',projectPath:project})).isError);
  checks.push(item.host+': real stdio transport enforces its profile grants, budget, analysis scope and General denial');
 }
 const dual=clients.find(x=>x.host==='claude-code').client;const call=(name,args={})=>dual.callTool({name,arguments:args});
 for(const [sessionId,modeRef] of [['work-chat','Work'],['personal-chat','Personal']])decode(await call('articulate_select_mode',{sessionId,modeRef,projectPath:project,userApproved:true}));
 const [a,b]=await Promise.all(['work-chat','personal-chat'].map(sessionId=>call('articulate_get_policy',{sessionId,projectPath:project,task:'debugging'}).then(decode)));assert.equal(a.mode.id,work.id);assert.equal(b.mode.id,personal.id);checks.push('parallel chats on one connection retain independent profile selections');
 const shortcutArgs={modeRef:'Work',key:'sr4@1',projectPath:project,projectVersion:'v1',inputs:{route:'/billing'}};
 let resolved=decode(await call('articulate_resolve_workflow',shortcutArgs));assert.equal(resolved.ready,true);assert.equal(resolved.workflow.revision,1);assert.equal(resolved.workflow.title,definition.title);assert.equal(resolved.executesActions,false);
 const missing=decode(await call('articulate_resolve_workflow',{...shortcutArgs,key:'#56',inputs:{}}));assert.equal(missing.ready,false);assert.equal(missing.steps,undefined);
 assert((await call('articulate_resolve_workflow',{...shortcutArgs,projectVersion:'v2'})).isError);
 await writeFile(documentation,'Changed documentation that needs review.');resolved=decode(await call('articulate_resolve_workflow',shortcutArgs));assert.equal(resolved.ready,false);assert.deepEqual(resolved.staleReferences,['docs/security.md']);assert.equal(resolved.steps,undefined);checks.push('pinned shortcut retrieval checks inputs, exact project version and stale documentation; executes nothing');
 const cursor=clients.find(x=>x.host==='cursor');const original=decode(await cursor.client.callTool({name:'articulate_get_policy',arguments:{modeRef:'Personal',projectPath:project,task:'debugging'}}));const cached=decode(await cursor.client.callTool({name:'articulate_get_policy',arguments:{modeRef:'Personal',projectPath:project,task:'debugging'}}));assert.equal(cached.cache.hit,true);assert.equal(original.cache.key,cached.cache.key);
 await consent(cursor.env,[]);assert((await cursor.client.callTool({name:'articulate_get_policy',arguments:{modeRef:'Personal',projectPath:project,task:'debugging'}})).isError);assert.equal(decode(await call('articulate_get_policy',{sessionId:'personal-chat',projectPath:project})).mode.id,personal.id);checks.push('cache hits recheck grants; revocation is independent per agent');
 run(['mode','delete','--mode','Work','--revision','1','--approve']);assert((await call('articulate_get_policy',{sessionId:'work-chat',projectPath:project})).isError);assert.equal(decode(await call('articulate_get_policy',{sessionId:'personal-chat',projectPath:project})).mode.id,personal.id);checks.push('deleting a profile denies stale selections without falling back or breaking another profile');
 // Stop processes before native Windows erasure: unlinking active DB handles is OS-specific.
 for(const item of clients)await item.client.close();clients.length=0;
 run(['erase','--confirmation','DELETE LOCAL ARTICULATE DATA','--approve']);assert.equal(await readFile(documentation,'utf8'),'Changed documentation that needs review.');assert.equal(run(['mode','list']).modes.length,0);checks.push('whole-store CLI deletion erases profile state while preserving project files');
 report.passed=true;
}catch(error){report.error=error.message;throw error;}finally{
 for(const item of clients)await item.client.close().catch(()=>{});
 await mkdir(path.join(root,'artifacts'),{recursive:true});await writeFile(path.join(root,'artifacts/work-modes-distribution-report.json'),JSON.stringify(report,null,2)+'\n');
 await rm(temp,{recursive:true,force:true});console.log(JSON.stringify(report));
}
