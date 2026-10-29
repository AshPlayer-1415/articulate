import {createReadStream,constants,realpathSync} from 'node:fs';
import {lstat,readdir,realpath,open} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {projectIdentity} from './project-discovery.mjs';
import {event,digest} from '../../../packages/storage-local/src/activity-schema.js';

export const SUPPORTED_FORMATS={
  codex:'Native session JSONL: session_meta, response_item and event_msg records.',
  'claude-code':'Native JSONL: user/assistant messages with text and tool_use/tool_result blocks.',
  cursor:'Role-labelled text/Markdown exports and JSONL message exports. Internal SQLite databases are not imported.'
};
const MAX_FILE_BYTES=512*1024*1024;
const MAX_LINE_BYTES=1024*1024;
async function* boundedLines(file,{skipOversized=false}={}) {
  const stream=createReadStream(file,{highWaterMark:65536,flags:constants.O_RDONLY|(constants.O_NOFOLLOW??0)});
  let pending=Buffer.alloc(0),total=0,oversized=false;
  try {
    for await(const chunk of stream) {
      total+=chunk.length;if(total>MAX_FILE_BYTES)throw new Error('Source grew beyond its byte limit during import');
      const buffer=pending.length?Buffer.concat([pending,chunk]):chunk;let start=0,index;
      while((index=buffer.indexOf(10,start))!==-1) {
        if(oversized||index-start>MAX_LINE_BYTES){if(!skipOversized)throw new Error('Source contains an oversized line');yield {oversized:true};oversized=false;}else {const end=index>start&&buffer[index-1]===13?index-1:index;yield buffer.subarray(start,end).toString('utf8');}start=index+1;
      }
      pending=Buffer.from(buffer.subarray(start));
      if(pending.length>MAX_LINE_BYTES){if(!skipOversized)throw new Error('Source contains an oversized line');oversized=true;pending=Buffer.alloc(0);}
    }
    if(oversized)yield {oversized:true};
    else if(pending.length)yield pending.toString('utf8').replace(/\r$/,'');
  }finally{stream.destroy();}
}
function text(content) {
  if(typeof content==='string')return content;
  if(Array.isArray(content))return content.map(c=>typeof c==='string'?c:c.text??'').filter(Boolean).join('\n');
  return '';
}
function timestamp(value){return typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;}
function normalize(record,context,line) {
  let message=record.message??record;
  let role=message.role??record.role;
  let content=typeof record.message==='string'?record.message:message.content??record.content??record.text;
  const at=timestamp(record.timestamp??record.createdAt);
  const nativeId=String(record.uuid??record.id??record.eventId??'line-'+line);
  const meta={line,adapter:context.kind,model:message.model??record.model??null};
  if(record.sessionId)context.sessionId=String(record.sessionId);
  if(record.cwd)context.cwd=String(record.cwd);
  if(context.kind==='cursor'&&Array.isArray(record.workspace_roots)&&record.workspace_roots.length===1)context.cwd=record.workspace_roots[0];
  if(context.kind==='codex') {
    if(record.type==='session_meta') {
      const p=record.payload??{};context.sessionId=String(p.id??context.sessionId);context.cwd=p.cwd??null;context.startedAt=timestamp(p.timestamp??record.timestamp);return [];
    }
    const p=record.payload??record;
    if(record.type==='turn_context'){context.cwd=p.cwd??context.cwd;return [];}
    if(record.type==='response_item') {
      if(p.type==='message'){role=p.role;content=p.content;}
      else if(['function_call','custom_tool_call'].includes(p.type))return [{role:'assistant',kind:'tool_call',content:JSON.stringify({name:p.name,arguments:p.arguments??p.input}),nativeId:p.call_id??nativeId,timestamp:at,metadata:meta}];
      else if(['function_call_output','custom_tool_call_output'].includes(p.type))return [{role:'tool',kind:'tool_result',content:text(p.output)||JSON.stringify(p.output??''),nativeId:(p.call_id??nativeId)+'-result',timestamp:at,metadata:meta}];
      else return [];
    } else if(record.type==='event_msg') {
      if(context.preferResponseItems)return [];
      if(p.type==='user_message'){role='user';content=p.message;}
      else if(p.type==='agent_message'){role='assistant';content=p.message;}
      else return [];
    } else if(!role)return [];
  }
  if(!['user','assistant','system','tool'].includes(role)) {
    if(['user','assistant','system'].includes(record.type))role=record.type;else return [];
  }
  const output=[];
  if(Array.isArray(content)) {
    for(let index=0;index<content.length;index++) {
      const block=content[index];
      if(block?.type==='tool_use')output.push({role:'assistant',kind:'tool_call',content:JSON.stringify({name:block.name,input:block.input}),nativeId:block.id??nativeId+'-tool-'+index,timestamp:at,metadata:meta});
      if(block?.type==='tool_result')output.push({role:'tool',kind:'tool_result',content:text(block.content)||JSON.stringify(block.content??''),nativeId:(block.tool_use_id??nativeId+'-'+index)+'-result',timestamp:at,metadata:{...meta,isError:block.is_error===true}});
    }
  }
  const body=text(content);
  if(body)output.unshift({role,kind:'message',content:body,nativeId,timestamp:at,metadata:meta});
  return output;
}
async function filesWithin(root,kind,depth=0,output=[]) {
  if(depth>6)throw new Error('Source nesting exceeds the supported depth; select a narrower folder');
  const stat=await lstat(root);
  if(stat.isSymbolicLink())throw new Error('Select a regular source file or directory, not a symlink');
  if(stat.isFile()) {
    if((kind==='cursor'?/\.(?:jsonl|txt|md)$/i:/\.jsonl$/i).test(root))output.push(root);
    return output;
  }
  if(!stat.isDirectory())throw new Error('Unsupported activity source path');
  for(const entry of (await readdir(root,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    if(entry.isSymbolicLink()||['.git','node_modules','vendor'].includes(entry.name))continue;
    await filesWithin(path.join(root,entry.name),kind,depth+1,output);
    if(output.length>2000)throw new Error('Too many source files; select a narrower folder');
  }
  return output;
}
export async function validateSourcePath(input) {
  if(typeof input!=='string'||!path.isAbsolute(input))throw new Error('Select an absolute local source path');
  const stat=await lstat(input);
  if(stat.isSymbolicLink()||(!stat.isFile()&&!stat.isDirectory()))throw new Error('Select a regular file or directory');
  return {path:await realpath(input),directory:stat.isDirectory()};
}
export async function discoverSources() {
  const roots=[['codex',path.join(os.homedir(),'.codex','sessions')],['claude-code',path.join(os.homedir(),'.claude','projects')],['cursor',path.join(os.homedir(),'.cursor','projects')]];
  return Promise.all(roots.map(async([kind,location])=>{let available=false;try{available=(await lstat(location)).isDirectory();}catch(error){if(error.code!=='ENOENT')throw error;}return {kind,path:location,available,format:SUPPORTED_FORMATS[kind],contentRead:false};}));
}
async function prefix(file) {
  const handle=await open(file,'r');
  try {const buffer=Buffer.alloc(65536);const {bytesRead}=await handle.read(buffer,0,buffer.length,0);return buffer.subarray(0,bytesRead).toString('utf8');}finally{await handle.close();}
}
async function projectMatches(context,source) {
  if(source.repositoryId){
    if(!context.cwd)return false;
    context.projectIdentities??=new Map();
    if(!context.projectIdentities.has(context.cwd))context.projectIdentities.set(context.cwd,projectIdentity(path.resolve(context.cwd),{allowMissing:true}));
    return (await context.projectIdentities.get(context.cwd)).id===source.repositoryId;
  }
  const roots=source.projectPaths??(source.projectPath?[source.projectPath]:null);
  if(!roots)return true;
  if(!context.cwd)return false;
  let cwd=path.resolve(context.cwd);try{cwd=realpathSync.native(cwd);}catch{}
  return roots.some(root=>{const relative=path.relative(root,cwd);return !relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));});
}
async function cursorText(file,source,stat) {
  if(stat.size>16*1024*1024)throw new Error('Cursor text export exceeds 16 MiB; use smaller exports or JSONL');
  const result=[];let current=null;let line=0;let recognized=0;
  const lines=boundedLines(file);
  const flush=()=>{if(current?.parts.length)result.push(event({sessionId:'export-'+digest(file).slice(0,24),nativeId:'line-'+current.line,projectId:source.projectId,role:current.role,kind:'message',timestamp:null,content:current.parts.join('\n'),metadata:{format:'cursor-text',line:current.line}}));};
  try {
    for await(const value of lines) {
      line++;if(Buffer.byteLength(value)>MAX_LINE_BYTES)throw new Error('Source contains an oversized line');
      const marker=value.trim().match(/^(?:#{1,4}\s+|\*\*)?(user|assistant)(?:\*\*|:)?\s*$/i)??value.trim().match(/^\[(user|assistant)\]$/i);
      if(marker){flush();current={role:marker[1].toLowerCase(),line,parts:[]};recognized++;}
      else if(current&&!/^\[\/(?:user|assistant)\]$/i.test(value.trim()))current.parts.push(value);
    }
    flush();if(!recognized)throw new Error('Unsupported Cursor export: expected explicit User/Assistant role headings');
    return result;
  }finally{await lines.return();}
}

/** Bounded batches commit their cursor together with events. No source file is modified. */
export async function importSource(store,sourceId,{limit=1000}={}) {
  if(!Number.isInteger(limit)||limit<1||limit>10000)throw new Error('Import limit must be 1–10000 records');
  const source=store.source(sourceId);if(!source||source.paused)throw new Error('Source is missing or paused');
  const selected=await validateSourcePath(source.path);
  if(selected.path!==source.path)throw new Error('Source path changed; select and approve it again');
  if(selected.directory&&source.kind!=='cursor'&&!source.projectPath)throw new Error('Native history directories require an approved project path');
  const files=await filesWithin(source.path,source.kind);
  if(!files.length)throw new Error('No supported activity files in the selected source');
  let processed=0,inserted=0,skipped=0,hasMore=false,truncated=0,oversizedRecords=0;
  const warnings=new Set(),classifications=new Set();
  for(const file of files) {
    if(processed>=limit){hasMore=true;break;}
    const stat=await lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Source changed during import');
    if(stat.size>MAX_FILE_BYTES)throw new Error('Source file exceeds 512 MiB; choose a smaller export');
    const fileKey=digest(file);const signature=JSON.stringify([stat.size,stat.mtimeMs,stat.ino]);
    const checkpoint=store.checkpoint(sourceId,fileKey);
    const components=file.split(path.sep);
    if(source.kind==='cursor'&&components.includes('agent-transcripts')&&components.includes('compaction')&&/\.md$/i.test(file)) {
      classifications.add('auxiliary');warnings.add('Cursor compaction Markdown is auxiliary material, not a verbatim conversation; it was excluded from preference evidence');
      if(checkpoint?.signature!==signature||checkpoint.classification!=='auxiliary')store.importBatch(sourceId,[],{fileKey,checkpoint:{signature,line:0,complete:true,classification:'auxiliary'}});
      continue;
    }
    if(checkpoint?.signature===signature&&checkpoint.complete){classifications.add(checkpoint.classification??'activity');if(checkpoint.classification==='metadata-only')warnings.add('Cursor control-only transcript contains no conversation messages');continue;}
    const preview=await prefix(file);
    if(source.kind==='cursor'&&!file.toLowerCase().endsWith('.jsonl')&&!preview.trimStart().startsWith('{')) {
      if(source.since)throw new Error('Cursor text exports have no reliable timestamps; use JSONL for a date filter');
      const events=await cursorText(file,source,stat);
      const start=checkpoint?.signature===signature?checkpoint.index??0:0;
      const batch=events.slice(start,start+(limit-processed));
      processed+=batch.length;truncated+=batch.filter(e=>e.truncated).length;
      const complete=start+batch.length>=events.length;
      inserted+=store.importBatch(sourceId,batch,{fileKey,checkpoint:{signature,index:start+batch.length,complete}});
      classifications.add('activity');
      if(!complete)hasMore=true;
      continue;
    }
    const context={kind:source.kind,sessionId:'file-'+fileKey.slice(0,24),cwd:null,preferResponseItems:/"type"\s*:\s*"response_item"/.test(preview)};
    const start=checkpoint?.signature===signature?checkpoint.line??0:0;
    const batch=[];let line=0,lastLine=start,complete=true,recognized=0,activityRecords=0,controlRecords=0,unknownRecords=0;
    const lines=boundedLines(file,{skipOversized:true});
    try {
      for await(const value of lines) {
        line++;
        if(value?.oversized){context.cwd=null;context.afterOversized=true;if(line>start){processed++;skipped++;oversizedRecords++;lastLine=line;if(processed>=limit){complete=false;hasMore=true;break;}}continue;}
        if(Buffer.byteLength(value)>MAX_LINE_BYTES)throw new Error('Source contains an oversized line');
        if(!value.trim())continue;
        let record;try{record=JSON.parse(value);}catch{throw new Error('Invalid activity JSONL at line '+line+'; retry after the source finishes writing');}
        if(!record||typeof record!=='object'||Array.isArray(record))throw new Error('Activity JSONL requires object records');
        const normalized=normalize(record,context,line);
        const control=source.kind==='cursor'&&record.type==='turn_ended'&&!normalized.length;
        if(control)controlRecords++;
        if(normalized.length)activityRecords++;
        if(source.kind==='cursor'&&!control&&!normalized.length&&!['session_meta','turn_context'].includes(record.type))unknownRecords++;
        if(normalized.length||control||['session_meta','turn_context'].includes(record.type))recognized++;
        // Replay metadata before a saved cursor so project/session identity is never guessed.
        if(line<=start)continue;
        if((source.projectPath||source.projectPaths)&&context.cwd&&!await projectMatches(context,source)){skipped++;lastLine=line;continue;}
        if(normalized.length&&(source.projectPath||source.projectPaths)&&!context.cwd){if(context.afterOversized){skipped++;lastLine=line;continue;}throw new Error('Native source has no project metadata; select a specific export without a project-path filter');}
        if(normalized.length&&!await projectMatches(context,source)){skipped++;lastLine=line;continue;}
        for(let index=0;index<normalized.length;index++) {
          const item=normalized[index];
          if(source.since&&(!item.timestamp||Date.parse(item.timestamp)<Date.parse(source.since))){skipped++;if(!item.timestamp)warnings.add('Records without timestamps were excluded by the date filter');continue;}
          const normalizedEvent=event({...item,nativeId:item.nativeId+'-'+index,sessionId:context.sessionId,projectId:source.projectId});
          if(normalizedEvent.truncated)truncated++;
          batch.push(normalizedEvent);
        }
        processed++;lastLine=line;
        if(processed>=limit){complete=false;hasMore=true;break;}
      }
      if(!recognized&&line>0&&!oversizedRecords)throw new Error('Unsupported source schema; no recognized activity records');
      const classification=controlRecords&&!activityRecords&&!unknownRecords?'metadata-only':'activity';classifications.add(classification);
      if(unknownRecords)warnings.add('Some Cursor records have an unsupported schema and were not used as conversation evidence');
      if(classification==='metadata-only')warnings.add('Cursor control-only transcript contains no conversation messages');
      inserted+=store.importBatch(sourceId,batch,{fileKey,checkpoint:{signature,line:lastLine,complete,classification}});
    }finally{await lines.return();}
  }
  if(oversizedRecords)warnings.add(oversizedRecords+' oversized JSONL records skipped; following unattributed records are excluded until workspace metadata recovers');
  if(truncated)warnings.add('Some event content exceeded 64 KiB and was marked truncated');
  store.purgeExpiredContent();
  const classification=classifications.size===1?[...classifications][0]:'activity';
  return {sourceId,classification,processedRecords:processed,insertedEvents:inserted,skippedRecords:skipped,oversizedRecords,hasMore,retainedContent:source.retainContent,warnings:[...warnings],format:SUPPORTED_FORMATS[source.kind]};
}
