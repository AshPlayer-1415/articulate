import {WorkModes,modeJson} from '../../../packages/storage-local/src/work-modes.js';
import {digest} from '../../../packages/storage-local/src/activity-schema.js';
import {analysisSignature,explicitObservations,modelObservations} from './analysis.mjs';
import {preferenceText,preferenceIssue} from './rules.mjs';

export function modeGroups(store,mode){
 const groups=new Map(),unavailable=[];
 for(const binding of mode.sources){const source=store.source(binding.id);if(!source||source.paused){unavailable.push(binding.id);continue;}const key=JSON.stringify([source.projectId,binding.task]);const group=groups.get(key)??{projectId:source.projectId,task:binding.task,sources:[]};group.sources.push(source.id);groups.set(key,group);}
 return {groups:[...groups.values()],unavailable};
}
const signature=(catalog,mode,group,options)=>digest(JSON.stringify(['mode-analysis-1',mode.id,catalog.scopeHash(mode),group,analysisSignature(options)]));
function counts(store,sources,cursor=0,projectId){return store.db.prepare('SELECT count(*) AS total,sum(CASE WHEN rowid<=? THEN 1 ELSE 0 END) AS processed,sum(CASE WHEN role=\'user\' THEN 1 ELSE 0 END) AS users,sum(CASE WHEN role=\'user\' AND content IS NOT NULL AND content_expires_at>? THEN 1 ELSE 0 END) AS retained FROM events WHERE source_id IN (SELECT value FROM json_each(?)) AND project_id=?').get(cursor,new Date().toISOString(),JSON.stringify(sources),projectId);}
export function modeAnalysis(store,mode,{projectId=null}={}){
 const catalog=new WorkModes(store),selected=modeGroups(store,mode),groups=selected.groups.filter(g=>!projectId||g.projectId===projectId);const progress=[];
 for(const group of groups){const rows=store.db.prepare('SELECT body FROM mode_progress WHERE mode_id=?').all(mode.id).map(r=>modeJson(r.body)).filter(r=>r.scopeHash===catalog.scopeHash(mode)&&r.groupKey===JSON.stringify(group));const last=rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];const c=counts(store,group.sources,last?.cursor??0,group.projectId);progress.push({projectId:group.projectId,task:group.task,total:Number(c.total??0),processed:Number(c.processed??0),userEvents:Number(c.users??0),retainedUserEvents:Number(c.retained??0),engine:last?.engine??null,method:last?.method??'Not analyzed',pending:Number(c.total??0)-Number(c.processed??0)});}
 const totals=progress.reduce((a,g)=>({events:a.events+g.total,processed:a.processed+g.processed,userEvents:a.userEvents+g.userEvents,retainedUserEvents:a.retainedUserEvents+g.retainedUserEvents,pending:a.pending+g.pending}),{events:0,processed:0,userEvents:0,retainedUserEvents:0,pending:0});
 const report={mode:{id:mode.id,name:mode.name,revision:mode.revision},totals,groups:[],omittedGroups:0,omittedApprovedRules:0,unavailableSources:selected.unavailable.length,pendingReview:catalog.proposals(mode.id).filter(p=>p.status==='proposed'&&(!projectId||p.projectId===projectId)).length,approvedRules:mode.derivedRules.filter(p=>!projectId||p.projectId===projectId).map(({evidenceIds,...r})=>({...r,evidenceCount:evidenceIds.length})),processingMeaning:'Processed events include assistant/tool activity. Counts do not establish model understanding or preference accuracy.',rawHistoryShared:false,scope:'Explicitly assigned sources only; task assignment labels are chosen by the user, not inferred from a whole mixed history.'};
 const rules=report.approvedRules;report.approvedRules=[];for(const g of progress){report.groups.push(g);if(Buffer.byteLength(JSON.stringify(report))>6000){report.groups.pop();report.omittedGroups++;}}for(const r of rules){report.approvedRules.push(r);if(Buffer.byteLength(JSON.stringify(report))>11000){report.approvedRules.pop();report.omittedApprovedRules++;}}return report;
}

export async function analyzeMode(store,ref,{engine='explicit',model,endpoint,timeoutMs,limit=40,maxBatches=1000,task:requestedTask=null,providerConfig,allowRemoteAnalysis=false}={}){
 if(!['explicit','ollama','compatible'].includes(engine))throw new Error('Unknown analysis engine');if(!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>10000)throw new Error('Invalid analysis batch budget');
 const catalog=new WorkModes(store),mode=catalog.find(ref);if(!mode||mode.archived)throw new Error('Unknown mode');if(requestedTask&&!mode.tasks.includes(requestedTask))throw new Error('Task is outside this mode');
 if(engine==='compatible'){const {validateProvider}=await import('./compatible-model.mjs');const p=validateProvider(providerConfig,{allowRemoteAnalysis});model=p.model;endpoint=p.url.href;}
 store.purgeExpiredContent();const frozenScope=catalog.scopeHash(mode);let batches=0,processedEvents=0,contextWindows=0,cacheHits=0,proposed=0;
 const {groups}=modeGroups(store,mode);for(const group of groups){if(requestedTask&&group.task!==requestedTask)continue;
  const options={engine,model,endpoint,projectId:group.projectId,limit},sig=signature(catalog,mode,group,options);let cursor=Number(store.db.prepare('SELECT cursor FROM mode_progress WHERE mode_id=? AND signature=?').get(mode.id,sig)?.cursor??0);
  while(batches<maxBatches){
   const rows=store.db.prepare('SELECT rowid,body,content,content_expires_at FROM events WHERE rowid>? AND source_id IN (SELECT value FROM json_each(?)) AND project_id=? ORDER BY rowid LIMIT ?').all(cursor,JSON.stringify(group.sources),group.projectId,limit);if(!rows.length)break;
   const events=rows.map(r=>({...modeJson(r.body),content:r.content&&r.content_expires_at>new Date().toISOString()?r.content:null,sequence:r.rowid}));
   const available=events.map(e=>({...e,content:e.role==='user'?preferenceText(e.content??''):e.content})).filter(e=>e.content);
   const prefix=digest(JSON.stringify([mode.id,frozenScope,sig]));const batchKey='batch:'+digest(JSON.stringify([prefix,available.map(e=>[e.id,e.fingerprint])]));
   const read=key=>{const row=store.db.prepare('SELECT body FROM mode_analysis_cache WHERE mode_id=? AND cache_key=?').get(mode.id,prefix+key);return row?modeJson(row.body):null;};
   const save=(key,value)=>{store.db.prepare('INSERT OR REPLACE INTO mode_analysis_cache VALUES(?,?,?)').run(mode.id,prefix+key,JSON.stringify(value));store.db.prepare('DELETE FROM mode_analysis_cache WHERE mode_id=? AND cache_key IN (SELECT cache_key FROM mode_analysis_cache WHERE mode_id=? ORDER BY rowid DESC LIMIT -1 OFFSET 512)').run(mode.id,mode.id);};
   const write=(key,value)=>store.transaction(()=>{const current=catalog.find(mode.id);if(!current||current.revision!==mode.revision||catalog.scopeHash(current)!==frozenScope)throw new Error('Mode changed or was removed during analysis');save(key,value);});
   const cache={readWindowCache:read,writeWindowCache:write};let result=read(batchKey);if(result)cacheHits++;else result=engine==='explicit'?{observations:explicitObservations(available),contextWindows:0,cacheHits:0}:engine==='ollama'?await modelObservations(available,{model,endpoint,timeoutMs,analysisContext:{modeId:mode.id,projectId:group.projectId,task:group.task},...cache}):await (await import('./compatible-model.mjs')).compatibleObservations(available,providerConfig,{allowRemoteAnalysis,analysisContext:{modeId:mode.id,projectId:group.projectId,task:group.task},...cache});
   store.transaction(()=>{
    const current=catalog.find(mode.id);if(!current||catalog.scopeHash(current)!==frozenScope||current.revision!==mode.revision)throw new Error('Mode changed while analysis was running; retry with the reviewed scope');
    for(const observation of result.observations){if(preferenceIssue(observation.rule)||(group.task&&observation.task&&observation.task!==group.task))continue;const task=group.task??observation.task??null;if(task&&!mode.tasks.includes(task))continue;catalog.propose(mode.id,{...observation,task});proposed++;}
    save(batchKey,result);cursor=events.at(-1).sequence;const progress={engine,model:model??null,cursor,scopeHash:frozenScope,groupKey:JSON.stringify(group),updatedAt:new Date().toISOString(),method:engine==='explicit'?'Literal explicit-request extraction; not semantic analysis':'Model proposals requiring review'};store.db.prepare('INSERT OR REPLACE INTO mode_progress VALUES(?,?,?,?)').run(mode.id,sig,cursor,JSON.stringify(progress));
   });
   batches++;processedEvents+=events.length;contextWindows+=result.contextWindows??0;cacheHits+=result.cacheHits??0;
  }
 }
 return {modeId:mode.id,batches,processedEvents,contextWindows,cacheHits,proposed,requiresReview:true,analysis:modeAnalysis(store,mode)};
}
