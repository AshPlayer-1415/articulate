import {JOB_MAX_BYTES,processJob} from './processing-job.mjs';
try {
  const chunks=[];let size=0;
  for await(const chunk of process.stdin){size+=chunk.length;if(size>JOB_MAX_BYTES)throw new Error('Job input exceeds its limit');chunks.push(chunk);}
  const envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!envelope||Object.keys(envelope).sort().join(',')!=='export,policy')throw new Error('Invalid job envelope');
  const result=JSON.stringify(processJob(envelope.policy,envelope.export));
  if(Buffer.byteLength(result)>512*1024)throw new Error('Job output exceeds its limit');
  process.stdout.write(result+'\n');
}catch{process.stderr.write('Processing job rejected; check the bounded export schema, trusted tenant/project policy and runtime limits. No profile was changed.\n');process.exitCode=1;}
