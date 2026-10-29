import {mkdir,lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {withActivityStore} from '../../../packages/storage-local/src/activity.js';
import {digest} from '../../../packages/storage-local/src/activity-schema.js';
import {discoverProjectActivity,projectIdentity,SOURCE_LABELS} from './project-discovery.mjs';
import {importSource} from './adapters.mjs';
import {analyzeActivity,validateLocalModel} from './analysis.mjs';
import {prepareConnections} from './connections.mjs';
import {processActivity,HOST_LABELS} from './pipeline.mjs';
import {sharedAnalysis,syncAnalysis} from './shared-analysis.mjs';
import {applicableRule} from './rules.mjs';
import {enrollClient,reviewLocalMemory,clientConfiguration} from './memory.mjs';
import {createTerminal,confirmChoices} from './terminal.mjs';
import {manualSetup} from './manual-setup.mjs';

const yes=value=>/^(y|yes)$/i.test(value.trim());
function rulesFor(store,ids,status,limit=41) {
  return store.db.prepare("SELECT body FROM observations WHERE status=? AND ((?='approved' AND json_extract(body,'$.scope.kind')='user') OR json_extract(body,'$.scope.projectId') IN (SELECT value FROM json_each(?))) ORDER BY id LIMIT ?").all(status,status,JSON.stringify(ids),limit).map(row=>JSON.parse(row.body));
}
async function privateDirectory(directory) {
  await mkdir(directory,{recursive:true,mode:0o700});const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Unsafe setup output directory');
}
async function savePrivate(file,text) {
  try {const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new Error('Unsafe setup output file');}catch(error){if(error.code!=='ENOENT')throw error;}
  await writeFile(file,text,{mode:0o600});
}
function selection(answer,count) {
  const value=answer.trim().toLowerCase();
  if(value==='all')return Array.from({length:count},(_,i)=>i);
  if(!value||['skip','no','n'].includes(value))return [];
  if(!/^\d+(?:\s*,\s*\d+)*$/.test(value))return null;
  const numbers=[...new Set(value.split(',').map(n=>Number(n)-1))];
  return numbers.every(n=>n>=0&&n<count)?numbers:null;
}
export function terminalQuestions({input=process.stdin,output=process.stdout}={}) {
  return createTerminal({input,output});
}

/** Project-first setup: one scope approval, automatic local processing, one rule review. */
export async function runGuidedSetup({mode,projectPath,directory,serverEntry,ask,output=console.log,ui=null,showWelcome=true,discovery={},engine='explicit',model,endpoint,maxImportBatches=1000,maxAnalysisBatches=10000}={}) {
  if(!['project','all'].includes(mode))throw new Error('Choose project or all');
  const selected=mode==='project'?await projectIdentity(path.resolve(projectPath??'.')):null;
  if(engine==='ollama')validateLocalModel({model,endpoint});else if(engine!=='explicit')throw new Error('Choose explicit or ollama local analysis');
  const scope=selected?selected.path:'all projects found in your local coding-agent history';
  if(ui){if(showWelcome)ui.welcome();ui.section('1 / 4','Choose what Articulate can learn from');}
  else output('Articulate · '+(selected?'One project':'All projects'));
  output('Scope: '+scope);
  output('Find available Codex, Claude Code and Cursor activity on this device. Selected text is redacted for credential patterns and kept locally for 30 days.');
  output(engine==='explicit'?'Method: quick scan for explicitly stated preferences. Deeper interpretation needs a local model.':'Method: on-device analysis with '+model+'.');
  output('You review the suggestions before agents can use them. Each agent needs your own sharing approval.');
  if(!yes(await ask(ui?'Use this local activity?':'Continue with this scope? [y/N]',confirmChoices('Yes, find my activity','No, leave it unchanged')))){output('Cancelled. No activity was read or profile changed.');return {status:'cancelled',mode};}
  if(ui)ui.section('2 / 4','Bring your activity together');
  const progress=(message,phase)=>ui?ui.progress(message,{phase}):output(message);
  progress('Finding agent traces and matching repositories…','discovery');
  const knownProjects=await withActivityStore(directory,s=>JSON.parse(s.setting('project_catalog')??'[]'));
  const found=await discoverProjectActivity({knownProjects,...discovery,projectPath:selected?.path??null,progress:p=>progress('Finding traces: '+p.filesExamined+' files checked…','discovery')});
  ui?.stopProgress();
  if(!found.projects.length){output('No supported, attributable activity found for this scope. Your profile is unchanged.');if(found.unattributedFiles)output(found.unattributedFiles+' files could not be linked to a project.');if(ui)return manualSetup({mode,selected,directory,ask,ui,output,serverEntry});return {status:'no_activity',mode,coverage:found.coverage,unattributedFiles:found.unattributedFiles};}
  if(ui){
    ui.success(`Found activity across ${found.projects.length} ${found.projects.length===1?'project':'projects'}`);
    const counts={};for(const p of found.projects)for(const [kind,n] of Object.entries(p.agents))counts[kind]=(counts[kind]??0)+n;
    for(const [kind,count] of Object.entries(counts))ui.note(`${SOURCE_LABELS[kind]} · ${count} activity files`);
    ui.note('Available local history only; deleted and remote-only sessions may be missing.');
  } else {
    for(const project of found.projects){output(project.path+'\n  Traces: '+Object.entries(project.agents).map(([kind,n])=>SOURCE_LABELS[kind]+' ('+n+')').join(', '));if(project.traces.some(t=>t.association.includes('path label')))output('  Cursor association: matching workspace-folder path label.');}
    output(found.coverage);
  }
  if(found.unattributedFiles)output(found.unattributedFiles+' files have no reliable project association and were skipped.');
  if(ui&&found.warnings.length)ui.warning(`${found.warnings.length} discovery notes are available in the saved report.`);
  else for(const warning of found.warnings)output('Coverage: '+warning);
  const ids=found.projects.map(p=>p.id),issues=[];
  let imported=0,processed=0,incomplete=found.incomplete,pipeline;
  const snapshot=await withActivityStore(directory,async store=>{
    const known=JSON.parse(store.setting('project_catalog')??'[]');const catalog=new Map(known.map(p=>[p.id,p]));
    for(const p of found.projects)catalog.set(p.id,{id:p.id,name:p.name,path:p.path,paths:p.paths});
    store.transaction(()=>store.set('project_catalog',JSON.stringify([...catalog.values()])));
    // Register the complete approved plan before processing budgets are applied.
    for(const project of found.projects)for(const trace of project.traces) {
      const existing=store.sources().find(s=>s.kind===trace.kind&&s.path===trace.path&&s.projectId===project.id);
      if(existing?.paused||existing&&(!existing.retainContent||existing.retentionDays!==30)){issues.push('An existing paused or differently retained source was left unchanged');incomplete=true;continue;}
      try{store.addSource({kind:trace.kind,path:trace.path,projectId:project.id,...(trace.projectPaths?{projectPaths:trace.projectPaths,repositoryId:project.id}:{}),retainContent:true,retentionDays:30,userApproved:true});}catch(error){issues.push(error.message);incomplete=true;}
    }
    pipeline=await processActivity(store,{projectIds:ids,engine,model,endpoint,maxImportBatches,maxAnalysisBatches,progress:p=>{
      if(p.phase==='import')progress(p.batches?`Reading activity · ${p.importedEvents.toLocaleString('en-US')} new records · ${p.remainingSourceChecks} files left`:`Reading ${p.sources} approved activity files…`,'import');
      else progress(p.batches?`Understanding your preferences · ${p.processedEvents.toLocaleString('en-US')} records checked · ${p.remainingProjects} projects left`:`Checking preferences with ${engine==='explicit'?'a quick local scan':model}…`,'analysis');
    }});
    imported=pipeline.importedEvents;processed=pipeline.processedEvents;incomplete||=!pipeline.processingComplete||pipeline.failedSources>0||pipeline.sourcesWithGaps>0||pipeline.excludedSources>0;
    const progressState=JSON.parse(store.setting('activity-progress')??'{}');store.transaction(()=>store.set('activity-progress',JSON.stringify({...progressState,latestScope:selected?.id??'all-projects'})));
    const summary=sharedAnalysis(store);
    const proposalCount=Number(store.db.prepare("SELECT count(*) AS count FROM observations WHERE status='proposed' AND json_extract(body,'$.scope.projectId') IN (SELECT value FROM json_each(?))").get(JSON.stringify(ids)).count);
    return {summary,proposalCount,revision:store.revision,proposals:rulesFor(store,ids,'proposed'),approved:rulesFor(store,ids,'approved',1000)};
  },{create:true});
  await syncAnalysis(directory);
  ui?.stopProgress();
  if(ui)ui.section('3 / 4','Review your shared profile');
  const proposals=snapshot.proposals.filter(applicableRule).slice(0,40);
  output(ui?`${snapshot.summary.analyzedEvents.toLocaleString('en-US')} activity records checked · ${snapshot.summary.pendingEvents.toLocaleString('en-US')} still pending`:`\nProcessing summary: ${snapshot.summary.importedEvents} imported · ${snapshot.summary.analyzedEvents} analyzed · ${snapshot.summary.pendingEvents} pending`);
  for(const [kind,count] of Object.entries(snapshot.summary.agents))output(ui?`  ${SOURCE_LABELS[kind].padEnd(14)} ${count.analyzed.toLocaleString('en-US')} checked`:`  ${SOURCE_LABELS[kind]}: ${count.imported} imported, ${count.analyzed} analyzed`);
  if(pipeline.failedSources)output(`Coverage: ${pipeline.failedSources} sources could not be read; successful sources were preserved.`);
  if(pipeline.excludedSources)output(`Coverage: ${snapshot.summary.auxiliarySources} auxiliary files and ${snapshot.summary.metadataOnlySources} control-only files were excluded from preference evidence.`);
  output(engine==='explicit'?'Analysis: literal requests found in your activity; broader behavioral inference needs a configured local model.':'Analysis: local-model proposals grounded in the imported evidence; review is required.');
  for(const issue of [...new Set(issues)])output('Coverage: '+issue);
  if(!pipeline.processingComplete)output('Processing is not finished. Run articulate refresh to resume the approved sources.');
  if(incomplete)output('Coverage gaps remain. A fast literal extraction pass is not a full behavioral analysis.');
  let revision=snapshot.revision;
  const flagged=[...snapshot.approved,...snapshot.proposals].filter(o=>!applicableRule(o));
  if(flagged.length){
    output(ui?`${flagged.length} older suggestions look unfinished or copied from tool instructions. They are excluded from your active preferences.`:`\n${flagged.length} existing imported rules need another review and are excluded from policies:`);
    if(!ui)flagged.forEach(o=>output('  '+o.rule));
    if(yes(await ask(ui?'Remove these unreliable suggestions?':'Reject these boilerplate or unfinished rules? [y/N]',confirmChoices('Yes, remove these suggestions','No, keep them for later review')))){for(const item of flagged){const change=await reviewLocalMemory(directory,{id:item.id,action:'reject',expectedRevision:revision,userApproved:true});revision=change.revision;}}
  }
  const usableApproved=snapshot.approved.filter(applicableRule);
  const readyStatus=!pipeline.processingComplete?'in_progress':incomplete?'complete_with_gaps':'ready';
  if(!proposals.length&&!usableApproved.length){output('Activity processed, but no reliable working preferences were found.');if(ui)return manualSetup({mode,selected,directory,ask,ui,output,serverEntry,projectIds:ids,processing:pipeline});output('No profile is marked ready and no agent connections were created.');return {status:'no_rules',mode,projectIds:ids,importedEvents:imported,analysis:engine,incomplete};}
  if(!ui){output('\nReview your shared profile:');proposals.forEach((p,i)=>{const project=found.projects.find(g=>g.id===p.scope.projectId);output((i+1)+'. '+p.rule+'\n   Project: '+project.name+' · '+p.supportCount+' distinct evidence fingerprints · '+p.sourceKinds.map(k=>SOURCE_LABELS[k]).join(', '));});}
  if(snapshot.proposals.length>40)output('Additional proposals remain unapproved for a later review.');
  let chosen;
  if(proposals.length) {
    if(ui)chosen=(await ask('Which preferences should your agents use?',{multiple:true,choices:proposals.map((p,i)=>({value:i,label:p.rule,hint:`${found.projects.find(g=>g.id===p.scope.projectId).name} · ${p.sourceKinds.map(k=>SOURCE_LABELS[k]).join(', ')} · ${p.supportCount} evidence matches`}))}));
    else for(let tries=0;tries<3;tries++){chosen=selection(await ask('Approve all shown rules, selected numbers (1,3), or skip? [all/numbers/skip]'),proposals.length);if(chosen!==null)break;output('Enter all, comma-separated rule numbers, or skip.');}
    if(chosen===null)throw new Error('No valid rule selection; proposals remain available for review');
  }else {output(usableApproved.length+' previously approved rules are available.');chosen=[];}
  if(!chosen.length&&!usableApproved.length){output('Your draft is saved for review. No agent connections were created.');return {status:'review_required',mode,projectIds:ids,incomplete};}
  for(const index of chosen){const result=await reviewLocalMemory(directory,{id:proposals[index].id,action:'approve',expectedRevision:revision,userApproved:true});revision=result.revision;}
  if(ui)ui.section('4 / 4','Connect your agents');
  if(!yes(await ask(ui?'Prepare your agent connections?':'Prepare connection files for Codex, Claude Code, Claude Desktop and Cursor? [y/N]',confirmChoices('Yes, prepare all four agents','No, finish for now')))){output('Your reviewed preferences are saved. Agent connections were not created.');return {status:readyStatus,mode,projectIds:ids,revision,connections:[],incomplete};}
  const scopeId=selected?.id??'all-projects';const folder=path.join(directory,'connections',scopeId);
  await privateDirectory(path.join(directory,'connections'));await privateDirectory(folder);
  const connections=await prepareConnections(directory,{scopeId,projects:selected?ids:['*'],serverEntry});
  const result={status:readyStatus,processing:pipeline,mode,projectIds:ids,projects:found.projects.map(p=>({id:p.id,path:p.path,agents:p.agents})),revision,analysis:engine,importedEvents:imported,incomplete,unattributedFiles:found.unattributedFiles,pendingReview:snapshot.proposalCount-chosen.length,connections,coverage:found.coverage,warnings:found.warnings};
  const instructions='# Connect your agents\n\nYour reviewed preferences are saved. Run `articulate connect` to install these settings, then restart each host. Use the same server version in every host. Check setup-report.json for processing and coverage status.\n\nEach registered client starts with sharing disabled. Approve its local permission page to enable it. Approved policies and derived summaries can then be requested; raw activity stays local. Preparing these files alone does not modify host configuration.\n\nAsk the agent to call articulate_get_policy with projectPath set to the current workspace’s absolute path. A single-project connection can infer its project automatically. Current instructions override saved preferences.\n';
  await savePrivate(path.join(folder,'CONNECT.md'),instructions);await savePrivate(path.join(folder,'setup-report.json'),JSON.stringify(result,null,2)+'\n');
  output(!pipeline.processingComplete?'\nPartial run saved — processing is still pending.':incomplete?'\nProcessing finished with coverage gaps; reviewed rules are available.':'\nDone — processing is complete and your reviewed rules are available.');
  if(ui){ui.success('Connection files prepared for all four agents.');ui.note('Your shared profile is saved in '+directory);ui.note('A refresh reminder appears in your agents after 60 days.');}
  else {output('Connect your AI agents using: '+path.join(folder,'CONNECT.md'));for(const connection of connections)output('  '+HOST_LABELS[connection.host]+': '+connection.file);output('Shared analysis: '+path.join(directory,'analysis.md'));output('Next: articulate connect. Then approve each agent once in its local permission window. Refresh checks are due every 60 days.');}
  return result;
}
