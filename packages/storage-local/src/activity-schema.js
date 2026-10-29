import {createHash} from 'node:crypto';
import {preferenceSafetyIssue} from '@articulate/core';

export const ACTIVITY_VERSION = 1;
export const SOURCE_KINDS = ['codex','claude-code','cursor'];
export const TASKS = ['concept','debugging','mathematics','research','shipping'];
export const MAX_CONTENT = 65536;
export function digest(value) { return createHash('sha256').update(value).digest('hex'); }
export function identifier(value,label='identifier') {
  if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))throw new Error('Invalid '+label);
  return value;
}
export function bounded(value,max,label,{empty=false}={}) {
  if(typeof value!=='string'||(!empty&&!value.trim())||value.length>max||value.includes('\0'))throw new Error('Invalid '+label);
  return value;
}
export function redact(value) {
  return String(value)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,'[REDACTED PRIVATE KEY]')
    .replace(/\b(?:sk-(?:ant-)?[\w-]{8,}|gh[pousr]_[\w]{8,}|github_pat_[\w_]{8,}|xox[baprs]-[\w-]+|AKIA[A-Z0-9]{16}|AIza[\w-]{20,})\b/g,'[REDACTED CREDENTIAL]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer [REDACTED]')
    .replace(/(["'](?:api[_-]?key|access[_-]?token|client[_-]?secret|password|private[_-]?key)["']\s*:\s*)(["'])(.*?)\2/gi,'$1$2[REDACTED]$2')
    .replace(/\b((?:[A-Z_]*(?:API_KEY|ACCESS_TOKEN|SECRET|PASSWORD|PRIVATE_KEY)[A-Z_]*|apiKey|accessToken|clientSecret)\s*[=:]\s*)["']?[^\s,"'};]+["']?/g,'$1[REDACTED]')
    .replace(/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s/@]+:[^\s/@]+@/gi,'$1://[REDACTED]@');
}
export function safeRule(value) {
  const rule=bounded(value,500,'observation rule').replace(/\s+/g,' ').trim();
  if(rule.length<8||redact(rule)!==rule)throw new Error('Observation must be a short rule without credentials');
  if(preferenceSafetyIssue(rule))throw new Error('Unsafe preference content; save working preferences only');
  if(/\b(?:IQ|intelligence quotient|ethnicity|religion|diagnos(?:is|e)|ADHD|autis(?:m|tic)|disabilit\w*|cognitive ability)\b/i.test(rule))throw new Error('Observation must describe a working preference, not a sensitive trait');
  return rule;
}
export function scope(input={}) {
  const kind=input.kind??'project';
  if(!['user','project','session'].includes(kind))throw new Error('Invalid memory scope');
  const projectId=input.projectId==null?null:identifier(input.projectId,'project');
  const sessionId=input.sessionId==null?null:bounded(input.sessionId,256,'session');
  if(kind!=='user'&&!projectId)throw new Error('Project scope requires a project');
  if(kind==='session'&&!sessionId)throw new Error('Session scope requires a session');
  const expiresAt=input.expiresAt??null;
  if(expiresAt!==null&&!Number.isFinite(Date.parse(expiresAt)))throw new Error('Invalid scope expiry');
  if(kind==='session'&&!expiresAt)throw new Error('Session memory requires an expiry');
  return {kind,projectId:kind==='user'?null:projectId,sessionId:kind==='session'?sessionId:null,expiresAt};
}
export function event(input) {
  const text=redact(input.content??'');
  const timestamp=input.timestamp??null;
  if(timestamp!==null&&!Number.isFinite(Date.parse(timestamp)))throw new Error('Invalid event timestamp');
  const role=input.role??'system';
  if(!['user','assistant','tool','system'].includes(role))throw new Error('Invalid event role');
  const kind=input.kind??'message';
  if(!['message','tool_call','tool_result','metadata','approval','correction'].includes(kind))throw new Error('Invalid event kind');
  let metadata={};
  const serialized=redact(JSON.stringify(input.metadata??{}));
  if(serialized.length<=8192){try{metadata=JSON.parse(serialized);}catch{metadata={redacted:true};}}else metadata={truncated:true};
  return {sessionId:bounded(input.sessionId,256,'session'),nativeId:bounded(input.nativeId,256,'event id'),projectId:identifier(input.projectId,'project'),timestamp,role,kind,metadata,
    content:text.slice(0,MAX_CONTENT),truncated:text.length>MAX_CONTENT,
    fingerprint:digest(JSON.stringify([kind,role,text.replace(/\s+/g,' ').trim()]))};
}
