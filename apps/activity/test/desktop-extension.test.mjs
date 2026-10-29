import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {unzipSync} from 'fflate';
import {ARTICULATE_VERSION} from '@articulate/core';
import {prepareDesktopExtension} from '../src/desktop-extension.mjs';
import {writePrivate} from '../src/connections.mjs';

async function fixture(run){
  const root=await mkdtemp(path.join(os.tmpdir(),'articulate-desktop-package-'));
  try {
    const packaged=path.join(root,'packaged'),host=path.join(root,'host'),folder=path.join(root,'data','connections','all-projects');
    await mkdir(path.join(packaged,'server'),{recursive:true});await mkdir(host);
    const serverEntry=path.join(packaged,'server/index.mjs');
    await writeFile(serverEntry,'// Synthetic self-contained server fixture\n');
    await writeFile(path.join(packaged,'package.json'),JSON.stringify({name:'@articulate/local',version:ARTICULATE_VERSION}));
    await writeFile(path.join(packaged,'THIRD_PARTY_NOTICES.txt'),'Synthetic notices\n');
    const secret='SYNTHETIC_CREDENTIAL_MUST_NOT_BE_PACKAGED';const tokenFile=path.join(root,'credential.key');await writeFile(tokenFile,secret,{mode:0o600});
    const configuration={command:process.execPath,args:[serverEntry],env:{ARTICULATE_DATA_DIR:path.join(root,'data'),ARTICULATE_CLIENT_ID:'desktop-fixture',ARTICULATE_CLIENT_TOKEN_FILE:tokenFile}};
    await run({root,packaged,host,folder,serverEntry,secret,configuration,configFile:path.join(host,'claude_desktop_config.json')});
  }finally{await rm(root,{recursive:true,force:true});}
}

test('Desktop setup prepares a local client-bound package without reading or packaging credentials',()=>fixture(async f=>{
  const result=await prepareDesktopExtension({...f,writePrivate});assert.equal(result.needsInstall,true);assert.equal(result.reason,'not-installed');
  const files=unzipSync(await readFile(result.packageFile));assert.deepEqual(Object.keys(files).sort(),['THIRD_PARTY_NOTICES.txt','manifest.json','server/index.mjs']);
  const manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));assert.equal(manifest.version,ARTICULATE_VERSION);assert.equal(manifest.user_config,undefined);
  assert.equal(manifest.server.mcp_config.env.ARTICULATE_CLIENT_ID,'desktop-fixture');assert.equal(manifest.server.mcp_config.env.ARTICULATE_EXTENSION_DATA_DIR,f.configuration.env.ARTICULATE_DATA_DIR);
  assert.equal(manifest.server.mcp_config.env.ARTICULATE_CLIENT_TOKEN_FILE,f.configuration.env.ARTICULATE_CLIENT_TOKEN_FILE);
  assert(Object.values(files).every(bytes=>!new TextDecoder().decode(bytes).includes(f.secret)));
  assert.deepEqual(Buffer.from(files['server/index.mjs']),await readFile(f.serverEntry));
  if(process.platform!=='win32')assert.equal((await stat(result.packageFile)).mode&0o777,0o600);
}));

test('Desktop setup detects old versions, profile mismatches and a matching installed extension without modifying it',()=>fixture(async f=>{
  const installed=path.join(f.host,'Claude Extensions','local.mcpb.articulate-contributors.articulate-local');await mkdir(path.join(installed,'server'),{recursive:true});
  const file=path.join(installed,'manifest.json');await writeFile(file,JSON.stringify({name:'articulate-local',version:'0.1.2'}));
  let result=await prepareDesktopExtension({...f,writePrivate});assert.equal(result.reason,'version-mismatch');assert.equal(result.installedVersion,'0.1.2');assert.equal(JSON.parse(await readFile(file)).version,'0.1.2');
  const files=unzipSync(await readFile(result.packageFile));const manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));
  await writeFile(path.join(installed,'server/index.mjs'),files['server/index.mjs']);
  await writeFile(file,JSON.stringify({...manifest,server:{...manifest.server,mcp_config:{...manifest.server.mcp_config,env:{...manifest.server.mcp_config.env,ARTICULATE_DATA_DIR:path.join(f.root,'different-profile')}}}}));
  result=await prepareDesktopExtension({...f,writePrivate});assert.equal(result.reason,'profile-mismatch');
  await writeFile(file,files['manifest.json']);result=await prepareDesktopExtension({...f,writePrivate});assert.equal(result.needsInstall,false);assert.equal(result.reason,'current');
  await writeFile(path.join(installed,'server/index.mjs'),'// different bundle\n');result=await prepareDesktopExtension({...f,writePrivate});assert.equal(result.reason,'bundle-mismatch');
}));

test('unbundled source setup does not manufacture an unusable Desktop extension',()=>fixture(async f=>{
  const result=await prepareDesktopExtension({...f,serverEntry:path.join(f.root,'apps/mcp/src/server.mjs'),writePrivate});assert.equal(result.packageFile,null);assert.equal(result.reason,'source-checkout');
}));
