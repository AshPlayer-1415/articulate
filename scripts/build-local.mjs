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
await writeFile(path.join(out,'README.md'),(await readFile(path.join(root,'packaging/npm-README.md'),'utf8')).replaceAll('{{VERSION}}',metadata.version));
await chmod(path.join(out,'bin/articulate.mjs'),0o755);
await writeFile(path.join(out,'package.json'),JSON.stringify({name:'articulate-local',version:metadata.version,private:false,type:'module',license:'Apache-2.0',description:'Local reviewed collaboration preferences shared across coding agents via MCP',repository:{type:'git',url:'git+https://github.com/AshPlayer-1415/articulate.git'},homepage:'https://www.npmjs.com/package/articulate-local',files:['server/index.mjs','bin/articulate.mjs','LICENSE','NOTICE','README.md','THIRD_PARTY_NOTICES.txt'],engines:metadata.engines,bin:{articulate:'bin/articulate.mjs'}},null,2)+'\n');
console.log('Built local code-only candidate in dist/local. No package published.');
