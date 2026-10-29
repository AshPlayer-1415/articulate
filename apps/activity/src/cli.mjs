#!/usr/bin/env node
import {writeFile,lstat,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveDataDirectory,withRecoveredLocalProfileLock,withLocalProfileLock} from '@articulate/storage-local';
import {ActivityStore,withActivityStore,readClientCredentials} from '@articulate/storage-local/activity';
import {digest} from '@articulate/storage-local/activity-schema';
import {discoverSources,validateSourcePath,importSource,SUPPORTED_FORMATS} from './adapters.mjs';
import {analyzeActivity} from './analysis.mjs';
import {enrollClient,reviewLocalMemory,clientConfiguration} from './memory.mjs';
import {createTerminal} from './terminal.mjs';

const HELP=`Articulate local activity and memory (explicit local commands)

  activity project [PROJECT_DIRECTORY]      Guided setup for one repository (defaults to the current directory)
  activity all                              Guided setup across projects; agents are detected automatically
  activity refresh                          Process previously approved sources; save shared analysis
  activity report                           Show coverage and refresh status
  activity insights [--examples] [--path ABSOLUTE_NEW_FILE]  Local wording/count report from retained approved activity
  activity job --input EXPORT.json --policy SCOPE.json --path NEW_REPORT.json [--container]  Bounded offline processing; proposals only
  activity connect                          Install prepared host configurations after confirmation
  activity status
  activity discover                         Metadata only; does not read transcript contents
  activity source add --kind codex|claude-code|cursor --path ABSOLUTE_PATH --project PROJECT_ID [--project-path ABSOLUTE_PROJECT] [--since ISO_DATE] [--retain-content] [--retention-days 30] --approve
  activity source list
  activity source pause|resume|remove --id SOURCE_ID --approve
  activity import --source SOURCE_ID [--limit 1000] [--all]
  activity analyze [--engine explicit|ollama|compatible] [--model INSTALLED_LOCAL_MODEL] [--endpoint http://127.0.0.1:11434] [--provider-config ABSOLUTE_JSON] [--allow-remote-analysis] [--project PROJECT_ID] [--limit 40] [--all] [--reset --approve]
  activity review list [--status proposed|approved|rejected] [--project PROJECT_ID] [--limit 100] [--after MEMORY_ID]
  activity review approve|reject|edit --id MEMORY_ID --revision CURRENT_REVISION [--rule RULE] [--scope user|project|session] [--project PROJECT_ID] [--session SESSION_ID] [--expires ISO_DATE] --approve
  activity rollback --revision REVISION --expected-revision CURRENT_REVISION --approve
  activity client add --id CLIENT_ID --name NAME [--projects PROJECT_ID,PROJECT_ID] --approve
  activity client list
  activity client config --id CLIENT_ID --host codex|cursor|claude [--server ABSOLUTE_SERVER]
  activity client permissions --id CLIENT_ID
  activity client revoke --id CLIENT_ID --approve
  activity export --path ABSOLUTE_NEW_FILE --approve
  activity erase --confirmation "DELETE LOCAL ARTICULATE DATA" --approve

Set ARTICULATE_DATA_DIR to an absolute test directory for clean trials. Client
enrollment disables the old global disclosure grant; upgrade all host packs first.
Sources retain metadata only unless --retain-content is explicitly supplied.
Explicit analysis extracts literal requests; richer analysis needs a user-installed
local model. No automatic model download or cloud fallback is used. Remote analysis
requires compatible-provider configuration and --allow-remote-analysis.
`;
function argumentsOf(values) {
  const positional=[],options={};
  const boolean=new Set(['approve','retain-content','all','help','reset','examples','container','allow-remote-analysis']);
  const allowed=new Set([...boolean,'input','policy','image','provider-config','kind','path','project','project-path','since','retention-days','id','source','limit','engine','model','endpoint','status','revision','rule','scope','session','expires','expected-revision','name','projects','host','server','after','confirmation']);
  for(let i=0;i<values.length;i++) {
    const value=values[i];
    if(!value.startsWith('--')){positional.push(value);continue;}
    const key=value.slice(2);if(!allowed.has(key)||key in options)throw new Error('Unknown or duplicate option: '+value);
    if(boolean.has(key))options[key]=true;else {const next=values[++i];if(next===undefined||next.startsWith('--'))throw new Error('Missing value for '+value);options[key]=next;}
  }
  return {positional,options};
}
function approved(options){if(options.approve!==true)throw new Error('This local change requires --approve after reviewing the selected data or action');}
function integer(value,fallback) {if(value===undefined)return fallback;if(!/^\d+$/.test(value))throw new Error('Expected an integer');return Number(value);}
export async function runActivityCli(argv=process.argv.slice(2),{serverEntry=null,output=console.log,progress=console.error,welcomeShown=false}={}) {
  const {positional,options:o}=argumentsOf(argv);
  let [command,action]=positional;
  const directory=resolveDataDirectory();
  const show=value=>{output(typeof value==='string'?value:JSON.stringify(value,null,2));return value;};
  if(!command&&process.stdin.isTTY&&process.stdout.isTTY&&!o.help) {
    const terminal=createTerminal();
    if(!terminal.interactive){terminal.close();return show(HELP);}
    try {
      terminal.welcome();
      command=await terminal.ask('Where would you like to begin?',{initial:1,choices:[{value:'project',label:'One project',hint:'Current folder: '+process.cwd()+'. Run from your project folder to use this option.'},{value:'all',label:'My work across projects',hint:'Find and combine supported coding-agent histories on this device.'},{value:'connect',label:'Connect my agents',hint:'Install connections and choose which agents can use your reviewed profile.'},{value:'report',label:'View my saved profile summary'},{value:'insights',label:'Explore my activity patterns',hint:'Counts and wording patterns from activity you already approved. No new scan.'},{value:'quit',label:'Exit'}]});
    }finally{terminal.close();}
    if(command==='quit')return {status:'cancelled'};
    return runActivityCli([command],{serverEntry,output,progress,welcomeShown:true});
  }
  if(!command||command==='help'||o.help)return show(HELP);
  if(command==='job') {
    if(positional.length!==1)throw new Error('Use job with --input, --policy and --path');
    const {runProcessingCli}=await import('./processing-cli.mjs');return show(await runProcessingCli(o));
  }
  if(['project','all'].includes(command)) {
    if(positional.length>(command==='project'?2:1))throw new Error('Use project [DIRECTORY] or all');
    const {runGuidedSetup,terminalQuestions}=await import('./setup.mjs');
    const terminal=terminalQuestions();
    const ui=terminal.interactive?terminal:null;
    try {
      const result=await runGuidedSetup({mode:command,projectPath:action,directory,serverEntry,ask:terminal.ask,ui,showWelcome:!welcomeShown,output:ui?ui.write:output,engine:o.engine??(o.model||process.env.ARTICULATE_LOCAL_MODEL?'ollama':'explicit'),model:o.model??process.env.ARTICULATE_LOCAL_MODEL,endpoint:o.endpoint});
      if(ui&&result.connections?.length){const {connectInteractively}=await import('./connection-flow.mjs');await connectInteractively(directory,{ui,serverEntry,output:ui.write});}
      if(ui&&result.status!=='cancelled'){if(result.status==='review_required'){ui.section('·','Review is still needed');ui.note('Run articulate when you are ready to choose preferences.');}else{ui.section('✓',result.status==='in_progress'?'Your progress is saved':'Your local setup is saved');ui.note(result.status==='in_progress'?'Run articulate refresh to continue processing.':'You can return any time by running articulate.');}}
      return result;
    }finally{terminal.close();}
  }
  if(command==='refresh') {
    const {processActivity}=await import('./pipeline.mjs');const {syncAnalysis}=await import('./shared-analysis.mjs');
    const result=await withActivityStore(directory,store=>{if(!store.db)throw new Error('Run articulate project or articulate all to approve sources first');return processActivity(store,{engine:o.engine??(o.model||process.env.ARTICULATE_LOCAL_MODEL?'ollama':'explicit'),model:o.model??process.env.ARTICULATE_LOCAL_MODEL,endpoint:o.endpoint,progress:p=>progress(JSON.stringify(p))});});
    const report=await syncAnalysis(directory);return show({...result,sharedAnalysis:path.join(directory,'analysis.md'),refresh:report.refresh});
  }
  if(command==='report') {
    const {sharedAnalysis}=await import('./shared-analysis.mjs');const report=await withActivityStore(directory,s=>sharedAnalysis(s));
    const ui=createTerminal();if(!ui.interactive)return show(report);
    try{if(!welcomeShown)ui.welcome();ui.section('✓','Your saved profile summary');ui.note(`${report.analyzedEvents.toLocaleString('en-US')} activity records checked · ${report.pendingEvents.toLocaleString('en-US')} still pending`);for(const [kind,count] of Object.entries(report.agents))ui.note(`${kind}: ${count.analyzed.toLocaleString('en-US')} checked`);ui.note(`${report.workingRules.length} reviewed preferences · ${report.pendingReview} waiting for review`);if(report.failedSources||report.sourcesWithGaps)ui.warning(`${report.failedSources} files could not be read · ${report.sourcesWithGaps} have skipped records`);if(report.excludedSources)ui.note(`${report.excludedSources} auxiliary or control-only files excluded from preference evidence`);ui.note('Full summary: '+path.join(directory,'analysis.md'));return report;}finally{ui.close();}
  }
  if(command==='insights') {
    if(positional.length!==1)throw new Error('Use insights [--examples] [--path ABSOLUTE_NEW_FILE]');
    if(Object.keys(o).some(key=>!['examples','path','project','limit'].includes(key)))throw new Error('Insights supports --examples, --path, --project and --limit; use analyze for local-model proposals');
    const {insightsFromStore}=await import('./insights-store.mjs');const {insightsMarkdown}=await import('./insights.mjs');
    const report=await insightsFromStore(directory,{includeExamples:o.examples===true,projectId:o.project??null,limit:integer(o.limit,100000)});
    if(o.path){if(!path.isAbsolute(o.path))throw new Error('Choose an absolute report path');await writeFile(o.path,insightsMarkdown(report),{flag:'wx',mode:0o600});return show({saved:o.path,messages:report.analyzedMessages,profileChanged:false,note:'Local report only; no preferences were approved.'});}
    const ui=createTerminal();if(!ui.interactive)return show(report);
    try{if(!welcomeShown)ui.welcome();ui.section('✓','Your local activity patterns');ui.note(`${report.analyzedMessages.toLocaleString('en-US')} messages · ${report.sessionsWithAnalyzedMessages} sessions`);for(const p of report.patterns)ui.note(`${p.label}: ${p.messages.toLocaleString('en-US')} messages`);ui.note('These are wording matches, not a personality or learning assessment.');ui.note('Uses retained activity you already approved; no new files were scanned.');if(!o.examples)ui.note('Add --examples to include redacted prompt excerpts in the local output.');return report;}finally{ui.close();}
  }
  if(command==='connect') {
    const {connectHosts}=await import('./connections.mjs');const terminal=o.approve?null:createTerminal();
    try {
      if(terminal?.interactive){if(!welcomeShown)terminal.welcome();terminal.section('1 / 1','Connect your agents');const {connectInteractively}=await import('./connection-flow.mjs');return await connectInteractively(directory,{ui:terminal,serverEntry,output:terminal.write});}
      return show(await connectHosts(directory,{approved:o.approve===true,ask:terminal?.ask,output,serverEntry}));
    }finally{terminal?.close();}
  }
  if(command==='erase') {
    approved(o);if(o.confirmation!=='DELETE LOCAL ARTICULATE DATA')throw new Error('Erasure requires the exact local-data deletion confirmation');
    await withLocalProfileLock(directory,async()=>{for(const name of ['profile.json','assessment-session.json','.assessment-checkpoint.json','activity.sqlite','activity.sqlite-journal','activity.sqlite-wal','activity.sqlite-shm','client-credentials','connections','analysis.json','analysis.md','config-backups'])await rm(path.join(directory,name),{force:true,recursive:['client-credentials','connections','analysis.json','analysis.md','config-backups'].includes(name)});});
    return show({deleted:true,note:'Articulate profile, activity, credentials and caches erased. Original source applications and separately exported files are not deleted.'});
  }
  if(command==='status')return show(await withActivityStore(directory,s=>({...s.summary(),formats:SUPPORTED_FORMATS,privacy:'Local data and analysis. Hosted coding agents separately process permitted policy results.'})));
  if(command==='discover')return show(await discoverSources());
  if(command==='source'&&action==='list')return show(await withActivityStore(directory,s=>s.sources()));
  if(command==='source'&&action==='add') {
    approved(o);const selected=await validateSourcePath(o.path);
    if(selected.directory&&o.kind!=='cursor'&&!o['project-path'])throw new Error('Native history directories require --project-path to restrict the selected project');
    return show(await withActivityStore(directory,s=>s.addSource({kind:o.kind,path:selected.path,projectId:o.project,projectPath:o['project-path'],since:o.since,retentionDays:integer(o['retention-days'],30),retainContent:o['retain-content']===true,userApproved:true}),{create:true}));
  }
  if(command==='source'&&['pause','resume','remove'].includes(action)) {
    approved(o);const result=await withActivityStore(directory,s=>action==='remove'?s.forgetSource(o.id):(s.pauseSource(o.id,action==='pause'),{id:o.id,paused:action==='pause'}));const {syncAnalysis}=await import('./shared-analysis.mjs');await syncAnalysis(directory);return show(result);
  }
  if(command==='import'||command==='analyze') {
    let providerConfig;
    if(o['provider-config']||o['allow-remote-analysis']) {
      if(command!=='analyze'||o.engine!=='compatible'||!o['provider-config']||o.model||o.endpoint)throw new Error('Use --engine compatible and --provider-config; model and endpoint belong in that config');
      const {readProviderConfig,validateProvider}=await import('./compatible-model.mjs');providerConfig=await readProviderConfig(o['provider-config']);validateProvider(providerConfig,{allowRemoteAnalysis:o['allow-remote-analysis']===true});
    }
    const store=new ActivityStore(directory);
    try {
      if(!store.db)throw new Error('Add and approve a local source first');
      if(command==='analyze'&&o.reset){approved(o);store.transaction(()=>{store.db.prepare('DELETE FROM analyses').run();store.db.prepare("DELETE FROM settings WHERE key LIKE 'analysis-cursor:%'").run();});}
      const batches=[];
      for(let n=0;n<(o.all?100:1);n++) {
        progress(JSON.stringify({activity:command,batch:n+1,status:'running'}));
        const batch=command==='import'?await importSource(store,o.source,{limit:integer(o.limit,1000)}):await analyzeActivity(store,{engine:o.engine??'explicit',model:o.model,endpoint:o.endpoint,providerConfig,allowRemoteAnalysis:o['allow-remote-analysis']===true,projectId:o.project??null,limit:integer(o.limit,40)});
        progress(JSON.stringify({activity:command,batch:n+1,status:'complete',processed:batch.processedRecords??batch.processedEvents,hasMore:batch.hasMore}));
        batches.push(batch);if(!batch.hasMore)break;
      }
      return show({batches,hasMore:batches.at(-1)?.hasMore??false});
    }finally{store.close();}
  }
  if(command==='review'&&action==='list')return show(await withActivityStore(directory,s=>{
    const limit=integer(o.limit,100);if(limit<1||limit>500)throw new Error('Review page size must be 1–500');
    const rows=s.observations({status:o.status??null,projectId:o.project??null,limit:limit+1,afterId:o.after??null});const page=rows.slice(0,limit);
    return {revision:s.revision,observations:page,hasMore:rows.length>limit,nextAfterId:rows.length>limit?page.at(-1).id:null};
  }));
  if(command==='review'&&['approve','reject','edit'].includes(action)) {
    approved(o);const input={id:o.id,action,expectedRevision:integer(o.revision,-1),userApproved:true};
    if(o.rule)input.rule=o.rule;
    if(o.scope)input.scope={kind:o.scope,projectId:o.project,sessionId:o.session,expiresAt:o.expires};
    return show(await reviewLocalMemory(directory,input));
  }
  if(command==='rollback') {approved(o);const result=await withActivityStore(directory,s=>s.rollback({revision:integer(o.revision,-1),expectedRevision:integer(o['expected-revision'],-1),userApproved:true}));const {syncAnalysis}=await import('./shared-analysis.mjs');await syncAnalysis(directory);return show(result);}
  if(command==='client'&&action==='add') {approved(o);return show(await enrollClient(directory,{id:o.id,name:o.name,projects:o.projects?.split(',')??['*'],userApproved:true}));}
  if(command==='client'&&action==='list')return show(await withActivityStore(directory,s=>s.clients()));
  if(command==='client'&&action==='revoke') {approved(o);return show(await withRecoveredLocalProfileLock(directory,()=>withActivityStore(directory,s=>{s.revoke(o.id);return {id:o.id,sharing:false};})));}
  if(command==='client'&&['config','permissions'].includes(action)) {
    const tokenFile=path.join(directory,'client-credentials',digest(String(o.id)).slice(0,24)+'.key');
    const env={ARTICULATE_DATA_DIR:directory,ARTICULATE_CLIENT_ID:o.id,ARTICULATE_CLIENT_TOKEN_FILE:tokenFile};
    const credentials=readClientCredentials(env);
    await withActivityStore(directory,s=>s.authenticate(credentials,{sharing:false}));
    if(action==='permissions') {
      const {openClientPermission}=await import('./connection-flow.mjs');const terminal=createTerminal();
      try{return await openClientPermission(directory,{id:o.id,ui:terminal.interactive?terminal:null,output});}finally{terminal.close();}
    }
    const server=o.server??serverEntry??fileURLToPath(new URL('../../mcp/src/server.mjs',import.meta.url));
    return show(await clientConfiguration(directory,{id:o.id,host:o.host,server}));
  }
  if(command==='export') {
    approved(o);if(!o.path||!path.isAbsolute(o.path))throw new Error('Select an absolute new export path');
    const data=await withActivityStore(directory,s=>({schemaVersion:1,revision:s.revision,observations:s.db?s.db.prepare('SELECT body FROM observations ORDER BY id').all().map(r=>JSON.parse(r.body)):[],note:'Derived memory only. Raw activity and client credentials are excluded.'}));
    await writeFile(o.path,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});return show({exported:true,observations:data.observations.length});
  }
  throw new Error('Unknown activity command; run activity help');
}
