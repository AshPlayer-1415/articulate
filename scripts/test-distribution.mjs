import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {ArticulateLocalService} from '../apps/mcp/src/service.mjs';
import {createConsentWindow} from '../apps/mcp/src/permission-ui.mjs';
import {prepareConnections,connectHosts} from '../apps/activity/src/connections.mjs';
import {clientConfiguration} from '../apps/activity/src/memory.mjs';
import {readClientCredentials,withActivityStore} from '../packages/storage-local/src/activity.js';
import release from '../release.json' with {type:'json'};
const root=process.cwd(),temp=await mkdtemp(path.join(os.tmpdir(),'articulate distribution '));
const npm=process.env.npm_execpath;if(!npm)throw new Error('Run with npm run test:distribution');
const checks=[];const env={...process.env,ARTICULATE_DATA_DIR:path.join(temp,'unused'),ARTICULATE_EXTENSION_DATA_DIR:'',ARTICULATE_CLIENT_ID:'',ARTICULATE_CLIENT_TOKEN_FILE:'',ARTICULATE_LOCAL_MODEL:''};
const run=(args,cwd=root)=>execFileSync(process.execPath,[npm,...args],{cwd,env,encoding:'utf8',timeout:180000,stdio:['ignore','pipe','pipe']});
const report={version:release.version,node:process.version,platform:process.platform,arch:process.arch,passed:false,checks,realHostGuiTested:false,syntheticDataOnly:true};
try{
  const packed=JSON.parse(run(['pack','./dist/local','--json','--ignore-scripts','--pack-destination',temp]))[0];
  const expected=['LICENSE','NOTICE','README.md','THIRD_PARTY_NOTICES.txt','bin/articulate.mjs','package.json','server/index.mjs'];
  assert.deepEqual(packed.files.map(f=>f.path).sort(),expected.sort());checks.push('npm tarball contains exactly seven code/license files');
  const prefix=path.join(temp,'global install');await mkdir(prefix);
  run(['install','--global','--prefix',prefix,path.join(temp,packed.filename),'--ignore-scripts','--offline','--no-audit','--no-fund']);
  const install=path.join(prefix,...(process.platform==='win32'?[]:['lib']),'node_modules','articulate-local');
  const help=execFileSync(process.execPath,[path.join(install,'bin/articulate.mjs'),'help'],{env,encoding:'utf8'});assert.match(help,/activity all/);checks.push('installed CLI works without source files or runtime dependencies');
  const shim=path.join(prefix,process.platform==='win32'?'articulate.cmd':'bin/articulate');
  const shimHelp=process.platform==='win32'?execFileSync(process.env.ComSpec??'cmd.exe',['/d','/s','/c',`""${shim}" help"`],{env,encoding:'utf8',windowsVerbatimArguments:true,timeout:30000}):execFileSync(shim,['help'],{env,encoding:'utf8'});
  assert.match(shimHelp,/activity connect/);checks.push('native global command shim works from a path containing spaces');
  if(process.platform==='win32'){const psHelp=execFileSync('pwsh',['-NoProfile','-NonInteractive','-Command',"& '"+shim.replaceAll("'","''")+"' help; exit $LASTEXITCODE"],{env,encoding:'utf8',timeout:30000});assert.match(psHelp,/activity connect/);checks.push('PowerShell invokes the explicit .cmd shim without an execution-policy change');}
  const metadata=JSON.parse(await readFile(path.join(install,'package.json'),'utf8'));assert.equal(metadata.version,release.version);assert.equal(metadata.private,false);assert.equal(metadata.dependencies,undefined);
  const directory=path.join(temp,'profile');const author=new ArticulateLocalService(directory);
  await author.saveStyles({styles:[{name:'Synthetic brief',responseShape:'Lead with the answer and essential caveat.',isDefault:true}],localStorageConsent:true,userApproved:true});
  const rule='Show a minimal reproducible example before the debugging explanation.';
  await withActivityStore(directory,s=>s.writeWorkingNote({rule,scope:{kind:'user'},expectedRevision:s.revision,userApproved:true}),{create:true});
  const server=path.join(install,'server/index.mjs');const prepared=await prepareConnections(directory,{serverEntry:server});assert.equal(prepared.length,4);
  const hostroot=path.join(temp,'hosts');await mkdir(hostroot);const paths={codex:path.join(hostroot,'codex.toml'),'claude-code':path.join(hostroot,'claude-code.json'),claude:path.join(hostroot,'claude.json'),cursor:path.join(hostroot,'cursor.json')};
  const connected=await connectHosts(directory,{approved:true,paths,serverEntry:server,output:()=>{}});assert.equal(connected.hosts.length,4);assert(connected.desktopExtension?.packageFile);checks.push('all four host configurations and device-bound Desktop extension are prepared');
  async function configured(item){const c=await clientConfiguration(directory,{id:item.clientId,host:'cursor',server});return {...env,...c.mcpServers.articulate.env};}
  async function choose(clientEnv,action){const s=new ArticulateLocalService(directory,{credentials:readClientCredentials(clientEnv)});const w=await createConsentWindow(s);try{const res=await fetch(w.url,{method:'POST',headers:{Origin:new URL(w.url).origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({action,...(action==='enable'?{agree:'yes'}:{})})});assert.equal(res.status,200);await w.done;}finally{await w.close();}}
  async function phase(clientEnv,enabled){const client=new Client({name:'distribution-test',version:'1.0.0'});try{await client.connect(new StdioClientTransport({command:process.execPath,args:[server],env:clientEnv,stderr:'pipe'}));const call=(name,args={})=>client.callTool({name,arguments:args});const status=JSON.parse((await call('articulate_status')).content[0].text);assert.equal(status.bundleVersion,release.version);assert.equal(status.memory.sharingEnabled,enabled);const p=await call('articulate_get_policy',{task:'debugging'}),a=await call('articulate_get_analysis');assert.equal(!!p.isError,!enabled);assert.equal(!!a.isError,!enabled);if(enabled){const policy=JSON.parse(p.content[0].text),analysis=JSON.parse(a.content[0].text);assert.equal(policy.memory.revision,analysis.memoryRevision);assert.equal(status.memory.revision,analysis.memoryRevision);assert(JSON.stringify(policy).includes(rule));}}finally{await client.close();}}
  const clients=[];for(const item of prepared){const clientEnv=await configured(item);await phase(clientEnv,false);await choose(clientEnv,'enable');await phase(clientEnv,true);clients.push(clientEnv);checks.push(item.host+' independently denies before grant and retrieves the shared rule after grant');}
  await choose(clients[0],'disable');await phase(clients[0],false);await phase(clients[1],true);checks.push('revoking one client leaves another client grant active');
  report.passed=true;
}catch(error){report.error=error.message;throw error;}finally{await mkdir(path.join(root,'artifacts'),{recursive:true});await import('node:fs/promises').then(fs=>fs.writeFile(path.join(root,'artifacts/distribution-report.json'),JSON.stringify(report,null,2)+'\n'));await rm(temp,{recursive:true,force:true});console.log(JSON.stringify(report));}
