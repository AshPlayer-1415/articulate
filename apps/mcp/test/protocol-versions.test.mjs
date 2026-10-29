import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

async function wire(run) {
  const directory=await mkdtemp(path.join(tmpdir(),'articulate-wire-'));
  const child=spawn(process.execPath,['--experimental-strip-types',fileURLToPath(new URL('../src/server.mjs',import.meta.url))],{stdio:['pipe','pipe','pipe'],env:{...process.env,ARTICULATE_DATA_DIR:directory,ARTICULATE_EXTENSION_DATA_DIR:'',ARTICULATE_CLIENT_ID:'',ARTICULATE_CLIENT_TOKEN_FILE:''}});
  const pending=new Map();let id=0;child.stderr.resume();child.stdin.on('error',()=>{});
  const reader=createInterface({input:child.stdout});
  reader.on('line',line=>{const message=JSON.parse(line),entry=pending.get(message.id);if(entry){clearTimeout(entry.timer);pending.delete(message.id);entry.resolve(message);}});
  child.on('error',error=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error);}pending.clear();});
  const request=(method,params)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(new Error('Synthetic protocol request timed out'));},8000);pending.set(key,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');});
  try {await run(request,message=>child.stdin.write(JSON.stringify(message)+'\n'));}
  finally {for(const entry of pending.values())clearTimeout(entry.timer);reader.close();child.stdin.destroy();child.kill('SIGKILL');await new Promise(resolve=>child.exitCode!==null||child.signalCode!==null?resolve():child.once('exit',resolve));await rm(directory,{recursive:true,force:true});}
}
const modern=(version='2026-07-28')=>({'io.modelcontextprotocol/protocolVersion':version,'io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'synthetic-wire-client',version:'1'}});

test('2026 protocol discovery and per-request metadata work without an initialize handshake',{timeout:20000},()=>wire(async request=>{
  const discover=await request('server/discover',{_meta:modern()});assert(!discover.error,JSON.stringify(discover));assert.match(JSON.stringify(discover.result),/2026-07-28/);
  const listed=await request('tools/list',{_meta:modern()});assert(!listed.error);assert.equal(listed.result.resultType,'complete');assert(listed.result.tools.some(t=>t.name==='articulate_get_policy'));assert.equal(typeof listed.result.ttlMs,'number');assert(['private','public'].includes(listed.result.cacheScope));
  const status=await request('tools/call',{name:'articulate_status',arguments:{},_meta:modern()});assert(!status.error);assert.equal(status.result.resultType,'complete');assert.equal(JSON.parse(status.result.content[0].text).hasProfile,false);
  const denied=await request('tools/call',{name:'articulate_get_policy',arguments:{personalization:false},_meta:modern()});assert.equal(denied.result.isError,true);
  const presented=await request('tools/call',{name:'articulate_present_answer',arguments:{blocks:[{kind:'answer',content:'E_MODERN_29; outcome unknown.'}],layout:'labeled',constraints:{format:'exact'}},_meta:modern()});
  assert.equal(presented.result.resultType,'complete');assert.equal(JSON.parse(presented.result.content[0].text).answer,'E_MODERN_29; outcome unknown.');
}));
test('2025 handshake clients retain tool discovery and default-denied profile access',{timeout:20000},()=>wire(async(request,notify)=>{
  const initialize=await request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'synthetic-legacy-client',version:'1'}});assert.equal(initialize.result.protocolVersion,'2025-11-25');
  notify({jsonrpc:'2.0',method:'notifications/initialized'});
  const listed=await request('tools/list',{});assert(listed.result.tools.some(t=>t.name==='articulate_status'));
  const status=await request('tools/call',{name:'articulate_status',arguments:{}});assert.equal(JSON.parse(status.result.content[0].text).hasProfile,false);
  const denied=await request('tools/call',{name:'articulate_get_policy',arguments:{}});assert.equal(denied.result.isError,true);
}));
test('unsupported modern protocol returns an explicit version error without downgrading the request',{timeout:20000},()=>wire(async request=>{
  const reply=await request('tools/list',{_meta:modern('1900-01-01')});assert.equal(reply.error.code,-32022);assert.equal(reply.error.data.requested,'1900-01-01');assert(reply.error.data.supported.includes('2026-07-28'));assert.equal(reply.result,undefined);
}));
