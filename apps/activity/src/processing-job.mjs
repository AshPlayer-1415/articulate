import {digest,identifier,redact,safeRule,TASKS} from '../../../packages/storage-local/src/activity-schema.js';
import {evidenceSupport} from '../../../packages/storage-local/src/evidence-support.js';
import {explicitObservations} from './analysis.mjs';
import {preferenceText} from './rules.mjs';
import {preferenceSafetyIssue} from '@articulate/core';

export const JOB_MAX_BYTES=8*1024*1024;
export const JOB_METHOD='deterministic explicit-request extraction; not semantic or ML analysis';
export const JOB_LIMITATIONS=['The trusted caller must verify export provenance and alias ownership.','Redaction and injection screens are incomplete defenses.','Repeated task requests do not establish durable preferences or learning rates.','No sharing grants, model execution or enterprise source retrieval occur in this worker.'];
function object(value,keys,label) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw new Error('Invalid '+label+' fields');
}
/** Policy comes from a separate operator-selected file, never an export record.
 * Aliases are explicit exact matches. No basename/fuzzy/repository-name joins.
 */
export function validateJobPolicy(policy) {
  object(policy,['schemaVersion','tenantId','projects'],'job policy');
  if(policy.schemaVersion!==1)throw new Error('Unsupported job policy version');
  identifier(policy.tenantId,'tenant');
  if(!Array.isArray(policy.projects)||!policy.projects.length||policy.projects.length>100)throw new Error('Choose 1–100 permitted projects');
  const ids=new Set(),aliases=new Map();
  for(const p of policy.projects) {
    object(p,['id','aliases'],'project policy');identifier(p.id,'project');
    if(ids.has(p.id))throw new Error('Duplicate project policy');ids.add(p.id);
    if(p.aliases!==undefined&&(!Array.isArray(p.aliases)||p.aliases.length>50))throw new Error('Invalid project aliases');
    for(const alias of p.aliases??[]) {
      if(typeof alias!=='string'||!alias.trim()||alias.length>2048||/[\u0000-\u001f]/.test(alias)||aliases.has(alias))throw new Error('Invalid or ambiguous project alias');
      aliases.set(alias,p.id);
    }
  }
  return {ids,aliases};
}

/** Deterministic preprocessing only. No model, subprocess, network or profile
 * writes. Export provenance remains the responsibility of the authorized caller.
 */
export function processJob(policy,input) {
  const {ids,aliases}=validateJobPolicy(policy);
  object(input,['schemaVersion','tenantId','events'],'export');
  if(input.schemaVersion!==1||input.tenantId!==policy.tenantId)throw new Error('Export tenant or version does not match the trusted job policy');
  if(!Array.isArray(input.events)||input.events.length>2000||Buffer.byteLength(JSON.stringify(input))>JOB_MAX_BYTES)throw new Error('Export exceeds the bounded job limit');
  const events=[],seen=new Map();let duplicates=0,nonUser=0,empty=0,instructionLike=0;
  for(const raw of input.events) {
    object(raw,['id','agent','sessionId','projectId','workspace','role','kind','timestamp','content'],'export event');
    identifier(raw.id,'event');identifier(raw.agent,'agent');identifier(raw.sessionId,'session');
    if(!['user','assistant','tool','system'].includes(raw.role))throw new Error('Invalid event role');
    if(typeof raw.content!=='string'||raw.content.length>65536)throw new Error('Invalid bounded event content');
    if(raw.timestamp!==undefined&&raw.timestamp!==null&&(!Number.isFinite(Date.parse(raw.timestamp))||typeof raw.timestamp!=='string'))throw new Error('Invalid event timestamp');
    if(raw.kind!==undefined&&!['message','correction','metadata','tool_call','tool_result'].includes(raw.kind))throw new Error('Invalid event kind');
    let projectId=raw.projectId;
    if(raw.workspace!==undefined) {
      if(typeof raw.workspace!=='string'||!aliases.has(raw.workspace))throw new Error('Workspace has no trusted project mapping');
      const mapped=aliases.get(raw.workspace);
      if(projectId!==undefined&&projectId!==mapped)throw new Error('Conflicting project attribution');projectId=mapped;
    }
    if(!ids.has(projectId))throw new Error('Event project is outside the trusted job scope');
    const id='job-'+digest(JSON.stringify([policy.tenantId,raw.agent,raw.sessionId,raw.id])).slice(0,32);
    const identity=digest(JSON.stringify(raw));
    if(seen.has(id)){if(seen.get(id)!==identity)throw new Error('Conflicting event identity');duplicates++;continue;}seen.set(id,identity);
    if(raw.role!=='user'||(raw.kind&&!['message','correction'].includes(raw.kind))){nonUser++;continue;}
    const content=preferenceText(redact(raw.content));
    if(!content){empty++;continue;}
    if(preferenceSafetyIssue(content)){instructionLike++;continue;}
    events.push({id,projectId,agent:raw.agent,sourceId:raw.agent,sessionId:raw.sessionId,role:'user',kind:raw.kind??'message',timestamp:raw.timestamp??null,content});
  }
  const groups=new Map();
  for(const event of events)for(const proposal of explicitObservations([event])) {
    const key=JSON.stringify([proposal.scope.projectId,proposal.task,proposal.rule.toLowerCase()]);
    const group=groups.get(key)??{...proposal,evidenceIds:[],evidence:[]};group.evidenceIds.push(event.id);group.evidence.push(event);groups.set(key,group);
  }
  const proposals=[...groups.values()].slice(0,200).map(({evidence,...p})=>({...p,evidenceIds:p.evidenceIds.slice(0,80),evidenceCapped:p.evidenceIds.length>80,support:evidenceSupport(evidence.slice(0,80)),status:'proposed',approved:false}));
  return {schemaVersion:1,tenantId:policy.tenantId,method:JOB_METHOD,
    coverage:{inputEvents:input.events.length,eligibleUserEvents:events.length,duplicateEvents:duplicates,nonUserOrControlEvents:nonUser,emptyOrExcluded:empty,instructionLikeRecordsExcluded:instructionLike,proposalsTruncated:groups.size>200},
    proposals,activeMemoryChanged:false,requiresUserReview:true,
    limitations:JOB_LIMITATIONS};
}

/** Treat results as untrusted even when returned by a selected local image. */
export function validateJobResult(result,policy,input) {
  const {ids}=validateJobPolicy(policy);
  object(result,['schemaVersion','tenantId','method','coverage','proposals','activeMemoryChanged','requiresUserReview','limitations'],'worker result');
  if(result.schemaVersion!==1||result.tenantId!==policy.tenantId||result.method!==JOB_METHOD||result.activeMemoryChanged!==false||result.requiresUserReview!==true||JSON.stringify(result.limitations)!==JSON.stringify(JOB_LIMITATIONS))throw new Error('Worker output failed its contract');
  object(result.coverage,['inputEvents','eligibleUserEvents','duplicateEvents','nonUserOrControlEvents','emptyOrExcluded','instructionLikeRecordsExcluded','proposalsTruncated'],'worker coverage');
  for(const k of ['inputEvents','eligibleUserEvents','duplicateEvents','nonUserOrControlEvents','emptyOrExcluded','instructionLikeRecordsExcluded'])if(!Number.isInteger(result.coverage[k])||result.coverage[k]<0||result.coverage[k]>input.events.length)throw new Error('Invalid worker coverage');
  if(result.coverage.inputEvents!==input.events.length||typeof result.coverage.proposalsTruncated!=='boolean'||!Array.isArray(result.proposals)||result.proposals.length>200)throw new Error('Invalid worker result');
  const known=new Map(input.events.map(e=>['job-'+digest(JSON.stringify([policy.tenantId,e.agent,e.sessionId,e.id])).slice(0,32),e]));
  for(const p of result.proposals) {
    object(p,['rule','evidenceIds','task','scope','origin','evidenceCapped','support','status','approved'],'worker proposal');
    safeRule(p.rule);object(p.scope,['kind','projectId'],'worker scope');
    if(p.scope.kind!=='project'||!ids.has(p.scope.projectId)||p.approved!==false||p.status!=='proposed'||p.origin!=='explicit-request'||(p.task!==null&&!TASKS.includes(p.task))||typeof p.evidenceCapped!=='boolean')throw new Error('Worker proposal expanded its scope');
    if(!Array.isArray(p.evidenceIds)||!p.evidenceIds.length||p.evidenceIds.length>80||new Set(p.evidenceIds).size!==p.evidenceIds.length)throw new Error('Invalid worker evidence');
    const evidence=p.evidenceIds.map(id=>known.get(id));
    if(evidence.some(e=>!e||e.role!=='user'||((e.projectId??policy.projects.find(project=>project.aliases?.includes(e.workspace))?.id)!==p.scope.projectId)))throw new Error('Worker cited foreign evidence');
    // Recompute descriptive support from the actual cited, cleaned source rows.
    // If evidence was capped, do not repeat a larger unsupported support count.
    p.support=evidenceSupport(evidence.map(e=>({...e,content:preferenceText(redact(e.content))})));
  }
  return result;
}
