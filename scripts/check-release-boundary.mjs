import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';

export const ORIGIN='https://github.com/AshPlayer-1415/articulate.git';
export const FILES=Object.freeze(['README.md','.gitignore','AGENTS.md','release-policy.json','package.json','scripts/check-release-boundary.mjs','test/release-boundary.test.mjs']);
const sorted=values=>[...values].sort();
export function checkDestination(name,url,repo) {
  if(name!=='origin'||url!==ORIGIN)throw new Error('Unexpected staging destination');
  if(!repo||repo.id!==1436838545||repo.full_name!=='AshPlayer-1415/articulate'||repo.private!==true)throw new Error('Staging identity or private visibility mismatch');
}
export function checkPolicy(p) {
  const expected={schemaVersion:1,phase:'bootstrap',expectedGitHubId:1436838545,expectedRepository:'AshPlayer-1415/articulate',expectedOrigin:ORIGIN,stagingVisibility:'private',publicationAllowed:false,packagePublishAllowed:false,containerPublishAllowed:false,registryPublishAllowed:false,approvedSourceExports:[],approvedPrivateSourcePaths:[],userDataImportAllowed:false,internalDocumentImportAllowed:false,oldGitHistoryImportAllowed:false,automaticTelemetryAllowed:false,activityUploadAllowed:false,bootstrapAllowedFiles:[...FILES],futureExportsRequire:{explicitLaterHumanInstruction:true,approvedSanitizedHandoff:true,exactReviewedPaths:true,sha256ContentHashes:true,globsOrDirectoryApprovalsAllowed:false}};
  if(!isDeepStrictEqual(p,expected))throw new Error('Bootstrap policy changed or publication enabled');
}
export function checkTree(entries) {
  if(!Array.isArray(entries)||!isDeepStrictEqual(sorted(entries.map(e=>e.path)),sorted(FILES))||entries.some(e=>e.mode!=='100644'||e.type!=='blob'))throw new Error('Only the seven regular scaffold files may be committed');
}
export function checkUpdates(input,head) {
  const lines=input.trim().split('\n');
  if(lines.length!==1)throw new Error('Only one main creation is permitted');
  const fields=lines[0].split(' ');
  if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)||fields.length!==4||fields[0]!=='refs/heads/main'||fields[1]!==head||fields[2]!=='refs/heads/main'||fields[3]!=='0'.repeat(head.length))throw new Error('Only fresh main creation is permitted');
}
export function checkHistory(count,parents,refs) {
  if(count!=='1'||parents.trim().split(/\s+/).length!==1||refs.trim()!=='')throw new Error('Bootstrap requires a single root commit and empty remote');
}
function run(command,args,cwd) {
  try{return execFileSync(command,args,{cwd,encoding:'utf8',timeout:20000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe'],env:{...process.env,GH_PROMPT_DISABLED:'1'}}).trim();}
  catch{throw new Error('Required Git or GitHub verification failed; push blocked');}
}
export function verifyBootstrap(name,url,input) {
  // Reject supplied destinations before invoking Git or the network.
  checkDestination(name,url,{id:1436838545,full_name:'AshPlayer-1415/articulate',private:true});
  const root=fileURLToPath(new URL('..',import.meta.url));
  const git=args=>run('git',args,root);
  if(git(['rev-parse','--show-toplevel'])!==path.resolve(root)||git(['remote'])!=='origin'||git(['remote','get-url','--push','--all','origin'])!==ORIGIN||git(['symbolic-ref','--short','HEAD'])!=='main')throw new Error('Unexpected checkout, remotes or branch');
  if(git(['status','--porcelain','--untracked-files=all'])!=='')throw new Error('Review and commit scaffold changes before pushing');
  const head=git(['rev-parse','HEAD']);
  checkUpdates(input,head);
  checkPolicy(JSON.parse(git(['show',head+':release-policy.json'])));
  const pkg=JSON.parse(git(['show',head+':package.json']));
  if(pkg.private!==true)throw new Error('Package publication must stay disabled');
  const entries=git(['ls-tree','-r',head]).split('\n').map(line=>{
    const match=/^(\d+) (\w+) [a-f0-9]+\t(.+)$/.exec(line);
    if(!match)throw new Error('Unexpected tree encoding');
    return {mode:match[1],type:match[2],path:match[3]};
  });
  checkTree(entries);
  checkHistory(git(['rev-list','--count',head]),git(['rev-list','--parents','-n','1',head]),git(['ls-remote',ORIGIN]));
  const repo=JSON.parse(run('gh',['api','--hostname','github.com','repos/AshPlayer-1415/articulate','--jq','{id,full_name,private}'],root));
  checkDestination(name,url,repo);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length!==4)throw new Error('Run through the installed Git pre-push hook');
    verifyBootstrap(process.argv[2],process.argv[3],readFileSync(0,'utf8'));
    process.stderr.write('Private staging bootstrap verified.\n');
  }catch{process.stderr.write('Release push blocked: bootstrap boundary verification failed.\n');process.exitCode=1;}
}
