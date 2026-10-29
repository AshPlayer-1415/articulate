import {mkdir,lstat,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {sharedAnalysis,writeAnalysisArtifacts} from './shared-analysis.mjs';
import {applicableRule} from './rules.mjs';
import {projectIdentity} from './project-discovery.mjs';
import {randomUUID,randomBytes} from 'node:crypto';
import {createProfile} from '@articulate/core';
import {LocalProfileStore,LocalAssessmentSessionStore,withRecoveredLocalProfileLock} from '@articulate/storage-local';
import {withActivityStore,readClientCredentials} from '@articulate/storage-local/activity';
import {digest,identifier,bounded,safeRule} from '@articulate/storage-local/activity-schema';

export async function enrollClient(directory,{id,name,projects=['*'],userApproved}) {
  if(userApproved!==true)throw new Error('Client enrollment requires explicit local approval');
  identifier(id,'client');bounded(name,80,'client name');
  if(!Array.isArray(projects)||!projects.length||projects.length>100)throw new Error('Choose permitted projects');
  projects.forEach(p=>p==='*'?p:identifier(p,'project'));
  return withRecoveredLocalProfileLock(directory,async()=>{
    return withActivityStore(directory,async store=>{
      if(store.clients().some(c=>c.id===id))throw new Error('Client already enrolled; choose a new id');
      const tokenDirectory=path.join(directory,'client-credentials');
      await mkdir(tokenDirectory,{recursive:true,mode:0o700});
      const stat=await lstat(tokenDirectory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Unsafe credential directory');
      const tokenFile=path.join(tokenDirectory,digest(String(id)).slice(0,24)+'.key');
      const token=randomBytes(32).toString('hex');
      await writeFile(tokenFile,token+'\n',{flag:'wx',mode:0o600});
      try {
        const profiles=new LocalProfileStore(directory);
        const before=await profiles.load();
        const profile=before??createProfile('local-'+randomUUID(),new Date().toISOString());
        // Fail closed across old binaries before enabling a client registry.
        await profiles.save({...profile,updatedAt:new Date().toISOString(),consent:{...profile.consent,sharePolicyWithAiProvider:false}});
        const enrolled=store.enroll({id,name,projects,token});
        return {id:enrolled.id,name:enrolled.name,projects:enrolled.projects,sharing:false,tokenFile,migration:'Legacy global sharing disabled; approve each client in its local permission window.',env:{ARTICULATE_DATA_DIR:directory,ARTICULATE_CLIENT_ID:enrolled.id,ARTICULATE_CLIENT_TOKEN_FILE:tokenFile}};
      } catch(error) {await unlink(tokenFile).catch(()=>{});throw error;}
    },{create:true});
  });
}

export async function reviewLocalMemory(directory,input,{credentials=null}={}) {
  return withRecoveredLocalProfileLock(directory,async()=>{
    const profiles=new LocalProfileStore(directory);
    const before=await profiles.load();
    const pending=await new LocalAssessmentSessionStore(directory).load();
    if(input.action!=='reject'&&pending&&(pending.draftProfile||!before?.confirmedAt))throw new Error('Finish or cancel the pending assessment before approving memory');
    return withActivityStore(directory,async store=>{
      let actorClientId='local-user';
      if(credentials) {
        const client=store.authenticate(credentials);actorClientId=client.id;
        const item=input.action==='create'?null:store.observation(input.id);
        if(input.action!=='create'&&(!item||(item.scope.kind!=='user'&&!client.projects.includes('*')&&!client.projects.includes(item.scope.projectId))))throw new Error('Observation is unavailable to this client');
      }
      const result=input.action==='create'?store.writeWorkingNote({...input,actorClientId}):store.review({...input,actorClientId});
      if(result.observation.status==='approved'&&!before?.confirmedAt) {
        const profile=before??createProfile('local-'+randomUUID(),new Date().toISOString());
        await profiles.save({...profile,confirmedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      }
      await writeAnalysisArtifacts(directory,store);
      return result;
    });
  });
}

export class LocalMemory {
  constructor(directory,{credentials=readClientCredentials()}={}) {this.directory=directory;this.credentials=credentials;}
  withStore(action,{create=false}={}){return withActivityStore(this.directory,action,{create});}
  clientMode(){return this.withStore(s=>s.clientMode);}
  async context({requireSharing=false,projectId=null}={}) {
    return this.withStore(store=>store.clientMode?{mode:'registered',...store.authenticate(this.credentials,{sharing:requireSharing,projectId})}:{mode:'legacy'});
  }
  async sharingEnabled(legacyValue) {
    try {const context=await this.context();return context.mode==='registered'?context.sharing:!!legacyValue;}catch{return false;}
  }
  async setSharing(enabled,{expectedMode,expectedClientId}={}) {
    return this.withStore(store=>{
      if(!store.clientMode||expectedMode!=='registered')throw new Error('Client registration changed; open a new permission window');
      const client=store.authenticate(this.credentials,{sharing:false});
      if(client.id!==expectedClientId)throw new Error('Client changed; open a new permission window');
      return store.grant(this.credentials,enabled);
    });
  }
  async status() {
    return this.withStore(store=>{
      const initialized=!!store.db;
      if(!store.clientMode)return {initialized,clientMode:false,import:'Explicit local command required; no background collection',analysis:'Local only; local model optional'};
      try {
        const client=store.authenticate(this.credentials,{sharing:false});
        return {initialized,clientMode:true,registered:true,clientName:client.name,sharingEnabled:client.sharing,analysisSharingEnabled:client.analysisSharing,...(client.sharing?{revision:store.revision,...(client.analysisSharing?{refresh:sharedAnalysis(store,{projects:client.projects,includeRules:false}).refresh}:{analysisApprovalRequired:true})}:{}),import:'Explicit local command required; raw activity is not exposed over MCP'};
      } catch{return {initialized,clientMode:true,registered:false,sharingEnabled:false,setupRequired:'Enroll this host with the trusted local activity client command'};}
    });
  }
  permitted(observation,client) {return observation.scope.kind==='user'||client.projects.includes('*')||client.projects.includes(observation.scope.projectId);}
  list({status=null,projectId=null,limit=50,afterId=null}={}) {
    return this.withStore(store=>{
      if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid memory page size');
      const client=store.authenticate(this.credentials,{projectId});
      const observations=store.observations({status,projectId,limit:limit+1,afterId,permittedProjects:client.projects});
      const page=observations.slice(0,limit).map(o=>{try{safeRule(o.rule);return o;}catch{return {id:o.id,status:o.status,scope:o.scope,quarantined:true,reason:'unsafe_preference',review:'Review or remove using the local CLI; content is withheld from AI tools.'};}});
      return {revision:store.revision,observations:page,hasMore:observations.length>limit,nextAfterId:observations.length>limit?page.at(-1).id:null,note:'Derived rules and evidence identifiers only; raw activity is local.'};
    });
  }
  async review(input) {
    await this.withStore(store=>{
      const client=store.authenticate(this.credentials);
      const observation=store.observation(input.id);
      if(!observation||!this.permitted(observation,client))throw new Error('Observation is unavailable to this client');
      if(input.scope?.kind==='user'&&!client.projects.includes('*'))throw new Error('Promoting a rule to user scope requires a client approved for all projects');
      if(input.scope?.projectId&&!client.projects.includes('*')&&!client.projects.includes(input.scope.projectId))throw new Error('Client is not permitted for the edited scope');
    });
    return reviewLocalMemory(this.directory,input,{credentials:this.credentials});
  }
  analysis({projectPath=null,projectId=null}={}) {
    return this.withStore(async store=>{const client=store.authenticate(this.credentials,{analysis:true});if(projectPath){const selected=await projectIdentity(projectPath);if(projectId&&projectId!==selected.id)throw new Error('Project id and workspace path do not match');projectId=selected.id;}if(!projectId&&client.projects.length===1&&client.projects[0]!=='*')projectId=client.projects[0];store.authenticate(this.credentials,{projectId});return {...sharedAnalysis(store,{projects:projectId?[projectId]:client.projects}),projectId};});
  }
  async updateAnalysis(input) {
    await this.withStore(store=>{const client=store.authenticate(this.credentials,{analysis:true});const scope=input.scope;if(!scope)throw new Error('Specify the working note scope');if(scope.kind==='user'&&!client.projects.includes('*'))throw new Error('User-wide notes require a client approved for all projects');if(scope.kind!=='user'&&!client.projects.includes('*')&&!client.projects.includes(scope.projectId))throw new Error('Client is not permitted for the note scope');if(input.id){const before=store.observation(input.id);if(!before||!this.permitted(before,client))throw new Error('Observation is unavailable to this client');if(input.userApproved!==true)throw new Error('Editing an existing rule requires the person’s approval');}});
    return reviewLocalMemory(this.directory,{...input,action:input.id?'edit':'create'},{credentials:this.credentials});
  }
  policy({task,projectId=null,projectPath=null,sessionId=null}={}) {
    return this.withStore(async store=>{
      if(!store.clientMode)return {revision:store.revision,rules:[],omitted:0,projectId};
      const client=store.authenticate(this.credentials,{projectId});
      if(projectPath){const selected=await projectIdentity(projectPath);if(projectId&&projectId!==selected.id)throw new Error('Project id and workspace path do not match');projectId=selected.id;}
      if(!projectId&&client.projects.length===1&&client.projects[0]!=='*')projectId=client.projects[0];
      store.authenticate(this.credentials,{projectId});
      const applicable=store.applicable({task,projectId,sessionId}).filter(o=>this.permitted(o,client));
      const rules=applicable.filter(applicableRule);const analysis=sharedAnalysis(store,{projects:projectId?[projectId]:client.projects,includeRules:false});
      return {revision:store.revision,projectId,refresh:client.analysisSharing?analysis.refresh:null,needsReview:applicable.filter(o=>!applicableRule(o)).map(o=>o.id),rules:rules.slice(0,20).map(o=>({id:o.id,rule:o.rule,scope:o.scope,task:o.task})),omitted:Math.max(0,rules.length-20)};
    });
  }
}

export async function clientConfiguration(directory,{id,host,server}) {
  const tokenFile=path.join(directory,'client-credentials',digest(String(id)).slice(0,24)+'.key');
  const env={ARTICULATE_DATA_DIR:directory,ARTICULATE_CLIENT_ID:id,ARTICULATE_CLIENT_TOKEN_FILE:tokenFile};
  const credentials=readClientCredentials(env);
  await withActivityStore(directory,s=>s.authenticate(credentials,{sharing:false}));
  if(!path.isAbsolute(server)||(await lstat(server)).isDirectory())throw new Error('Select the absolute server entrypoint');
  const args=path.normalize(server).endsWith(path.join('src','server.mjs'))?['--experimental-strip-types',server]:[server];
  if(host==='codex')return `[mcp_servers.articulate]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify(args)}\nenabled = true\nstartup_timeout_sec = 20\n[mcp_servers.articulate.env]\n${Object.entries(env).map(([k,v])=>k+' = '+JSON.stringify(v)).join('\n')}`;
  if(!['cursor','claude','claude-code'].includes(host))throw new Error('Choose codex, cursor or claude');
  return {mcpServers:{articulate:{command:process.execPath,args,env}}};
}
