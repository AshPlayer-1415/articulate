import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundleMcpServer,resetDir} from './lib/bundle-mcp-server.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const out=path.join(root,'dist/local');
await resetDir(out);
await mkdir(path.join(out,'bin'),{recursive:true});
const metadata=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const {notices}=await bundleMcpServer(root,path.join(out,'server/index.mjs'));
await writeFile(path.join(out,'THIRD_PARTY_NOTICES.txt'),notices);
for(const file of ['LICENSE','NOTICE','bin/articulate.mjs'])
  await writeFile(path.join(out,file),await readFile(path.join(root,file)));
await writeFile(path.join(out,'README.md'),`# Articulate local alpha ${metadata.version}\n\nKeep this folder in a stable location. Use an updated Node.js 22, 24 or 26 LTS release.\n\nRun from this folder:\n\n    node bin/articulate.mjs project /absolute/path/to/repository\n    node bin/articulate.mjs all\n    node bin/articulate.mjs connect\n    node bin/articulate.mjs help\n\nChoose one project or all projects, review suggestions, then approve each client\nseparately. The connect command prepares local host settings and any required\nDesktop extension. Keep device-bound bundles and credential files on your device.\n\nActivity remains local by default. AI providers may process permitted MCP results.\nRemote analysis is a separate explicit opt-in. Historical inference is experimental;\nreview the facts of any generated answer. No learning gains or accuracy improvement\nare established. This alpha contains no account or telemetry.\n\nSee LICENSE, NOTICE and THIRD_PARTY_NOTICES.txt in this folder. Building does not publish the package. Full setup and privacy documentation accompanies\nthe source tree.\n`);
await chmod(path.join(out,'bin/articulate.mjs'),0o755);
await writeFile(path.join(out,'package.json'),JSON.stringify({name:'articulate-local',version:metadata.version,private:false,type:'module',license:'Apache-2.0',description:'Local reviewed collaboration preferences shared across coding agents via MCP',repository:{type:'git',url:'git+https://github.com/AshPlayer-1415/articulate.git'},homepage:'https://github.com/AshPlayer-1415/articulate',bugs:{url:'https://github.com/AshPlayer-1415/articulate/issues'},files:['server/index.mjs','bin/articulate.mjs','LICENSE','NOTICE','README.md','THIRD_PARTY_NOTICES.txt'],engines:metadata.engines,bin:{articulate:'bin/articulate.mjs'}},null,2)+'\n');
console.log('Built local code-only candidate in dist/local. No package published.');
