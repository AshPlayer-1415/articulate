import {lstat} from 'node:fs/promises';
import path from 'node:path';
import {withActivityStore} from '../../../packages/storage-local/src/activity.js';
import {reviewLocalMemory} from './memory.mjs';
import {prepareConnections,writePrivate} from './connections.mjs';
import {confirmChoices} from './terminal.mjs';
import {applicableRule} from './rules.mjs';

export const STARTER_PREFERENCES=[
  'Lead with the answer, then explain the useful details.',
  'Use a small concrete example when explaining an unfamiliar concept.',
  'When debugging, show the failing case, the fix, and a verification step.',
  'Keep responses brief unless I ask for a deeper explanation.'
];

export async function manualSetup({mode,selected,directory,ask,ui,output,serverEntry,projectIds=[],processing=null}={}) {
  ui.section('3 / 4','Choose how your agents should respond');
  ui.note('We have not established reliable preferences from this history.');
  ui.note('You can choose your own preferences now. These are your choices, not inferred traits.');
  const existing=await withActivityStore(directory,s=>s.observations({status:'approved',limit:1000}).filter(r=>applicableRule(r)&&(r.scope.kind==='user'||selected&&r.scope.projectId===selected.id)));
  const chosen=existing.length?[]:await ask('Which preferences would you like to save?',{multiple:true,choices:STARTER_PREFERENCES.map((label,value)=>({label,value}))});
  if(!Array.isArray(chosen)||chosen.some(i=>!Number.isInteger(i)||i<0||i>=STARTER_PREFERENCES.length))throw new Error('Invalid preference selection');
  if(!chosen.length&&!existing.length){ui.note('No preferences were saved. You can return whenever you are ready.');return {status:'review_required',mode,projectIds,connections:[]};}
  if(existing.length)ui.note(`${existing.length} previously reviewed preferences are available. No duplicate preferences will be added.`);
  const scopeId=selected?.id??'all-projects';
  const scope=selected?{kind:'project',projectId:selected.id}:{kind:'user'};
  let revision=await withActivityStore(directory,s=>{
    if(selected){const catalog=JSON.parse(s.setting('project_catalog')??'[]');if(!catalog.some(p=>p.id===selected.id))s.transaction(()=>s.set('project_catalog',JSON.stringify([...catalog,{id:selected.id,name:selected.name,path:selected.path,paths:[selected.path]}])));}
    const progress=JSON.parse(s.setting('activity-progress')??'{}');s.transaction(()=>s.set('activity-progress',JSON.stringify({...progress,latestScope:scopeId})));
    return s.revision;
  },{create:true});
  for(const i of new Set(chosen)){const result=await reviewLocalMemory(directory,{action:'create',rule:STARTER_PREFERENCES[i],scope,expectedRevision:revision,userApproved:true});revision=result.revision;}
  ui.success('Your chosen preferences are saved.');ui.section('4 / 4','Connect your agents');
  let connections=[];
  if(await ask('Prepare your agent connections?',confirmChoices('Yes, prepare all four agents','No, finish for now'))==='yes')connections=await prepareConnections(directory,{scopeId,projects:selected?[selected.id]:['*'],serverEntry});
  const result={status:processing&&!processing.processingComplete?'in_progress':'manual_ready',mode,projectIds:selected?[selected.id]:projectIds,revision,analysis:'user-chosen-preferences',manualPreferences:existing.length+[...new Set(chosen)].length,processing,connections,incomplete:!!processing&&(!processing.processingComplete||processing.failedSources>0||processing.sourcesWithGaps>0||processing.excludedSources>0)};
  if(connections.length){
    const folder=path.dirname(connections[0].file);const st=await lstat(folder);if(!st.isDirectory()||st.isSymbolicLink())throw new Error('Unsafe connection folder');
    await writePrivate(path.join(folder,'setup-report.json'),JSON.stringify(result,null,2)+'\n');
    await writePrivate(path.join(folder,'CONNECT.md'),'# Connect your agents\n\nThese preferences were explicitly chosen by you. Historical understanding has not been established. Run `articulate connect`, approve the selected clients, and reload their MCP connections. Ask an agent to call articulate_get_policy with the current projectPath.\n');
    ui.success('Connection files prepared for all four agents.');
  }
  return result;
}
