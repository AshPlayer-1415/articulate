import {ActivityStore} from '../src/activity.js';
import {event} from '../src/activity-schema.js';
const [directory,sourceId,worker]=process.argv.slice(2);
const store=new ActivityStore(directory);
try {
  const events=Array.from({length:25},(_,index)=>event({sessionId:'session-'+worker,nativeId:'item-'+index,projectId:'sample',role:'user',kind:'message',content:'Synthetic contribution '+worker+' '+index}));
  store.importBatch(sourceId,events,{fileKey:'worker-'+worker,checkpoint:{complete:true}});
}finally{store.close();}
