import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,lstatSync,openSync,closeSync,chmodSync,readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,timingSafeEqual,randomUUID} from 'node:crypto';
import {identifier,bounded,digest,safeRule,scope,TASKS} from './activity-schema.js';
import {evidenceSupport} from './evidence-support.js';
import {forgetModeEvidence} from './work-modes.js';

const stamp=()=>new Date().toISOString();
const decode=row=>row?JSON.parse(row.body):null;
function regular(file) {
  const stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new Error('Unsafe activity store file');
}
export function readClientCredentials(env=process.env) {
  if(!env.ARTICULATE_CLIENT_ID&&!env.ARTICULATE_CLIENT_TOKEN_FILE)return null;
  identifier(env.ARTICULATE_CLIENT_ID,'client');
  const file=env.ARTICULATE_CLIENT_TOKEN_FILE;
  if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('Client token file must be an absolute local path');
  regular(file);
  const stat=lstatSync(file);
  if(stat.size>256||(process.platform!=='win32'&&(stat.mode&0o077)!==0))throw new Error('Client token file must be private to this OS user');
  const token=readFileSync(file,'utf8').trim();
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid client token file');
  return {id:env.ARTICULATE_CLIENT_ID,token};
}

/** Open only on explicit import/enrollment, or when the database already exists. */
export class ActivityStore {
  constructor(directory,{create=false}={}) {
    if(!path.isAbsolute(directory))throw new Error('Activity directory must be absolute');
    this.directory=directory;
    this.file=path.join(directory,'activity.sqlite');
    this.db=null;
    if(!existsSync(this.file)&&!create)return;
    mkdirSync(directory,{recursive:true,mode:0o700});
    if(!lstatSync(directory).isDirectory()||lstatSync(directory).isSymbolicLink())throw new Error('Unsafe activity directory');
    if(!existsSync(this.file)) {
      try {closeSync(openSync(this.file,'wx',0o600));}catch(error){if(error.code!=='EEXIST')throw error;}
    }
    regular(this.file);
    chmodSync(this.file,0o600);
    this.db=new DatabaseSync(this.file,{timeout:5000});
    try {
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE;');
    const version=this.db.prepare('PRAGMA user_version').get().user_version;
    if(version>2){this.close();throw new Error('Activity database requires a newer Articulate version');}
    this.transaction(()=>this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT NOT NULL,sharing INTEGER NOT NULL DEFAULT 0,projects TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,session_id TEXT NOT NULL,project_id TEXT NOT NULL,role TEXT NOT NULL,kind TEXT NOT NULL,at TEXT,content TEXT,fingerprint TEXT NOT NULL,body TEXT NOT NULL,content_expires_at TEXT);
      CREATE INDEX IF NOT EXISTS events_source ON events(source_id);
      CREATE INDEX IF NOT EXISTS events_project ON events(project_id);
      CREATE TABLE IF NOT EXISTS checkpoints(source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,file_key TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(source_id,file_key));
      CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,status TEXT NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS changes(revision INTEGER PRIMARY KEY,observation_id TEXT NOT NULL,before_body TEXT,after_body TEXT,at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS analyses(cache_key TEXT PRIMARY KEY,body TEXT NOT NULL);
      INSERT OR IGNORE INTO settings(key,value) VALUES('memory_revision','0');
      INSERT OR IGNORE INTO settings(key,value) VALUES('store_generation','${randomUUID()}');
      PRAGMA user_version=${Math.max(version,1)};
    `));
    this.generation=this.setting('store_generation');
    this.transaction(()=>{
      if(!this.db.prepare('PRAGMA table_info(events)').all().some(c=>c.name==='content_expires_at'))this.db.exec('ALTER TABLE events ADD COLUMN content_expires_at TEXT');
      this.db.exec("UPDATE events SET content_expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(body,'$.importedAt'),'+'||COALESCE((SELECT json_extract(sources.body,'$.retentionDays') FROM sources WHERE sources.id=events.source_id),30)||' days') WHERE content IS NOT NULL AND content_expires_at IS NULL; CREATE INDEX IF NOT EXISTS events_expiry ON events(content_expires_at);");
    });
    this.purgeExpiredContent();
    } catch(error) {this.close();throw error;}
  }
  close(){if(this.db){this.db.close();this.db=null;}}
  transaction(action) {
    if(!this.db)throw new Error('Initialize local activity with an explicit source or client command first');
    this.db.exec('BEGIN IMMEDIATE');
    try {if(this.generation!==undefined&&this.setting('store_generation')!==this.generation)throw new Error('Articulate data was erased or replaced; reopen the local store');const result=action();if(result?.then)throw new Error('Activity transactions must be synchronous');this.db.exec('COMMIT');return result;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  setting(key){return this.db?.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value??null;}
  set(key,value){this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));}
  get revision(){return Number(this.setting('memory_revision')??0);}
  get clientMode(){return this.setting('client_mode')==='1';}
  enroll({id,name,projects=['*'],token=randomBytes(32).toString('hex')}) {
    identifier(id,'client');bounded(name,80,'client name');
    if(!Array.isArray(projects)||!projects.length||projects.length>100)throw new Error('Choose permitted projects');
    projects.forEach(p=>p==='*'?p:identifier(p,'project'));
    if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid local enrollment token');
    this.transaction(()=>{
      if(this.db.prepare('SELECT id FROM clients WHERE id=?').get(id))throw new Error('Client already enrolled; use a new id or revoke it');
      this.db.prepare('INSERT INTO clients VALUES(?,?,?,0,?,?)').run(id,name,digest(token),JSON.stringify([...new Set(projects)]),stamp());
      this.set('client_mode','1');
    });
    return {id,name,token,projects,sharing:false};
  }
  authenticate(credentials,{sharing=true,projectId=null,analysis=false,legacy=false}={}) {
    if(!this.clientMode)throw new Error('Enroll a local client before using activity memory');
    if(!credentials?.id||typeof credentials.token!=='string')throw new Error('This host is not registered. Use the trusted local client-enrollment command.');
    const row=this.db.prepare('SELECT * FROM clients WHERE id=?').get(credentials.id);
    const actual=digest(credentials.token);
    if(!row||!timingSafeEqual(Buffer.from(row.token_hash),Buffer.from(actual)))throw new Error('Invalid local client credentials');
    if(sharing&&!row.sharing)throw new Error('Provider sharing is disabled for this client. Open its local permission window.');
    if(analysis&&this.setting('analysis-grant:'+row.id)!=='1')throw new Error('Analysis sharing requires updated local approval in this client’s permission window');
    if(legacy&&this.setting('legacy-grant:'+row.id)==='0')throw new Error('General profile sharing is disabled for this client; choose an approved work mode');
    const projects=JSON.parse(row.projects);
    if(projectId&&!projects.includes('*')&&!projects.includes(projectId))throw new Error('Client is not permitted for this project');
    return {id:row.id,name:row.name,sharing:!!row.sharing,analysisSharing:this.setting('analysis-grant:'+row.id)==='1',legacySharing:this.setting('legacy-grant:'+row.id)!=='0',projects};
  }
  grant(credentials,enabled) {
    const client=this.authenticate(credentials,{sharing:false});
    this.transaction(()=>{this.db.prepare('UPDATE clients SET sharing=? WHERE id=?').run(enabled?1:0,client.id);this.set('analysis-grant:'+client.id,enabled?'1':'0');this.set('legacy-grant:'+client.id,enabled?'1':'0');});
    return {...client,sharing:!!enabled,analysisSharing:!!enabled};
  }
  clients(){return this.db?this.db.prepare('SELECT id,name,sharing,projects FROM clients ORDER BY id').all().map(c=>({...c,sharing:!!c.sharing,projects:JSON.parse(c.projects)})):[];}
  revoke(id) {
    identifier(id,'client');
    this.transaction(()=>{if(!this.db.prepare('SELECT id FROM clients WHERE id=?').get(id))throw new Error('Unknown client');this.db.prepare('UPDATE clients SET sharing=0 WHERE id=?').run(id);this.set('analysis-grant:'+id,'0');if(this.db.prepare("SELECT name FROM sqlite_master WHERE name='mode_grants'").get()){this.db.prepare('UPDATE mode_grants SET enabled=0,epoch=epoch+1 WHERE client_id=?').run(id);this.db.prepare('DELETE FROM mode_context_cache WHERE client_id=?').run(id);this.db.prepare("UPDATE mode_selections SET mode_id='unavailable',revision=NULL WHERE client_id=? AND mode_id NOT IN ('legacy','none')").run(id);this.db.prepare("UPDATE mode_defaults SET mode_id='unavailable',revision=NULL WHERE client_id=? AND mode_id NOT IN ('legacy','none')").run(id);}});
  }
  addSource(source) {
    if(!['codex','claude-code','cursor'].includes(source.kind))throw new Error('Unsupported activity source');
    if(source.userApproved!==true)throw new Error('Source import requires explicit local approval');
    identifier(source.projectId,'project');
    if(!path.isAbsolute(source.path))throw new Error('Select an absolute source path');
    const selected=lstatSync(source.path);
    if(selected.isSymbolicLink()||(!selected.isFile()&&!selected.isDirectory()))throw new Error('Select a regular source file or directory');
    // Match the native resolver used by fs.promises.realpath during import,
    // including Windows short-name and long-name aliases.
    source={...source,path:realpathSync.native(source.path)};
    if(source.since!=null&&!Number.isFinite(Date.parse(source.since)))throw new Error('Invalid source date');
    if(!Number.isInteger(source.retentionDays??30)||(source.retentionDays??30)<1||(source.retentionDays??30)>365)throw new Error('Retention must be 1–365 days');
    const id='source-'+digest(JSON.stringify([source.kind,source.path,source.projectId])).slice(0,24);
    const existing=this.source(id);
    if(source.projectPath!=null&&!path.isAbsolute(source.projectPath))throw new Error('Project path must be absolute');
    if(source.projectPath&&existsSync(source.projectPath))source.projectPath=realpathSync.native(source.projectPath);
    if(source.projectPaths!=null&&(!Array.isArray(source.projectPaths)||!source.projectPaths.length||source.projectPaths.length>64||source.projectPaths.some(p=>typeof p!=='string'||!path.isAbsolute(p))))throw new Error('Choose bounded absolute project paths');
    if(source.repositoryId!=null&&source.repositoryId!==source.projectId)throw new Error('Repository identity must match the selected project');
    const projectPaths=source.projectPaths?.map(p=>existsSync(p)?realpathSync.native(p):path.resolve(p));
    const next={id,kind:source.kind,path:source.path,projectId:source.projectId,projectPath:source.projectPath??null,...(projectPaths?{projectPaths:[...new Set(projectPaths)]}:{}),...(source.repositoryId?{repositoryId:identifier(source.repositoryId,'repository')}:{}),since:source.since??null,retainContent:source.retainContent===true,retentionDays:source.retentionDays??30,approvedAt:existing?.approvedAt??stamp(),paused:false};
    if(existing&&JSON.stringify({...existing,paused:false})!==JSON.stringify(next))throw new Error('Source settings differ; remove and re-approve the source to change retention or scope');
    this.transaction(()=>this.db.prepare('INSERT INTO sources VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(id,JSON.stringify(next)));
    return next;
  }
  source(id){return this.db?decode(this.db.prepare('SELECT body FROM sources WHERE id=?').get(id)):null;}
  sources(){return this.db?this.db.prepare('SELECT body FROM sources ORDER BY id').all().map(decode):[];}
  pauseSource(id,paused=true) {
    const source=this.source(id);if(!source)throw new Error('Unknown source');
    this.transaction(()=>this.db.prepare('UPDATE sources SET body=? WHERE id=?').run(JSON.stringify({...source,paused}),id));
  }
  checkpoint(sourceId,fileKey){return this.db?decode(this.db.prepare('SELECT body FROM checkpoints WHERE source_id=? AND file_key=?').get(sourceId,fileKey)):null;}
  importBatch(sourceId,events,{fileKey,checkpoint}) {
    return this.transaction(()=>{
      const source=this.source(sourceId);if(!source||source.paused)throw new Error('Source is missing or paused');
      let inserted=0;
      for(const item of events) {
        const id='event-'+digest(JSON.stringify([sourceId,item.sessionId,item.nativeId]));
        const previous=this.db.prepare('SELECT fingerprint FROM events WHERE id=?').get(id);
        if(previous&&previous.fingerprint!==item.fingerprint)throw new Error('An imported source record changed; remove and re-approve this source before reimporting');
        const content=source.retainContent?item.content:null;
        const importedAt=stamp();
        const body={...item,id,sourceId,content:undefined,importedAt};
        const expiresAt=content===null?null:new Date(Date.parse(importedAt)+source.retentionDays*86400000).toISOString();
        const row=this.db.prepare('INSERT OR IGNORE INTO events(id,source_id,session_id,project_id,role,kind,at,content,fingerprint,body,content_expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,sourceId,item.sessionId,item.projectId,item.role,item.kind,item.timestamp,content,item.fingerprint,JSON.stringify(body),expiresAt);
        inserted+=Number(row.changes);
      }
      const previousCheckpoint=this.checkpoint(sourceId,fileKey);
      if(previousCheckpoint?.signature===checkpoint.signature){checkpoint={...checkpoint,...(checkpoint.line!==undefined?{line:Math.max(checkpoint.line,previousCheckpoint.line??0)}:{}),...(checkpoint.index!==undefined?{index:Math.max(checkpoint.index,previousCheckpoint.index??0)}:{}),complete:checkpoint.complete||previousCheckpoint.complete};}
      this.db.prepare('INSERT INTO checkpoints VALUES(?,?,?) ON CONFLICT(source_id,file_key) DO UPDATE SET body=excluded.body').run(sourceId,fileKey,JSON.stringify(checkpoint));
      return inserted;
    });
  }
  events({projectId=null,afterId=null,limit=40,withContent=true}={}) {
    if(!this.db)return [];
    if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('Invalid activity batch size');
    if(projectId)identifier(projectId,'project');
    return this.db.prepare('SELECT rowid,body,content FROM events WHERE (? IS NULL OR project_id=?) AND rowid>? ORDER BY rowid LIMIT ?').all(projectId,projectId,Number(afterId??0),limit).map(row=>({...decode(row),content:withContent?row.content:undefined,sequence:row.rowid}));
  }
  getEvent(id){if(!this.db)return null;const row=this.db.prepare('SELECT body,content FROM events WHERE id=?').get(id);return row?{...decode(row),content:row.content}:null;}
  analysis(key){return this.db?decode(this.db.prepare('SELECT body FROM analyses WHERE cache_key=?').get(key)):null;}
  saveAnalysis(key,body){this.db.prepare('INSERT OR REPLACE INTO analyses VALUES(?,?)').run(key,JSON.stringify(body));}
  propose(input) {
    const rule=safeRule(input.rule);
    const memoryScope=scope(input.scope);
    const task=input.task??null;if(task!==null&&!TASKS.includes(task))throw new Error('Invalid observation task');
    if(!Array.isArray(input.evidenceIds)||!input.evidenceIds.length||input.evidenceIds.length>80)throw new Error('Observation requires bounded evidence');
    const ids=[...new Set(input.evidenceIds)];
    const evidence=ids.map(id=>this.getEvent(id));
    if(evidence.some(e=>!e||e.role!=='user'||!['message','correction'].includes(e.kind)))throw new Error('Observation must reference only existing user requests');
    if(memoryScope.kind!=='user'&&evidence.some(e=>e.projectId!==memoryScope.projectId))throw new Error('Observation evidence does not match its project');
    if(memoryScope.kind==='session'&&evidence.some(e=>e.sessionId!==memoryScope.sessionId))throw new Error('Observation evidence does not match its session');
    const id='memory-'+digest(JSON.stringify([rule,memoryScope,task])).slice(0,32);
    const previous=this.observation(id);
    if(previous) {
      if(previous.origin==='user-edit')return previous;
      const combined=[...new Set([...previous.evidenceIds,...ids])];
      const kept=combined.slice(-80);const available=kept.map(key=>this.getEvent(key)).filter(Boolean);
      const next={...previous,evidenceIds:kept,evidenceCapped:combined.length>80,evidenceSupport:evidenceSupport(available),supportCount:new Set(available.map(e=>e.fingerprint)).size,sourceKinds:[...new Set(available.map(e=>this.source(e.sourceId)?.kind))],updatedAt:stamp()};
      this.db.prepare('UPDATE observations SET body=? WHERE id=?').run(JSON.stringify(next),id);
      return next;
    }
    const origin=input.origin==='explicit-request'?'explicit-request':input.origin==='compatible-model'?'compatible-model':'local-model';
    const observation={id,rule,scope:memoryScope,task,evidenceIds:ids,origin,status:'proposed',evidenceSupport:evidenceSupport(evidence),uncertainty:origin==='explicit-request'?'Literal user request; its lasting scope still needs review':'Model interpretation requiring user review',supportCount:new Set(evidence.map(e=>e.fingerprint)).size,sourceKinds:[...new Set(evidence.map(e=>this.source(e.sourceId)?.kind))],createdAt:stamp(),updatedAt:stamp()};
    this.db.prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?)').run(id,'proposed',JSON.stringify(observation));
    return this.observation(id);
  }
  observation(id){return this.db?decode(this.db.prepare('SELECT body FROM observations WHERE id=?').get(id)):null;}
  observations({status=null,projectId=null,limit=100,afterId=null,permittedProjects=null}={}) {
    if(!this.db)return [];
    if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('Invalid observation limit');
    if(status!==null&&!['proposed','approved','rejected'].includes(status))throw new Error('Invalid observation status');
    const projects=permittedProjects&&!permittedProjects.includes('*')?JSON.stringify(permittedProjects):null;
    return this.db.prepare(`SELECT body FROM observations WHERE (? IS NULL OR status=?)
      AND (? IS NULL OR id>?)
      AND (? IS NULL OR json_extract(body,'$.scope.kind')='user' OR json_extract(body,'$.scope.projectId')=?)
      AND (? IS NULL OR json_extract(body,'$.scope.kind')='user' OR json_extract(body,'$.scope.projectId') IN (SELECT value FROM json_each(?)))
      ORDER BY id LIMIT ?`).all(status,status,afterId,afterId,projectId,projectId,projects,projects,limit).map(decode);
  }
  review({id,action,expectedRevision,userApproved,rule:editedRule,scope:editedScope,actorClientId='local-user'}) {
    if(userApproved!==true)throw new Error('Review requires explicit user approval');
    if(!['approve','reject','edit'].includes(action))throw new Error('Invalid review action');
    return this.transaction(()=>{
      if(!Number.isInteger(expectedRevision)||expectedRevision!==this.revision)throw new Error('Memory revision changed; reload before reviewing');
      const before=this.observation(id);if(!before)throw new Error('Unknown observation');
      const after={...before,updatedByClientId:actorClientId,status:action==='reject'?'rejected':'approved',updatedAt:stamp()};
      if(action==='edit') {after.rule=safeRule(editedRule);after.origin='user-edit';}
      if(editedScope){after.scope=scope(editedScope);after.origin='user-edit';}
      if(action!=='reject')safeRule(after.rule);
      const revision=this.revision+1;
      this.db.prepare('UPDATE observations SET status=?,body=? WHERE id=?').run(after.status,JSON.stringify(after),id);
      this.db.prepare('INSERT INTO changes VALUES(?,?,?,?,?)').run(revision,id,JSON.stringify(before),JSON.stringify(after),stamp());
      this.set('memory_revision',revision);
      return {observation:after,revision};
    });
  }
  writeWorkingNote({rule:inputRule,scope:inputScope,task=null,expectedRevision,userApproved=false,actorClientId='local-user'}) {
    const rule=safeRule(inputRule),memoryScope=scope(inputScope);
    if(task!==null&&!TASKS.includes(task))throw new Error('Invalid observation task');
    return this.transaction(()=>{
      if(!Number.isInteger(expectedRevision)||expectedRevision!==this.revision)throw new Error('Memory revision changed; reload before updating analysis');
      const observation={id:'note-'+randomUUID(),rule,scope:memoryScope,task,evidenceIds:[],sourceKinds:[],supportCount:0,createdByClientId:actorClientId,origin:userApproved?'user-edit':'agent-proposal',status:userApproved?'approved':'proposed',uncertainty:userApproved?'Explicitly approved working note':'Agent proposal from its permitted context; not imported-history evidence',createdAt:stamp(),updatedAt:stamp()};
      const revision=this.revision+1;
      this.db.prepare('INSERT INTO observations VALUES(?,?,?)').run(observation.id,observation.status,JSON.stringify(observation));
      this.db.prepare('INSERT INTO changes VALUES(?,?,?,?,?)').run(revision,observation.id,null,JSON.stringify(observation),stamp());this.set('memory_revision',revision);
      return {observation,revision};
    });
  }
  rollback({revision,expectedRevision,userApproved}) {
    if(userApproved!==true)throw new Error('Rollback requires explicit user approval');
    return this.transaction(()=>{
      if(expectedRevision!==this.revision)throw new Error('Memory revision changed; reload before rollback');
      const change=this.db.prepare('SELECT * FROM changes WHERE revision=?').get(revision);
      if(!change)throw new Error('Unknown or erased memory revision');
      const before=JSON.parse(change.before_body);
      if(!before){const current=this.observation(change.observation_id);const nextRevision=this.revision+1;this.db.prepare('DELETE FROM observations WHERE id=?').run(change.observation_id);this.db.prepare('INSERT INTO changes VALUES(?,?,?,?,?)').run(nextRevision,change.observation_id,JSON.stringify(current),null,stamp());this.set('memory_revision',nextRevision);return {observation:null,revision:nextRevision};}
      if(before.evidenceIds.some(id=>!this.getEvent(id)))throw new Error('Source evidence was removed; this revision cannot be restored');
      const current=this.observation(change.observation_id);
      const next={...before,updatedAt:stamp()};
      const nextRevision=this.revision+1;
      this.db.prepare('INSERT OR REPLACE INTO observations VALUES(?,?,?)').run(next.id,next.status,JSON.stringify(next));
      this.db.prepare('INSERT INTO changes VALUES(?,?,?,?,?)').run(nextRevision,next.id,JSON.stringify(current),JSON.stringify(next),stamp());
      this.set('memory_revision',nextRevision);
      return {observation:next,revision:nextRevision};
    });
  }
  applicable({projectId=null,sessionId=null,task=null,at=stamp()}={}) {
    if(!this.db)return [];
    return this.db.prepare("SELECT body FROM observations WHERE status='approved' AND (json_extract(body,'$.scope.kind')='user' OR json_extract(body,'$.scope.projectId')=?) ORDER BY json_extract(body,'$.updatedAt') DESC").all(projectId).map(decode).filter(o=>
      (!o.task||o.task===task)&&(!o.scope.expiresAt||Date.parse(o.scope.expiresAt)>Date.parse(at))&&
      (o.scope.kind==='user'||(projectId&&o.scope.projectId===projectId&&(o.scope.kind!=='session'||o.scope.sessionId===sessionId))));
  }
  forgetSource(id) {
    const result=this.transaction(()=>{
      if(!this.source(id))throw new Error('Unknown source');
      const affected=this.db.prepare('SELECT id FROM events WHERE source_id=?').all(id).map(e=>e.id);
      const removed=new Set(affected);
      let observations=0;
      for(const observation of this.db.prepare('SELECT body FROM observations').all().map(decode)) {
        if(!observation.evidenceIds.some(e=>removed.has(e)))continue;
        // Erase historical copies too; do not leave source-derived rules in rollback payloads.
        this.db.prepare('DELETE FROM changes WHERE observation_id=?').run(observation.id);
        if(observation.origin==='user-edit') {
          const remaining=observation.evidenceIds.filter(e=>!removed.has(e));
          const retained=remaining.map(key=>this.getEvent(key)).filter(Boolean);
          const next={...observation,evidenceIds:remaining,evidenceSupport:evidenceSupport(retained),sourceKinds:[...new Set(retained.map(e=>this.source(e.sourceId)?.kind))],supportCount:new Set(retained.map(e=>e.fingerprint)).size,updatedAt:stamp()};
          this.db.prepare('UPDATE observations SET body=? WHERE id=?').run(JSON.stringify(next),next.id);
        } else {this.db.prepare('DELETE FROM observations WHERE id=?').run(observation.id);observations++;}
      }
      this.db.prepare('DELETE FROM analyses').run();
      this.db.prepare("DELETE FROM settings WHERE key LIKE 'analysis-cursor:%'").run();
      const removedProject=this.source(id).projectId;
      forgetModeEvidence(this,affected,id);
      this.db.prepare('DELETE FROM sources WHERE id=?').run(id);
      if(!this.sources().some(source=>source.projectId===removedProject)){
        const catalog=JSON.parse(this.setting('project_catalog')??'[]');
        this.set('project_catalog',JSON.stringify(catalog.filter(project=>project.id!==removedProject)));
      }
      this.set('memory_revision',this.revision+1);
      return {removedEvents:affected.length,removedObservations:observations,revision:this.revision};
    });
    this.db.exec('VACUUM');
    return result;
  }
  purgeExpiredContent(at=stamp()) {
    if(!this.db)return 0;
    return this.transaction(()=>{
      let count=0;
      for(const row of this.db.prepare('SELECT id,body FROM events WHERE content_expires_at<? AND content IS NOT NULL').all(at)) {
          const body=decode(row);
          this.db.prepare('UPDATE events SET content=NULL,content_expires_at=NULL,body=? WHERE id=?').run(JSON.stringify({...body,content:undefined,contentExpired:true}),row.id);count++;
      }
      if(count)this.db.prepare('DELETE FROM analyses').run();
      return count;
    });
  }
  summary() {
    if(!this.db)return {initialized:false,clientMode:false,revision:0,sources:0,events:0,observations:0,approved:0};
    const count=table=>Number(this.db.prepare('SELECT count(*) AS n FROM '+table).get().n);
    return {initialized:true,clientMode:this.clientMode,revision:this.revision,sources:count('sources'),events:count('events'),observations:count('observations'),approved:Number(this.db.prepare("SELECT count(*) AS n FROM observations WHERE status='approved'").get().n)};
  }
}

export async function withActivityStore(directory,action,{create=false}={}) {
  const store=new ActivityStore(directory,{create});
  try{return await action(store);}finally{store.close();}
}
