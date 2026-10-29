import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {ORIGIN,FILES,checkDestination,checkPolicy,checkTree,checkUpdates,checkHistory} from '../scripts/check-release-boundary.mjs';
const repo={id:1436838545,full_name:'AshPlayer-1415/articulate',private:true};
const policy=JSON.parse(readFileSync(new URL('../release-policy.json',import.meta.url),'utf8'));
const head='a'.repeat(40);
const update=`refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`;
test('only the fixed private staging identity and URL pass',()=>{
  checkDestination('origin',ORIGIN,repo);
  for(const [name,url,r] of [['origin',ORIGIN,{...repo,private:false}],['origin',ORIGIN,{...repo,id:1}],['other',ORIGIN,repo],['origin',ORIGIN.replace('articulate.git','articulate-private.git'),repo],['origin',ORIGIN+'.evil',repo]])assert.throws(()=>checkDestination(name,url,r));
});
test('policy edits cannot masquerade as publication or source-export approval',()=>{
  checkPolicy(policy);
  for(const patch of [{publicationAllowed:true},{approvedSourceExports:[{path:'source.js'}]},{bootstrapAllowedFiles:[...FILES,'extra']},{futureExportsRequire:{}},{unexpected:true}])assert.throws(()=>checkPolicy({...policy,...patch}));
});
test('extra files, omissions, symlinks and submodules are denied',()=>{
  const entries=FILES.map(path=>({path,mode:'100644',type:'blob'}));checkTree(entries);
  for(const changed of [entries.slice(1),[...entries,{path:'profile.json',mode:'100644',type:'blob'}],entries.map((e,i)=>i?e:{...e,mode:'120000'}),entries.map((e,i)=>i?e:{...e,mode:'160000',type:'commit'})])assert.throws(()=>checkTree(changed));
});
test('updates cannot add tags, delete branches, force existing refs or push another commit',()=>{
  checkUpdates(update,head);
  for(const changed of ['',update+update,update.replace('refs/heads/main','refs/tags/v1'),update.replace('0'.repeat(40),'b'.repeat(40)),update.replace(head,'c'.repeat(40))])assert.throws(()=>checkUpdates(changed,head));
});
test('private history and a populated remote prevent bootstrap',()=>{
  checkHistory('1',head,'');
  for(const args of [['2',head,''],['1',head+' '+'b'.repeat(40),''],['1',head,head+'\trefs/heads/main']])assert.throws(()=>checkHistory(...args));
});
test('CLI rejects unexpected destinations offline without echoing supplied secrets',()=>{
  const marker='SYNTHETIC_SECRET';
  const r=spawnSync(process.execPath,['scripts/check-release-boundary.mjs','origin','https://'+marker+'@example.invalid/repo'],{encoding:'utf8',env:{...process.env,PATH:'/nonexistent'},timeout:10000});
  assert.equal(r.status,1);assert.match(r.stderr,/Release push blocked/);assert.equal(r.stdout,'');assert(!r.stderr.includes(marker));
});
