import {DatabaseSync} from 'node:sqlite';
import {lstat} from 'node:fs/promises';
import path from 'node:path';
import {analyzeUserActivity} from './insights.mjs';

/** Read existing retained, approved-source content without refreshing or purging it. */
export async function insightsFromStore(directory,{includeExamples=false,projectId=null,limit=100000,now=new Date().toISOString()}={}) {
  if(!Number.isInteger(limit)||limit<1||limit>1000000)throw new Error('Insights limit must be 1–1000000 messages');
  if(typeof now!=='string'||!Number.isFinite(Date.parse(now)))throw new Error('Choose a valid insights date');
  const file=path.join(directory,'activity.sqlite');
  let stat;try{stat=await lstat(file);}catch(error){if(error.code!=='ENOENT')throw error;return {...analyzeUserActivity([],{includeExamples}),coverage:{source:'existing_approved_store',initialized:false,scannedSources:false}};}
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Select a regular local activity database');
  const db=new DatabaseSync(file,{readOnly:true});
  try {
    db.exec('BEGIN');
    const eligible="events.role='user' AND events.content IS NOT NULL AND events.content_expires_at>? AND json_extract(sources.body,'$.retainContent')=1 AND COALESCE(json_extract(sources.body,'$.paused'),0)=0 AND (? IS NULL OR events.project_id=?)";
    const total=db.prepare("SELECT count(*) AS n FROM events WHERE role='user' AND (? IS NULL OR project_id=?)").get(projectId,projectId).n;
    const available=db.prepare('SELECT count(*) AS n FROM events JOIN sources ON sources.id=events.source_id WHERE '+eligible).get(now,projectId,projectId).n;
    const query=db.prepare("SELECT events.id,events.session_id,events.project_id,events.content,json_extract(events.body,'$.timestamp') AS at,json_extract(sources.body,'$.kind') AS agent FROM events JOIN sources ON sources.id=events.source_id WHERE "+eligible+' ORDER BY events.rowid LIMIT ?');
    function* events(){for(const r of query.iterate(now,projectId,projectId,limit))yield {id:r.id,role:'user',sessionId:r.session_id,projectId:r.project_id,content:r.content,timestamp:r.at,agent:r.agent};}
    const report=analyzeUserActivity(events(),{includeExamples});
    report.coverage={source:'existing_approved_store',initialized:true,importedUserRecords:total,eligibleRetainedUserRecords:available,unavailableUserRecords:total-available,limitReached:available>limit,scannedSources:false,profileChanged:false,rawHistoryShared:false};
    db.exec('COMMIT');return report;
  }finally{db.close();}
}
