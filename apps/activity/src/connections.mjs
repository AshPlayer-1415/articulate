import {readFile,writeFile,mkdir,lstat,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {digest,identifier} from '../../../packages/storage-local/src/activity-schema.js';
import {withActivityStore} from '../../../packages/storage-local/src/activity.js';
import {enrollClient,clientConfiguration} from './memory.mjs';
import {HOST_LABELS} from './pipeline.mjs';
import {prepareDesktopExtension} from './desktop-extension.mjs';

export function hostConfigPaths({home=os.homedir(),env=process.env,platform=process.platform}={}) {
  const appdata=platform==='darwin'?path.join(home,'Library','Application Support'):platform==='win32'?(env.APPDATA||path.join(home,'AppData','Roaming')):path.join(home,'.config');
  return {codex:path.join(env.CODEX_HOME||path.join(home,'.codex'),'config.toml'),'claude-code':path.join(home,'.claude.json'),claude:path.join(appdata,'Claude','claude_desktop_config.json'),cursor:path.join(env.ARTICULATE_CURSOR_HOME||path.join(home,'.cursor'),'mcp.json')};
}
async function regularText(file){try{const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)throw new Error('Unsafe configuration file');if(st.size>16*1024*1024)throw new Error('Configuration file exceeds its size limit');return await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function writePrivate(file,text){await mkdir(path.dirname(file),{recursive:true,mode:0o700});const st=await lstat(path.dirname(file));if(st.isSymbolicLink()||!st.isDirectory())throw new Error('Unsafe configuration directory');const tmp=file+'.articulate-'+randomUUID()+'.tmp';try{await writeFile(tmp,text,{flag:'wx',mode:0o600});await rename(tmp,file);}finally{await unlink(tmp).catch(()=>{});}}
export function mergeCodex(before,incoming) {
  if(/"""|'''/.test(before)||/^\s*mcp_servers\s*=/m.test(before))throw new Error('Complex Codex configuration requires its native MCP CLI; no file was changed');
  const lines=before.match(/.*(?:\r?\n|$)/g)??[];const kept=[];let remove=false,parent=false;
  for(const line of lines){const header=line.match(/^\s*\[([^\]\r\n]+)\]\s*(?:#.*)?(?:\r?\n)?$/);if(header){const name=header[1].trim();parent=name==='mcp_servers';remove=/^mcp_servers\s*\.\s*(?:articulate|"articulate"|'articulate')(?:\s*\.|$)/.test(name);}else if(parent&&/^\s*(?:articulate|"articulate"|'articulate')\s*=/.test(line))throw new Error('Inline Articulate entry requires its native MCP CLI; no file was changed');if(!remove)kept.push(line);}
  return kept.join('').replace(/\s*$/,'')+'\n\n'+incoming.trim()+'\n';
}
export async function prepareConnections(directory,{scopeId='all-projects',projects=['*'],serverEntry}={}) {
  identifier(scopeId,'scope');
  const server=serverEntry??fileURLToPath(new URL('../../mcp/src/server.mjs',import.meta.url));const folder=path.join(directory,'connections',scopeId);const connections=[];
  for(const host of Object.keys(HOST_LABELS)) {
    const id='setup-'+host+'-'+digest(scopeId).slice(0,12),exists=await withActivityStore(directory,s=>s.clients().some(c=>c.id===id));
    if(!exists)await enrollClient(directory,{id,name:HOST_LABELS[host],projects,userApproved:true});
    const config=await clientConfiguration(directory,{id,host,server});const file=path.join(folder,host+(host==='codex'?'.toml':'.json'));
    const old=await regularText(file);const text=typeof config==='string'?config+'\n':JSON.stringify(config,null,2)+'\n';if(old!==text)await writePrivate(file,text);
    connections.push({host,clientId:id,file});
  }
  return connections;
}
export async function connectHosts(directory,{approved=false,ask,output=console.log,paths=hostConfigPaths(),serverEntry}={}) {
  output('Connect Articulate to:');for(const [host,target] of Object.entries(paths))output('  '+HOST_LABELS[host]+' → '+target);
  output('Only the Articulate server entry is replaced. Private backups are saved locally. Each client still needs its own sharing approval.');
  if(!approved&&!/^(yes|y)$/i.test((await ask?.('Install these MCP settings? [y/N]')??'').trim()))return {status:'cancelled'};
  const state=await withActivityStore(directory,s=>{if(!s.db||!s.clientMode)throw new Error('Run project/all setup before connecting');const progress=JSON.parse(s.setting('activity-progress')??'{}');const scopeId=progress.latestScope??'all-projects';return {scopeId,projects:scopeId==='all-projects'?['*']:[scopeId]};});
  const connections=await prepareConnections(directory,{...state,serverEntry});const plans=[];
  for(const c of connections) {
    const target=paths[c.host];if(!target)continue;
    const incoming=await regularText(c.file),before=await regularText(target);let after;
    if(c.host==='codex')after=mergeCodex(before??'',incoming);
    else {const current=before?JSON.parse(before):{};if(!current||typeof current!=='object'||Array.isArray(current)||current.mcpServers!==undefined&&(!current.mcpServers||typeof current.mcpServers!=='object'||Array.isArray(current.mcpServers)))throw new Error('Unsupported host configuration; no settings changed');const server=JSON.parse(incoming).mcpServers.articulate;after=JSON.stringify({...current,mcpServers:{...current.mcpServers,articulate:server}},null,2)+'\n';}
    plans.push({...c,target,before,after});
  }
  const desktop=plans.find(p=>p.host==='claude');
  const desktopExtension=desktop?await prepareDesktopExtension({configFile:desktop.target,configuration:JSON.parse(desktop.after).mcpServers.articulate,folder:path.dirname(desktop.file),serverEntry,writePrivate}):null;
  const backup=path.join(directory,'config-backups',randomUUID());await mkdir(backup,{recursive:true,mode:0o700});const changed=[];
  try {
    for(const p of plans){if(await regularText(p.target)!==p.before)throw new Error('Host settings changed during preparation; retry');if(p.before!==null)await writePrivate(path.join(backup,p.host+(p.host==='codex'?'.toml':'.json')),p.before);await writePrivate(p.target,p.after);changed.push(p);}
  }catch(error){for(const p of changed.reverse())if(await regularText(p.target)===p.after){if(p.before===null)await unlink(p.target);else await writePrivate(p.target,p.before);}throw error;}
  const result={status:'configured',hosts:plans.map(({host,target,clientId})=>({host,target,clientId})),backupDirectory:backup,desktopExtension,next:'Configuration files are installed. Reload the hosts, complete any Desktop extension install, and approve each client locally. A running consumer-host connection is verified separately.'};
  await writePrivate(path.join(directory,'connections',state.scopeId,'installed.json'),JSON.stringify(result,null,2)+'\n');output(result.next);return result;
}
