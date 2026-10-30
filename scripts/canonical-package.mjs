import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,rm,mkdtemp,cp,lstat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import release from '../release.json' with {type:'json'};
export const payload=['LICENSE','NOTICE','README.md','THIRD_PARTY_NOTICES.txt','bin/articulate.mjs','package.json','server/index.mjs'].sort();
const root=fileURLToPath(new URL('..',import.meta.url)),filename='articulate-local-'+release.version+'.tgz';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function validateReceipt(r,commit){assert.equal(r.schemaVersion,1);assert.equal(r.version,release.version);assert.equal(r.inputCommit,commit);assert.equal(r.filename,filename);assert(Number.isSafeInteger(r.size)&&r.size>0&&r.size<3*1024*1024);assert.match(r.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(Object.keys(r.files).sort(),payload);for(const digest of Object.values(r.files))assert.match(digest,/^[a-f0-9]{64}$/);}
async function hashes(directory){const result={};for(const file of payload){const target=path.join(directory,file),stat=await lstat(target);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,'Unexpected canonical payload type');result[file]=sha(await readFile(target));}return result;}
async function main(){const [action,input]=process.argv.slice(2),folder=path.resolve(input??path.join(root,'artifacts/canonical'));const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 if(action==='seal'){
  assert(process.env.npm_execpath,'Run through npm');await mkdir(folder,{recursive:true});
  const packed=JSON.parse(execFileSync(process.execPath,[process.env.npm_execpath,'pack','./dist/local','--json','--ignore-scripts','--pack-destination',folder],{cwd:root,encoding:'utf8',timeout:60000}))[0];assert.equal(packed.name,'articulate-local');assert.equal(packed.version,release.version);assert.equal(packed.filename,filename);assert.deepEqual(packed.files.map(f=>f.path).sort(),payload);
  const bytes=await readFile(path.join(folder,filename)),receipt={schemaVersion:1,version:release.version,inputCommit:commit,filename,size:bytes.length,sha256:sha(bytes),files:await hashes(path.join(root,'dist/local'))};validateReceipt(receipt,commit);await writeFile(path.join(folder,'canonical-package.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({sealed:true,version:receipt.version,sha256:receipt.sha256}));
 }else if(action==='install'){
  const receiptFile=path.join(folder,'canonical-package.json');assert((await lstat(receiptFile)).size<65536);const receipt=JSON.parse(await readFile(receiptFile,'utf8'));validateReceipt(receipt,commit);const archive=path.join(folder,filename);assert.equal((await lstat(archive)).size,receipt.size);assert.equal(sha(await readFile(archive)),receipt.sha256,'Canonical archive hash mismatch');
  const names=execFileSync('tar',['-tf',archive],{encoding:'utf8',maxBuffer:65536,timeout:30000}).trim().split(/\r?\n/).sort();assert.deepEqual(names,payload.map(p=>'package/'+p).sort());const temporary=await mkdtemp(path.join(os.tmpdir(),'articulate canonical '));
  try{execFileSync('tar',['-xf',archive,'-C',temporary],{timeout:30000,stdio:'pipe'});assert.deepEqual(await hashes(path.join(temporary,'package')),receipt.files);await rm(path.join(root,'dist/local'),{recursive:true,force:true});await cp(path.join(temporary,'package'),path.join(root,'dist/local'),{recursive:true});assert.deepEqual(await hashes(path.join(root,'dist/local')),receipt.files);}finally{await rm(temporary,{recursive:true,force:true});}
  await mkdir(path.join(root,'artifacts'),{recursive:true});await writeFile(path.join(root,'artifacts/canonical-install-report.json'),JSON.stringify({passed:true,version:release.version,inputCommit:commit,canonicalArchiveSha256:receipt.sha256,serverSha256:receipt.files['server/index.mjs'],platform:process.platform,arch:process.arch,payloadFiles:payload.length},null,2)+'\n');console.log('Installed the verified canonical seven-file package for native runtime tests.');
 }else throw new Error('Choose seal or install');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
