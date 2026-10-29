import {importSource} from './adapters.mjs';
import {analyzeActivity,analysisProgress} from './analysis.mjs';

export const HOST_LABELS={codex:'Codex','claude-code':'Claude Code',claude:'Claude Desktop',cursor:'Cursor'};
export async function processActivity(store,{projectIds,engine='explicit',model,endpoint,maxImportBatches=1000,maxAnalysisBatches=10000,progress=()=>{}}={}) {
  const startedAt=new Date().toISOString();let importedEvents=0,importBatches=0,analysisBatches=0,processedEvents=0;
  const wanted=new Set(projectIds??store.sources().map(s=>s.projectId));
  const sources=store.sources().filter(s=>wanted.has(s.projectId)&&!s.paused);
  const cursor=store.setting('import-next-source');const start=sources.findIndex(s=>s.id===cursor);
  const queue=start>0?[...sources.slice(start),...sources.slice(0,start)]:[...sources];const touched=new Set();
  progress({phase:'import',sources:sources.length});
  while(queue.length&&importBatches<maxImportBatches) {
    const source=queue.shift(),key='source-status:'+source.id,previous=JSON.parse(store.setting(key)??'{}');
    try {
      const batch=await importSource(store,source.id,{limit:1000});
      const worked=batch.processedRecords>0||batch.insertedEvents>0;
      const reset=worked&&!touched.has(source.id);if(worked)touched.add(source.id);
      const warnings=[...new Set([...(reset?[]:previous.warnings??[]),...batch.warnings])];
      const classification=batch.classification??'activity';
      store.transaction(()=>store.set(key,JSON.stringify({state:batch.hasMore?'pending':classification!=='activity'?'excluded':warnings.length?'gaps':'complete',classification,warnings,updatedAt:new Date().toISOString(),kind:source.kind})));
      importedEvents+=batch.insertedEvents;
      // An already complete source is a cheap check, not a unit of import work.
      if(worked||batch.hasMore)importBatches++;
      if(batch.hasMore)queue.push(source);
      if(worked&&(importBatches%10===0||!batch.hasMore))progress({phase:'import',kind:source.kind,batches:importBatches,importedEvents,remainingSourceChecks:queue.length});
    }catch(error){store.transaction(()=>store.set(key,JSON.stringify({state:'error',warnings:[error.message],kind:source.kind,updatedAt:new Date().toISOString()})));}
    store.transaction(()=>store.set('import-next-source',queue[0]?.id??''));
  }
  const options=id=>({engine,model,endpoint,projectId:id,limit:40});
  const analyses=[...wanted].filter(id=>analysisProgress(store,options(id)).remaining>0);
  progress({phase:'analysis',engine,projects:analyses.length});
  let analysisError=null;
  while(analyses.length&&analysisBatches<maxAnalysisBatches) {
    const id=analyses.shift();
    try {
      const batch=await analyzeActivity(store,options(id));analysisBatches++;processedEvents+=batch.processedEvents;
      if(batch.hasMore)analyses.push(id);
      const key='analysis-context:'+id;store.transaction(()=>store.set(key,String(Number(store.setting(key)??0)+(batch.truncatedContextEvents??0))));
      if(analysisBatches%10===0||!batch.hasMore)progress({phase:'analysis',engine,projectId:id,batches:analysisBatches,processedEvents,remainingProjects:analyses.length});
    }catch(error){analysisError=error.message;analyses.unshift(id);break;}
  }
  const previous=JSON.parse(store.setting('activity-progress')??'{}'),projects={...previous.projects};
  for(const id of wanted){const status=analysisProgress(store,options(id));const pendingSourceChecks=queue.filter(s=>s.projectId===id).length;projects[id]={...status,engine,model:model??null,endpoint:endpoint??null,limit:40,pendingSourceChecks,lastCompletedAt:status.remaining===0&&!pendingSourceChecks?new Date().toISOString():previous.projects?.[id]?.lastCompletedAt??null,updatedAt:new Date().toISOString()};}
  const statuses=sources.map(source=>({source,...JSON.parse(store.setting('source-status:'+source.id)??'{"state":"pending"}')}));
  const errors=statuses.filter(s=>s.state==='error').length,gaps=statuses.filter(s=>s.state==='gaps').length;
  const excluded=statuses.filter(s=>s.state==='excluded').length;
  const remainingEvents=[...wanted].reduce((sum,id)=>sum+projects[id].remaining,0);
  const complete=queue.length===0&&remainingEvents===0&&!analysisError;
  const scopeId=wanted.size===1?[...wanted][0]:'all-projects';const previousScope=previous.scopes?.[scopeId]??{};
  const scope={startedAt,finishedAt:new Date().toISOString(),lastCompletedAt:complete?new Date().toISOString():previousScope.lastCompletedAt??null,engine,model:model??null,projectIds:[...wanted],importedEvents,processedEvents,remainingEvents,pendingSourceChecks:queue.length,failedSources:errors,sourcesWithGaps:gaps,excludedSources:excluded,processingComplete:complete,analysisError};
  store.transaction(()=>store.set('activity-progress',JSON.stringify({schemaVersion:1,projects,scopes:{...previous.scopes,[scopeId]:scope},latestScope:projectIds===undefined&&previous.latestScope?previous.latestScope:scopeId})));
  return {...scope,scopeId,importBatches,analysisBatches};
}
