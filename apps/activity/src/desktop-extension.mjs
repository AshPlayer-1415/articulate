import {readFile,readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {ARTICULATE_VERSION} from '@articulate/core';
import template from '../../../adapters/claude/mcpb/manifest.json' with {type:'json'};

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fileBytes(file){const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>16*1024*1024)throw new Error('Unsafe extension asset');return readFile(file);}

export async function prepareDesktopExtension({configFile,configuration,folder,serverEntry,writePrivate}={}) {
  const root=serverEntry?path.dirname(path.dirname(serverEntry)):null;
  let bytes,notices;
  try {
    if(path.basename(serverEntry)!=='index.mjs'||path.basename(path.dirname(serverEntry))!=='server')throw new Error('Source entry');
    const metadata=JSON.parse(await fileBytes(path.join(root,'package.json')));
    if(metadata.name!=='@articulate/local'||metadata.version!==ARTICULATE_VERSION)throw new Error('Package mismatch');
    bytes=await fileBytes(serverEntry);notices=await fileBytes(path.join(root,'THIRD_PARTY_NOTICES.txt'));
  }catch{return {packageFile:null,needsInstall:null,reason:'source-checkout',message:'Use the packaged Articulate CLI to prepare the Claude Desktop extension. Manual MCP configuration was written.'};}
  const env=configuration.env;
  if(!env?.ARTICULATE_DATA_DIR||!env.ARTICULATE_CLIENT_ID||!env.ARTICULATE_CLIENT_TOKEN_FILE)throw new Error('Desktop client connection is incomplete');
  const boundEnv={ARTICULATE_DATA_DIR:env.ARTICULATE_DATA_DIR,ARTICULATE_EXTENSION_DATA_DIR:env.ARTICULATE_DATA_DIR,ARTICULATE_CLIENT_ID:env.ARTICULATE_CLIENT_ID,ARTICULATE_CLIENT_TOKEN_FILE:env.ARTICULATE_CLIENT_TOKEN_FILE};
  const manifest=structuredClone(template);delete manifest.user_config;
  manifest.server.mcp_config={command:configuration.command,args:['${__dirname}/server/index.mjs'],env:boundEnv};
  manifest.description='Shared local Articulate profile for this device. Each client needs its own sharing approval.';
  const packageFile=path.join(folder,'Articulate-Desktop-'+ARTICULATE_VERSION+'.mcpb');
  await writePrivate(packageFile,zipSync({'manifest.json':strToU8(JSON.stringify(manifest,null,2)+'\n'),'server/index.mjs':bytes,'THIRD_PARTY_NOTICES.txt':notices},{level:9}));
  let installedVersion=null,needsInstall=true,reason='not-installed';
  try {
    const extensions=path.join(path.dirname(configFile),'Claude Extensions');
    const st=await lstat(extensions);if(st.isSymbolicLink()||!st.isDirectory())throw new Error('Unsafe extensions folder');
    for(const item of (await readdir(extensions,{withFileTypes:true})).slice(0,200)) {
      if(!item.isDirectory()||item.isSymbolicLink())continue;
      const dir=path.join(extensions,item.name);let installed;
      try{installed=JSON.parse(await fileBytes(path.join(dir,'manifest.json')));}catch{continue;}
      if(installed.name!=='articulate-local')continue;
      installedVersion=installed.version;
      if(installed.version!==ARTICULATE_VERSION){reason='version-mismatch';break;}
      const existing=installed.server?.mcp_config?.env??{};
      if(Object.entries(boundEnv).some(([key,value])=>existing[key]!==value)){reason='profile-mismatch';break;}
      if(sha(await fileBytes(path.join(dir,'server/index.mjs')))!==sha(bytes)){reason='bundle-mismatch';break;}
      needsInstall=false;reason='current';break;
    }
  }catch(error){if(error.code!=='ENOENT')reason='inspection-unavailable';}
  return {packageFile,installedVersion,expectedVersion:ARTICULATE_VERSION,needsInstall,reason,message:needsInstall?'Claude Desktop needs the prepared extension installed or updated, then reloaded. Its shared-profile settings are already filled in.':'Claude Desktop has the matching shared-profile extension. Reload the app if it is already running.',privacy:'This device-specific package contains credential-file paths, not credential contents or activity. Keep it local.'};
}
