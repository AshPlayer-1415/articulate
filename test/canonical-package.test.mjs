import test from 'node:test';
import assert from 'node:assert/strict';
import release from '../release.json' with {type:'json'};
import {validateReceipt,payload} from '../scripts/canonical-package.mjs';
const commit='a'.repeat(40),valid=()=>({schemaVersion:1,version:release.version,inputCommit:commit,filename:'articulate-local-'+release.version+'.tgz',size:100,sha256:'a'.repeat(64),files:Object.fromEntries(payload.map(p=>[p,'b'.repeat(64)]))});
test('canonical receipt cannot expand the seven-file payload or redirect its archive',()=>{validateReceipt(valid(),commit);for(const patch of [{filename:'../../profile.json'},{files:{...valid().files,'profile.json':'c'.repeat(64)}},{files:{'server/index.mjs':'b'.repeat(64)}},{sha256:'not-a-digest'},{size:5*1024*1024}])assert.throws(()=>validateReceipt({...valid(),...patch},commit));});
test('canonical receipt rejects another source commit or package version',()=>{for(const patch of [{inputCommit:'d'.repeat(40)},{version:'0.0.0'},{schemaVersion:2}])assert.throws(()=>validateReceipt({...valid(),...patch},commit));});
