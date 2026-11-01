import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runModesCli,runModesMenu} from '../src/modes-cli.mjs';
import {ActivityStore} from '../../../packages/storage-local/src/activity.js';
import {WorkModes} from '../../../packages/storage-local/src/work-modes.js';
import {projectIdentity} from '../src/project-discovery.mjs';

async function fixture(run){const root=await mkdtemp(path.join(os.tmpdir(),'articulate-mode-cli-')),directory=path.join(root,'data'),project=path.join(root,'repo');await mkdir(project);try{const info=await projectIdentity(project);const store=new ActivityStore(directory,{create:true});store.transaction(()=>store.set('project_catalog',JSON.stringify([{id:info.id,name:'Fixture project',path:project}])));store.close();const output=[];const cli=args=>runModesCli(args,{directory,output:x=>output.push(x)});await run({root,directory,project,info,cli,output});}finally{await rm(root,{recursive:true,force:true});}}

test('installed-style CLI CRUD, versioned shortcuts, independent export and explicit deletion are consistent',()=>fixture(async f=>{
 const input=path.join(f.root,'mode.json');await writeFile(input,JSON.stringify({name:'Work',preferences:[{rule:'Lead with a concise example.'}]}));await assert.rejects(()=>f.cli(['mode','create','--input',input,'--project',f.project]),/approve/);const mode=await f.cli(['mode','create','--input',input,'--project',f.project,'--approve']);assert.equal(mode.name,'Work');
 const workflow=path.join(f.root,'workflow.json');await writeFile(workflow,JSON.stringify({key:'#56',title:'Focused review',steps:['Inspect the selected handler only.'],verification:['Report evidence and the remaining caveat.']}));const saved=await f.cli(['workflow','save','--mode','Work','--input',workflow,'--approve']);const resolved=await f.cli(['workflow','resolve','--mode','Work','--key','#56@1','--project',f.project]);assert.equal(resolved.ready,true);assert.equal(resolved.executesActions,false);
 const exported=path.join(f.root,'export.json');await f.cli(['mode','export','--mode','Work','--path',exported,'--approve']);const data=JSON.parse(await readFile(exported,'utf8'));assert.equal(data.mode.name,'Work');assert.equal(data.workflows[0].id,saved.id);assert(!('sources' in data.mode));await assert.rejects(()=>f.cli(['mode','export','--mode','Work','--path',path.join(f.directory,'bad.json'),'--approve']),/outside/);
 await f.cli(['mode','delete','--mode','Work','--revision','1','--approve']);assert.equal((await f.cli(['mode','list'])).modes.length,0);assert.equal(JSON.parse(await readFile(exported,'utf8')).mode.name,'Work');
}));
test('interactive profile creation uses choices and an explicit review, without scanning or approval of inferred rules',()=>fixture(async f=>{
 let step=0,preferences=0;const messages=[];const ui={welcome(){},section(){},note:x=>messages.push(x),success:x=>messages.push(x),ask:async(question,options)=>{
  if(question==='What would you like to do?')return step++===0?'create':'back';
  if(question.startsWith('Profile name'))return 'Work';
  if(question==='Which projects belong to this profile?')return [f.info.id];
  if(question==='Task focus')return 'all';
  if(question.startsWith('Preference,'))return preferences++===0?'Lead with a concrete example.':'';
  if(question==='Save this profile?')return 'yes';
  throw new Error('Unexpected UI question: '+question);
 }};await runModesMenu({directory:f.directory,ui});const store=new ActivityStore(f.directory);try{const mode=new WorkModes(store).find('Work');assert(mode);assert.deepEqual(mode.projects,[f.info.id]);assert.deepEqual(mode.sources,[]);assert.equal(store.observations().length,0);assert.equal(store.clients().length,0);assert(messages.some(m=>m.includes('upgrades')));}finally{store.close();}
}));
test('invalid JSON does not echo input and does not create a profile',()=>fixture(async f=>{
 const file=path.join(f.root,'broken.json'),marker='SYNTHETIC_DO_NOT_ECHO';await writeFile(file,'{"'+marker+'":');await assert.rejects(()=>f.cli(['mode','create','--input',file,'--project',f.project,'--approve']),error=>!error.message.includes(marker)&&error.message==='Invalid JSON input');assert.equal((await f.cli(['mode','list'])).modes.length,0);
}));
