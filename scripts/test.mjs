import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const folders=['packages/core/test','packages/storage-local/test','apps/activity/test','apps/mcp/test'];
const files=folders.flatMap(folder=>readdirSync(folder).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>folder+'/'+name));
const run=spawnSync(process.execPath,['--experimental-strip-types','--test',...files],{stdio:'inherit'});
if(run.error)throw run.error;process.exitCode=run.status??1;
