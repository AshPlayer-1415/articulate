import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {LocalProfileStore,LocalAssessmentSessionStore} from '../src/index.js';
for(const [name,Store,file] of [['profile',LocalProfileStore,'profile.json'],['assessment session',LocalAssessmentSessionStore,'assessment-session.json']])test('corrupt '+name+' JSON is withheld from errors and preserved for local recovery',async()=>{const directory=await mkdtemp(path.join(os.tmpdir(),'articulate corrupt json '));try{const marker='CANARY7';await writeFile(path.join(directory,file),marker);await assert.rejects(()=>new Store(directory).load(),error=>{assert(!error.message.includes(marker));assert.match(error.message,/Invalid local .* JSON/);return true;});assert.equal(await readFile(path.join(directory,file),'utf8'),marker);}finally{await rm(directory,{recursive:true,force:true});}});
