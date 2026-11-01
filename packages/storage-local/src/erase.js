import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {lstat,rm} from 'node:fs/promises';
import path from 'node:path';

/** Called under the trusted local profile lock. Logical erasure is not forensic
 * wiping, and cannot recall data already processed by an independent provider.
 */
export async function eraseManagedData(directory){
 const database=path.join(directory,'activity.sqlite');let db,cleared=false;
 try{
  let stat;try{stat=await lstat(database);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(stat?.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1){
   try{db=new DatabaseSync(database,{timeout:5000});db.exec('PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;');const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));db.exec('BEGIN IMMEDIATE');
    try{for(const table of ['mode_selections','mode_defaults','work_modes','clients','sources','observations','changes','analyses','settings'])if(tables.has(table))db.exec('DELETE FROM '+table);if(tables.has('settings')){db.prepare('INSERT INTO settings VALUES(?,?)').run('memory_revision','0');db.prepare('INSERT INTO settings VALUES(?,?)').run('store_generation',randomUUID());}db.exec('COMMIT');cleared=true;}catch(e){db.exec('ROLLBACK');throw e;}
    try{db.exec('VACUUM');}catch{/* Logical deletion is committed; live readers can postpone compaction. */}
   }catch(error){if(/locked|busy/i.test(error.message))throw new Error('Articulate data is busy. Stop running imports/analysis and close agents, then retry erasure.');if(!/not a database|malformed|corrupt/i.test(error.message))throw new Error('Unable to clear local Articulate storage; close agents and retry.');}
  }
 }finally{db?.close();}
 let emptyDatabaseRetained=false;
 for(const name of ['profile.json','assessment-session.json','.assessment-checkpoint.json','activity.sqlite','activity.sqlite-journal','activity.sqlite-wal','activity.sqlite-shm','client-credentials','connections','analysis.json','analysis.md','config-backups']){
  try{await rm(path.join(directory,name),{force:true,recursive:['client-credentials','connections','config-backups'].includes(name)});}catch(error){if(name.startsWith('activity.sqlite')&&cleared&&['EBUSY','EPERM','EACCES'].includes(error.code)){emptyDatabaseRetained=true;continue;}throw new Error('Unable to remove some local Articulate files. Close connected agents and retry erasure.');}
 }
 return {deleted:true,emptyDatabaseRetained,note:emptyDatabaseRetained?'Contents erased; an active process kept an empty SQLite file open. Close agents and run erase again to remove it.':'Managed profile, activity, mode/workflow history, caches, grants and credentials erased. Original histories, independent exports and provider copies remain.'};
}
