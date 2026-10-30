#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=[path.join(root,'server/index.mjs'),path.join(root,'dist/local/server/index.mjs')].find(existsSync);
const source=path.join(root,'apps/activity/src/index.mjs');
if(!bundle&&!existsSync(source)){console.error('Articulate build is missing. Reinstall from the published package or run npm run build in the source checkout.');process.exit(1);}
const args=['--disable-warning=ExperimentalWarning',...(bundle?[bundle,'activity',...process.argv.slice(2)]:['--experimental-strip-types',source,...process.argv.slice(2)])];
const child=spawn(process.execPath,args,{stdio:'inherit'});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exitCode=code??1;});
