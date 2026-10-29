import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createLocalService} from '../src/service.mjs';

test('presentation uses only supplied strings; no profile needed, disclosed or created',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'articulate-present-'));
  try {
    const service=createLocalService(dir),before=await readdir(dir);
    // Profile/history APIs must never be invoked by this pure transformation.
    service.requireSharing=()=>{throw new Error('unexpected profile read');};
    service.profileStore.load=()=>{throw new Error('unexpected profile read');};
    service.memory.policy=()=>{throw new Error('unexpected memory read');};
    const result=await service.presentAnswer({blocks:[{kind:'answer',content:'Unknown; not tested.'}],layout:'labeled',constraints:{format:'free'},candidate:'Answer:\nUnknown; not tested.'});
    assert.equal(result.verification.candidateMatches,true);
    assert.equal(result.verification.hostOutputVerified,false);
    assert.equal(result.contentWasSaved,false);
    assert.deepEqual(await readdir(dir),before);
    await assert.rejects(()=>service.presentAnswer({blocks:[{kind:['answer'],content:'synthetic input'}],layout:'labeled',constraints:{format:'free'}}),/Invalid content block/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
