import path from 'node:path';
import {constants} from 'node:fs';
import {open,writeFile} from 'node:fs/promises';
import {JOB_MAX_BYTES,processJob} from './processing-job.mjs';
import {runContainerJob} from './container-job.mjs';

export async function readBoundedJson(file,max=JOB_MAX_BYTES) {
  if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('Choose an absolute JSON file path');
  const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try {
    const stat=await handle.stat();if(!stat.isFile()||stat.size>max)throw new Error('Input must be a bounded regular JSON file');
    const buffer=Buffer.alloc(max+1);let length=0;
    while(length<buffer.length){const {bytesRead}=await handle.read(buffer,length,buffer.length-length,length);if(!bytesRead)break;length+=bytesRead;}
    if(length>max)throw new Error('JSON input exceeds its limit');
    try{return JSON.parse(buffer.subarray(0,length).toString('utf8'));}catch{throw new Error('Invalid JSON input');}
  }finally{await handle.close();}
}
export async function runProcessingCli(options) {
  if(Object.keys(options).some(k=>!['input','policy','container','image','path'].includes(k)))throw new Error('Job supports --input, --policy, --path, --container and --image');
  if(!options.path||!path.isAbsolute(options.path))throw new Error('Choose a new absolute --path for the private job report');
  if(options.image&&!options.container)throw new Error('--image requires --container');
  const policy=await readBoundedJson(options.policy,256*1024),input=await readBoundedJson(options.input);
  const report=options.container?await runContainerJob(policy,input,{image:options.image}):{...processJob(policy,input),runtime:{kind:'in-process',network:'none',temporary:false}};
  await writeFile(options.path,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  return {saved:options.path,coverage:report.coverage,proposals:report.proposals.length,requiresUserReview:true,activeMemoryChanged:false,runtime:report.runtime};
}
