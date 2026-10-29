#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=path.join(root,'server','index.mjs');
const args=['--disable-warning=ExperimentalWarning',...(existsSync(bundle)?[bundle,'activity',...process.argv.slice(2)]:['--experimental-strip-types',path.join(root,'apps','activity','src','index.mjs'),...process.argv.slice(2)])];
const child=spawn(process.execPath,args,{stdio:'inherit'});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exitCode=code??1;});
