import path from 'node:path';
import {withActivityStore,readClientCredentials} from '../../../packages/storage-local/src/activity.js';
import {digest} from '../../../packages/storage-local/src/activity-schema.js';
import {ArticulateLocalService} from '../../mcp/src/service.mjs';
import {createConsentWindow,launchSystemBrowser} from '../../mcp/src/permission-ui.mjs';
import {connectHosts} from './connections.mjs';
import {HOST_LABELS} from './pipeline.mjs';
import {confirmChoices} from './terminal.mjs';
import {pathToFileURL} from 'node:url';

export async function openClientPermission(directory,{id,ui=null,output=console.log,browser=launchSystemBrowser,ttlMs}={}) {
  const tokenFile=path.join(directory,'client-credentials',digest(String(id)).slice(0,24)+'.key');
  const credentials=readClientCredentials({ARTICULATE_DATA_DIR:directory,ARTICULATE_CLIENT_ID:id,ARTICULATE_CLIENT_TOKEN_FILE:tokenFile});
  const client=await withActivityStore(directory,s=>s.authenticate(credentials,{sharing:false}));
  const window=await createConsentWindow(new ArticulateLocalService(directory,{credentials}),{ttlMs});
  try {
    if(ui)ui.note(`Opening the local approval page for ${client.name}…`);
    else output(`Opening the local approval page for ${client.name}…`);
    try {await browser(window.url);}catch {
      output('The browser did not open. Open this private link on this device; keep it out of chats:\n'+window.url);
    }
    ui?.progress('Waiting for your choice in the browser…',{phase:'permission',force:true});
    const result=await window.done;
    ui?.stopProgress();
    const message=result.action==='enable'?`Sharing enabled for ${client.name}.`:result.action==='disable'?`Sharing disabled for ${client.name}.`:result.action==='expired'?`The page for ${client.name} expired. No approval was added.`:result.action==='failed'?`The choice for ${client.name} could not be saved. Open a new page to try again.`:`Permissions for ${client.name} were left unchanged.`;
    if(ui)(result.action==='enable'?ui.success:ui.warning)(message);else output(message);
    return {closed:true,...result};
  }finally{ui?.stopProgress();await window.close();}
}

export async function connectInteractively(directory,{ui,serverEntry,output=console.log,paths,browser,ttlMs}={}) {
  ui.note('Add Articulate to Codex, Claude Code, Claude Desktop and Cursor.');
  ui.note('Your current app settings will be backed up locally.');
  if(await ui.ask('Install these agent connections?',confirmChoices('Yes, install the connections','No, finish for now'))!=='yes')return {status:'cancelled'};
  const installed=await connectHosts(directory,{approved:true,serverEntry,paths,output:()=>{}});
  ui.success('Connection settings written. Your existing app settings are preserved.');
  const desktop=installed.desktopExtension;
  if(desktop?.needsInstall&&desktop.packageFile){
    ui.warning(desktop.installedVersion?`Claude Desktop has Articulate ${desktop.installedVersion}; the matching shared-profile extension needs an update.`:'Claude Desktop needs its shared-profile extension installed.');
    ui.note('The prepared package already contains this client’s connection settings. No credential contents are packaged.');
    if(await ui.ask('Open the Claude Desktop installer?',confirmChoices('Yes, open the prepared update','Later, keep the package for me'))==='yes'){
      try{await (browser??launchSystemBrowser)(pathToFileURL(desktop.packageFile).href);}catch{ui.warning('The installer did not open automatically.');}
      ui.note('Finish Install/Update in Claude Desktop, then reload its connection.');
    }
    ui.note('Desktop package: '+desktop.packageFile);
  }
  const states=()=>withActivityStore(directory,s=>s.clients().map(c=>({...c,analysisSharing:s.setting('analysis-grant:'+c.id)==='1'})));
  const current=await states();
  const pending=installed.hosts.filter(h=>{const c=current.find(c=>c.id===h.clientId);return !c?.sharing||!c?.analysisSharing;});
  if(pending.length){
    ui.note('Choose which agents may receive your reviewed preferences and derived summary.');
    ui.note('Each selected agent opens a separate approval page in your browser.');
    const selected=await ui.ask('Which agents would you like to approve?',{multiple:true,choices:pending.map(h=>({value:h.clientId,label:HOST_LABELS[h.host]}))});
    for(const id of selected) {
      let result;
      do {
        result=await openClientPermission(directory,{id,ui,output,browser,ttlMs});
      }while(['expired','failed'].includes(result.action)&&await ui.ask('Open a fresh approval page?',confirmChoices('Try again','Skip this agent for now'))==='yes');
    }
  }
  const final=await states();
  ui.section('✓','Your connections');
  for(const h of installed.hosts){const c=final.find(c=>c.id===h.clientId);if(h.host==='claude'&&desktop?.needsInstall)ui.warning(`${HOST_LABELS[h.host]} · ${c?.sharing&&c?.analysisSharing?'sharing approved':'sharing off'} · install/update and reload required`);else if(c?.sharing&&c?.analysisSharing)ui.success(`${HOST_LABELS[h.host]} · approved`);else ui.note(`${HOST_LABELS[h.host]} · sharing off`);}
  ui.note('Reload the MCP connection in each app, then start a new chat.');
  ui.note('Try: “Use Articulate for this project and apply my reviewed preferences.”');
  return installed;
}
