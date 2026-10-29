import { build } from "esbuild";
import { mkdir, rm, readFile, readdir } from "node:fs/promises";
import path from "node:path";

/** Shared esbuild of the local Articulate MCP server (no profile/secrets). */
export async function bundleMcpServer(root, outfile) {
  await mkdir(path.dirname(outfile), { recursive: true });
  const result=await build({
    entryPoints: [path.join(root, "apps/mcp/src/server.mjs")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    legalComments: "eof",
    metafile: true,
    sourcemap: false,
    minify: false,
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"
    },
    logLevel: "warning"
  });
  const packages=new Map();
  for(const input of Object.keys(result.metafile.inputs)) {
    if (!input.includes("node_modules/"))continue;
    let directory=path.dirname(path.resolve(root,input));
    while(directory!==path.dirname(directory)) {
      let metadata;
      try {metadata=JSON.parse(await readFile(path.join(directory,"package.json"),"utf8"));}
      catch(error){if(error.code!=="ENOENT")throw error;}
      if(typeof metadata?.name==="string" && typeof metadata.version==="string") {packages.set(directory,metadata);break;}
      directory=path.dirname(directory);
    }
  }
  const sections=["Articulate bundles the following third-party software. Original license and notice texts follow."];
  for(const [directory,metadata] of [...packages].sort((a,b)=>a[1].name.localeCompare(b[1].name))) {
    const files=(await readdir(directory)).filter(name=>/^(?:licen[cs]e|notice|copying)(?:[.-].*)?$/i.test(name)).sort();
    if(!files.length)throw new Error("Missing third-party license text: "+metadata.name);
    sections.push("\n"+metadata.name+"@"+metadata.version+" — "+metadata.license);
    for(const file of files)sections.push(await readFile(path.join(directory,file),"utf8"));
  }
  return {outfile,notices:sections.join("\n\n")+"\n"};
}

export async function resetDir(dir) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}
