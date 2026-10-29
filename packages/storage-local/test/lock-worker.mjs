import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { withLocalProfileLock } from "../src/index.js";

const dir=process.argv[2];
const count=Number(process.argv[3]||12);
if (!dir || !Number.isInteger(count) || count < 1) throw new Error("Usage: node lock-worker.mjs absolute_dir iterations");
for(let i=0;i<count;i++){
  await withLocalProfileLock(dir,async()=>{
    const file=path.join(dir,"counter.txt");
    const current=Number(await readFile(file,"utf8").catch(e=>e.code==="ENOENT"?"0":Promise.reject(e)));
    // Simulate a request temporarily paused mid-write to expose races.
    if(i%3===0)await new Promise(resolve=>setTimeout(resolve,8));
    await writeFile(file,String(current+1));
  },{ timeoutMs:15_000,retryMs:10 });
}
