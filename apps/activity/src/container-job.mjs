import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {JOB_MAX_BYTES,validateJobPolicy,validateJobResult} from './processing-job.mjs';

function dockerEnv() {
  return Object.fromEntries(['PATH','HOME','DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG','XDG_RUNTIME_DIR','SystemRoot'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
}
function docker(args,{input='',timeoutMs=30000,maxBytes=512*1024}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{stdio:['pipe','pipe','pipe'],env:dockerEnv(),windowsHide:true});
    const chunks=[];let bytes=0,finished=false;
    const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);if(error){child.kill('SIGKILL');reject(error);}else resolve(value);};
    const timer=setTimeout(()=>finish(new Error('Docker job timed out; cleanup was requested')),timeoutMs);
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes)finish(new Error('Docker job output exceeded its limit'));else chunks.push(chunk);});
    // Never forward arbitrary worker/runtime stderr into an agent or a log.
    child.stderr.resume();child.stdin.on('error',()=>{});
    child.once('error',()=>finish(new Error('Docker CLI is unavailable')));
    child.once('close',code=>code===0?finish(null,Buffer.concat(chunks).toString('utf8')):finish(new Error('Docker job failed. Start a working Docker daemon and prepare the local worker image; no fallback was attempted.')));
    child.stdin.end(input);
  });
}
export function containerArguments(imageId,name) {
  if(!/^sha256:[a-f0-9]{64}$/.test(imageId)||!/^articulate-job-[a-f0-9-]+$/.test(name))throw new Error('Invalid pinned worker identity');
  return ['run','--rm','--pull=never','--name',name,'--read-only','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--memory','256m','--memory-swap','256m','--cpus','1','--user','65532:65532','--tmpfs','/tmp:rw,noexec,nosuid,size=16m','--log-driver','none','-i',imageId];
}
export function validateDockerEndpoint(endpoint) {
  let url;try{url=new URL(endpoint);}catch{throw new Error('Invalid Docker endpoint');}
  const unix=url.protocol==='unix:'&&!url.hostname&&url.pathname.startsWith('/')&&!url.username&&!url.password&&!url.search&&!url.hash;
  const pipe=process.platform==='win32'&&/^npipe:\/\/\/\/\.\/pipe\/[A-Za-z0-9_-]+$/.test(endpoint);
  if(!unix&&!pipe)throw new Error('Offline jobs require a local Docker socket; remote Docker contexts are not permitted');
  return endpoint;
}
export async function assertLocalDocker() {
  // DOCKER_CONTEXT takes precedence over DOCKER_HOST in the Docker CLI.
  const configured=process.env.DOCKER_CONTEXT;
  let endpoint;
  if(!configured&&process.env.DOCKER_HOST)endpoint=process.env.DOCKER_HOST;
  else {
    const args=['context','inspect','--format','{{json .Endpoints.docker.Host}}',...(configured?[configured]:[])];
    try{endpoint=JSON.parse(await docker(args,{maxBytes:4096}));}catch{throw new Error('Cannot verify a local Docker endpoint; no export was sent');}
  }
  return validateDockerEndpoint(endpoint);
}
export async function runContainerJob(policy,input,{image='articulate-worker:local',timeoutMs=30000}={}) {
  validateJobPolicy(policy);
  if(!/^(?:articulate-worker:[a-z0-9][a-z0-9._-]{0,79}|sha256:[a-f0-9]{64})$/.test(image))throw new Error('Select a prepared local Articulate worker image');
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>120000)throw new Error('Invalid job timeout');
  const envelope=JSON.stringify({policy,export:input});if(Buffer.byteLength(envelope)>JOB_MAX_BYTES)throw new Error('Job input exceeds its limit');
  if(!input||input.schemaVersion!==1||input.tenantId!==policy.tenantId||!Array.isArray(input.events)||input.events.length>2000)throw new Error('Export does not match the bounded trusted job scope');
  await assertLocalDocker();
  const imageId=(await docker(['image','inspect','--format','{{.Id}}',image],{maxBytes:256})).trim();
  const name='articulate-job-'+randomUUID();let completed=false;
  try {
    const result=validateJobResult(JSON.parse(await docker(containerArguments(imageId,name),{input:envelope,timeoutMs})),policy,input);
    completed=true;return {...result,runtime:{kind:'docker',imageId,network:'none',temporary:true}};
  } finally {
    // --rm handles success. Also remove the named container if CLI/worker failed.
    if(!completed)await docker(['rm','--force',name],{timeoutMs:5000,maxBytes:4096}).catch(()=>{});
  }
}
