import {lstat,readdir,opendir,realpath,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {digest} from '../../../packages/storage-local/src/activity-schema.js';

const execute=promisify(execFile);
const key=value=>process.platform==='win32'?value.toLowerCase():value;
export const SOURCE_LABELS={codex:'Codex','claude-code':'Claude Code',cursor:'Cursor'};
export function activityLocations(env=process.env) {
  const home=os.homedir();
  const codex=env.CODEX_HOME||path.join(home,'.codex');
  const claude=env.CLAUDE_CONFIG_DIR||path.join(home,'.claude');
  const cursor=env.ARTICULATE_CURSOR_HOME||path.join(home,'.cursor');
  const workspaces=env.ARTICULATE_CURSOR_WORKSPACE_STORAGE||path.join(process.platform==='darwin'?path.join(home,'Library','Application Support'):process.platform==='win32'?(env.APPDATA||path.join(home,'AppData','Roaming')):path.join(home,'.config'),'Cursor','User','workspaceStorage');
  return {roots:[{kind:'codex',path:path.join(codex,'sessions')},{kind:'codex',path:path.join(codex,'archived_sessions')},{kind:'claude-code',path:path.join(claude,'projects')},{kind:'cursor',path:path.join(cursor,'projects')}],cursorWorkspaces:workspaces};
}
export async function projectIdentity(input,{allowMissing=false}={}) {
  if(typeof input!=='string'||!path.isAbsolute(input))throw new Error('Select an absolute project directory');
  let directory;
  try {directory=await realpath(input);if(!(await lstat(directory)).isDirectory())throw new Error('Project must be a directory');}
  catch(error){if(!allowMissing||!['ENOENT','ENOTDIR'].includes(error.code))throw error;directory=path.resolve(input);}
  let root=directory,identity=directory,git=false;
  try {
    const result=await execute('git',['-c','core.fsmonitor=false','-C',directory,'rev-parse','--path-format=absolute','--show-toplevel','--git-common-dir'],{timeout:3000,maxBuffer:16384,windowsHide:true,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'}});
    const lines=result.stdout.trim().split(/\r?\n/);
    if(lines.length===2&&lines.every(p=>path.isAbsolute(p))){root=await realpath(lines[0]);identity=await realpath(lines[1]);git=true;}
  }catch{/* Plain folders and removed historical workspaces remain separate projects. */}
  return {id:'project-'+digest(key(identity)).slice(0,24),name:path.basename(root)||root,path:root,identity,git};
}
async function prefix(file,maxBytes=32768) {
  const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try {const stat=await handle.stat();if(!stat.isFile())throw new Error('Not a regular transcript');const buffer=Buffer.alloc(Math.min(stat.size,maxBytes));const {bytesRead}=await handle.read(buffer,0,buffer.length,0);return {text:buffer.subarray(0,bytesRead).toString('utf8'),bytes:bytesRead};}finally{await handle.close();}
}
function metadataPaths(text,kind) {
  const paths=new Set();
  for(const line of text.split(/\r?\n/)) {
    let record;try{record=JSON.parse(line);}catch{continue;}
    if(!record||typeof record!=='object')continue;
    const payload=kind==='codex'&&['session_meta','turn_context'].includes(record.type)?record.payload:record;
    if(!payload||typeof payload!=='object')continue;
    if(typeof payload.cwd==='string'&&path.isAbsolute(payload.cwd))paths.add(payload.cwd);
    if(kind==='cursor') {
      for(const root of payload.workspace_roots??[])if(typeof root==='string'&&path.isAbsolute(root))paths.add(root);
      if(typeof payload.workspacePath==='string'&&path.isAbsolute(payload.workspacePath))paths.add(payload.workspacePath);
    }
  }
  return [...paths];
}
function cursorSlugs(directory) {
  const normalized=directory.replace(/\\/g,'/');
  return [...new Set([normalized.replace(/[^a-zA-Z0-9]/g,'-'),normalized.replace(/[^a-zA-Z0-9]/g,'-').replace(/^-+/,''),normalized.replace(/[/:\\]/g,'-').replace(/^-+/,'' )])];
}
/** Runs only after the person authorizes this project/all-project scan. No transcript bodies are returned. */
export async function discoverProjectActivity({projectPath=null,roots,cursorWorkspaces,maxFiles=5000,maxEntries=20000,knownProjects=[],maxPrefixBytes=128*1024*1024,progress=()=>{}}={}) {
  if(!roots){const defaults=activityLocations();roots=defaults.roots;cursorWorkspaces??=defaults.cursorWorkspaces;}
  const selected=projectPath?await projectIdentity(path.resolve(projectPath)):null;
  const identities=new Map(),projects=new Map(),files=[],warnings=[],availability=[];
  let bytesRead=0,examined=0,visited=0,incomplete=false,unattributed=0;
  async function identify(directory) {
    const resolved=path.resolve(directory);if(!identities.has(key(resolved)))identities.set(key(resolved),projectIdentity(resolved,{allowMissing:true}));
    const project=await identities.get(key(resolved));
    if(!projects.has(project.id))projects.set(project.id,{...project,paths:[],agents:{},traces:[]});
    const group=projects.get(project.id);for(const candidate of [resolved,project.path])if(!group.paths.includes(candidate))group.paths.push(candidate);
    return group;
  }
  if(selected)await identify(selected.path);
  for(const project of knownProjects.slice(0,5000))if(typeof project.path==='string'&&path.isAbsolute(project.path))await identify(project.path);
  // Cursor's editor workspace metadata supplements path-labelled transcript folders.
  if(cursorWorkspaces) {
    try {
      const stat=await lstat(cursorWorkspaces);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Unsupported workspace metadata directory');
      const entries=await readdir(cursorWorkspaces,{withFileTypes:true});
      if(entries.length>5000){incomplete=true;warnings.push('Cursor workspace metadata limit reached');}
      for(const entry of entries.slice(0,5000)) {
        if(!entry.isDirectory()||entry.isSymbolicLink())continue;
        try {const raw=await prefix(path.join(cursorWorkspaces,entry.name,'workspace.json'),16384);const meta=JSON.parse(raw.text);if(typeof meta.folder==='string'&&meta.folder.startsWith('file:'))await identify(fileURLToPath(meta.folder));}catch{/* Unsupported editor workspaces are not guessed. */}
      }
    }catch(error){if(error.code!=='ENOENT')warnings.push('Some Cursor workspace metadata was unavailable');}
  }
  async function walk(directory,kind,root,depth=0) {
    if(examined>=maxFiles||bytesRead>=maxPrefixBytes||visited>=maxEntries){incomplete=true;return;}
    visited++;
    if(depth>8){incomplete=true;warnings.push('A deeply nested activity folder was skipped');return;}
    let stat;try{stat=await lstat(directory);}catch{incomplete=true;return;}
    if(stat.isSymbolicLink())return;
    if(stat.isDirectory()) {
      const entries=[];try{for await(const entry of await opendir(directory)){if(entries.length>=maxEntries-visited){incomplete=true;break;}entries.push(entry);}}catch{incomplete=true;return;}
      for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
        if(examined>=maxFiles||bytesRead>=maxPrefixBytes||visited>=maxEntries){incomplete=true;break;}
        if(entry.isSymbolicLink()||['.git','node_modules','vendor'].includes(entry.name))continue;
        await walk(path.join(directory,entry.name),kind,root,depth+1);
      }
      return;
    }
    if(!stat.isFile()||!(kind==='cursor'?/\.(jsonl|txt|md)$/i:/\.jsonl$/i).test(directory))return;
    // Only agent-transcripts and direct exports belong to the Cursor activity surface.
    if(kind==='cursor'&&!path.relative(root,directory).split(path.sep).includes('agent-transcripts'))return;
    examined++;
    if(examined%50===0)progress({phase:'discovery',filesExamined:examined});
    try {
      const preview=await prefix(directory,Math.min(32768,maxPrefixBytes-bytesRead));bytesRead+=preview.bytes;
      const paths=metadataPaths(preview.text,kind),groups=[];
      for(const candidate of paths){const group=await identify(candidate);if(!groups.some(g=>g.id===group.id))groups.push(group);}
      files.push({kind,path:await realpath(directory),paths,groups:groups.map(g=>g.id),cursorFolder:kind==='cursor'?path.relative(root,directory).split(path.sep)[0]:null});
    }catch{incomplete=true;warnings.push('An unreadable activity file was skipped');}
  }
  // Read native metadata first so Cursor folder matches can use all known project identities.
  for(const location of [...roots].sort((a,b)=>(a.kind==='cursor')-(b.kind==='cursor'))) {
    let available=false;try{const stat=await lstat(location.path);available=stat.isDirectory()&&!stat.isSymbolicLink();}catch{}
    availability.push({kind:location.kind,available});if(available)await walk(location.path,location.kind,location.path);
  }
  for(const file of files) {
    let association='workspace metadata';
    if(file.kind==='cursor'&&!file.groups.length) {
      const matches=[...projects.values()].filter(p=>p.paths.some(candidate=>cursorSlugs(candidate).includes(file.cursorFolder)));
      if(matches.length===1){file.groups=[matches[0].id];association='Cursor workspace folder (path label)';}
      else if(matches.length>1){warnings.push('Ambiguous Cursor workspace folder skipped');incomplete=true;}
    }
    if(!file.groups.length){unattributed++;incomplete=true;continue;}
    // A multi-root Cursor transcript cannot be split safely without per-message cwd metadata.
    if(file.kind==='cursor'&&file.groups.length>1){unattributed++;incomplete=true;warnings.push('A multi-project Cursor transcript needs more precise metadata');continue;}
    for(const id of file.groups) {
      if(selected&&id!==selected.id)continue;
      const project=projects.get(id);
      const matchingPaths=[];
      for(const candidate of file.paths)if((await identify(candidate)).id===id)matchingPaths.push((await identities.get(key(path.resolve(candidate)))).path);
      project.traces.push({kind:file.kind,path:file.path,projectId:id,projectPaths:matchingPaths.length?matchingPaths:null,association});
      project.agents[file.kind]=(project.agents[file.kind]??0)+1;
    }
  }
  const found=[...projects.values()].filter(p=>p.traces.length&&(selected?p.id===selected.id:true)).sort((a,b)=>a.path.localeCompare(b.path));
  return {mode:selected?'project':'all',selected,projects:found,filesExamined:examined,prefixBytesRead:bytesRead,unattributedFiles:unattributed,incomplete,warnings:[...new Set(warnings)],availability,coverage:'Available local traces only; absent traces do not prove an agent was never used. Remote/deleted history and proprietary databases are not scanned.'};
}
