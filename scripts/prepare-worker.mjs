import {build} from 'esbuild';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
// A new code-only context avoids sending Git, artifacts, profiles or histories
// to the Docker daemon. No recursive copy of the workspace is permitted.
const context=await mkdtemp(path.join(tmpdir(),'articulate-worker-build-'));
await build({entryPoints:[path.join(root,'apps/activity/src/processing-worker.mjs')],outfile:path.join(context,'worker.mjs'),bundle:true,format:'esm',platform:'node',target:'node22',treeShaking:true,legalComments:'eof',logLevel:'warning'});
await writeFile(path.join(context,'Dockerfile'),await readFile(path.join(root,'runtime/Dockerfile')),{mode:0o600});
console.log(JSON.stringify({context,prepared:true,built:false,files:['Dockerfile','worker.mjs'],next:'Build this context with --network=none, --build-arg BASE_IMAGE=node@sha256:<reviewed digest> and tag articulate-worker:local. Runtime jobs never pull images.'},null,2));
