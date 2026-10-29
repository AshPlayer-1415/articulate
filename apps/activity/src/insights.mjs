import {digest,redact} from '../../../packages/storage-local/src/activity-schema.js';

// Descriptive message statistics. These patterns do not assess personality,
// intelligence, mental health, learning rate or the quality of the person's work.
export const INSIGHT_PATTERNS=[
  {id:'gratitude',label:'Thank-you wording',expression:/\b(?:thank\s+you|thanks|thankyou|tysm|appreciate\s+(?:it|that|your\s+help))\b/gi},
  {id:'resume',label:'Continue/resume wording',expression:/\b(?:continue|resume|carry\s+on|pick\s+up\s+where|where\s+(?:we|you)\s+(?:left|hit)|hit\s+(?:the\s+)?limits?)\b/gi},
  {id:'proceed',label:'Go-ahead wording',expression:/\b(?:go\s+ahead|let'?s\s+(?:go|do\s+it)|proceed|do\s+it|keep\s+going)\b/gi},
  {id:'verification',label:'Testing/verification wording',expression:/\b(?:verif(?:y|ication)|test(?:s|ing)?|proof|check\s+(?:it|that|whether|if|the\s+result)|actually\s+(?:work|did|run))\b/gi},
  {id:'correction',label:'Correction wording',expression:/\b(?:that'?s\s+not\s+what|not\s+what\s+i\s+(?:asked|meant|wanted)|i\s+meant|you\s+(?:missed|forgot|misunderstood)|instead\s+of|don'?t\s+(?:do|change|ask)|do\s+not\s+(?:do|change|ask))\b/gi},
  {id:'blocked',label:'Problem/blocked wording',expression:/\b(?:not\s+working|doesn'?t\s+work|still\s+(?:broken|failing)|error|crash(?:ed|ing)?|stuck|blocked|hit\s+(?:the\s+)?limit)\b/gi},
  {id:'emphatic',label:'Explicit frustration/profanity wording',expression:/\b(?:wtf|what\s+the\s+(?:fuck|hell)|fuck(?:ing)?|bullshit|frustrat(?:ed|ing|ion)|annoy(?:ed|ing)|are\s+you\s+(?:kidding|serious))\b/gi}
];

export function cleanUserText(input) {
  let text=String(input??'');
  const transformations=[];
  // Only unwrap a recognizable host envelope, never arbitrary quoted XML.
  if(/^\s*(?:\[[^\n]{0,300}\]\s*)*<(?:user_query|user_info|system_reminder|system-reminder)\b/i.test(text)) {
    const matches=[...text.matchAll(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/gi)];
    if(matches.length===1){text=matches[0][1];transformations.push('user_query_envelope');}
    else if(matches.length>1)return {text:'',excluded:'ambiguous_user_envelope',transformations};
  }
  if(/(?:^|\n)#{1,3}\s*My request:\s*/i.test(text)) {
    text=text.split(/(?:^|\n)#{1,3}\s*My request:\s*/i).at(-1);transformations.push('attachment_request_section');
  }
  if(/#\s*AGENTS\.md instructions|<environment_context>|<skills_instructions>|<developer_instructions>|<app-context>/i.test(text))return {text:'',excluded:'host_context',transformations};
  text=text.replace(/```[\s\S]*?(?:```|$)/g,' ')
    .replace(/^\s*>.*$/gm,' ')
    .replace(/<(?:system_reminder|system-reminder|attached_files|tools|system|developer|user_rules|user_instructions|permissions_instructions)\b[^>]*>[\s\S]*?<\/(?:system_reminder|system-reminder|attached_files|tools|system|developer|user_rules|user_instructions|permissions_instructions)>/gi,' ')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();
  if(/^\[Request interrupted by user(?: for tool use)?\]$/i.test(text))return {text:'',excluded:'control_message',transformations};
  return {text:redact(text),excluded:text?'':'empty_after_cleaning',transformations};
}

const normalized=text=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').replace(/[.!?]+$/,'').trim();
const excerpt=(text,index=0)=>{const start=Math.max(0,index-100);return (start?'… ':'')+text.slice(start,start+280).replace(/\s+/g,' ');};
function timeValue(value) {
  if(typeof value==='number')return value<1e11?value*1000:value;
  if(typeof value==='string'&&/^\d{10}(?:\.\d+)?$/.test(value))return Number(value)*1000;
  if(typeof value==='string'&&/^\d{13}$/.test(value))return Number(value);
  return Date.parse(value??'');
}

export function analyzeUserActivity(events,{includeExamples=false,top=10}={}) {
  if(!Number.isInteger(top)||top<1||top>50)throw new Error('Choose 1–50 report entries');
  const report={schemaVersion:1,method:'descriptive-user-message-patterns-v1',userRecordsSeen:0,analyzedMessages:0,excluded:{},agents:Object.create(null),datedMessages:0,unknownDateMessages:0,dateRange:{from:null,to:null},months:{},totalCharacters:0,
    patterns:INSIGHT_PATTERNS.map(p=>({id:p.id,label:p.label,messages:0,occurrences:0,sessions:0,...(includeExamples?{examples:[]}: {})})),repeatedPrompts:[],emphaticCandidates:[],
    approvedPreferencesCreated:0,limitations:['Counts describe available user-role text, not all device activity or proof that every record was typed directly by the owner.','Known host context, code fences and block quotes are excluded; quotes, templates and missing history can still affect counts.','A wording match is not a personality or emotion diagnosis. Problem/error wording is separate from explicit frustration wording.','Frequency does not establish a durable preference, intelligence, learning rate or improved outcomes.','No model or network request is made by this descriptive analyzer.']};
  const seen=new Set(),sessions=new Set(),patternSessions=new Map(),repeated=new Map(),lengths=[];
  for(const e of events) {
    if(e.role!=='user')continue;
    report.userRecordsSeen++;
    if(e.id&&seen.has(e.id)){report.excluded.duplicate_id=(report.excluded.duplicate_id??0)+1;continue;}if(e.id)seen.add(e.id);
    const cleaned=cleanUserText(e.content);
    if(cleaned.excluded){report.excluded[cleaned.excluded]=(report.excluded[cleaned.excluded]??0)+1;continue;}
    const text=cleaned.text,session=String(e.sessionId??'unknown'),agent=e.agent??e.metadata?.agent??'unknown';
    const sessionKey=agent+':'+session;sessions.add(sessionKey);report.analyzedMessages++;report.agents[agent]=(report.agents[agent]??0)+1;report.totalCharacters+=text.length;lengths.push(text.length);
    const parsed=timeValue(e.timestamp);
    if(Number.isFinite(parsed)&&parsed>=Date.parse('2000-01-01')&&parsed<=Date.now()+86400000){const iso=new Date(parsed).toISOString();report.datedMessages++;if(!report.dateRange.from||iso<report.dateRange.from)report.dateRange.from=iso;if(!report.dateRange.to||iso>report.dateRange.to)report.dateRange.to=iso;const month=iso.slice(0,7);report.months[month]=(report.months[month]??0)+1;}else report.unknownDateMessages++;
    const evidenceId=e.id??'message-'+digest(agent+session+text).slice(0,24);
    for(const pattern of INSIGHT_PATTERNS){const matches=[...text.matchAll(new RegExp(pattern.expression.source,pattern.expression.flags))],hits=matches.length;if(!hits)continue;
      const row=report.patterns.find(p=>p.id===pattern.id);row.messages++;row.occurrences+=hits;
      if(!patternSessions.has(pattern.id))patternSessions.set(pattern.id,new Set());patternSessions.get(pattern.id).add(sessionKey);
      if(includeExamples&&row.examples.length<top)row.examples.push({evidenceId,agent,excerpt:excerpt(text,matches[0].index)});
      if(pattern.id==='emphatic'&&includeExamples)report.emphaticCandidates.push({evidenceId,agent,lexicalHits:hits,excerpt:excerpt(text,matches[0].index),label:'Wording candidate; not a measured emotional state'});
    }
    const key=normalized(text);if(key.length>1&&key.length<=300){const row=repeated.get(key)??{text:includeExamples?excerpt(text):undefined,fingerprint:digest(key),count:0,sessions:new Set(),agents:new Set()};row.count++;row.sessions.add(sessionKey);row.agents.add(agent);repeated.set(key,row);}
  }
  for(const row of report.patterns)row.sessions=patternSessions.get(row.id)?.size??0;
  report.sessionsWithAnalyzedMessages=sessions.size;lengths.sort((a,b)=>a-b);report.medianCharacters=lengths.length?lengths[Math.floor(lengths.length/2)]:0;
  report.repeatedPrompts=[...repeated.values()].filter(r=>r.count>1).sort((a,b)=>b.count-a.count||a.fingerprint.localeCompare(b.fingerprint)).slice(0,top).map(r=>({...r,sessions:r.sessions.size,agents:[...r.agents].sort()}));
  report.emphaticCandidates.sort((a,b)=>b.lexicalHits-a.lexicalHits);report.emphaticCandidates=report.emphaticCandidates.slice(0,includeExamples?top:0);
  return report;
}

const plain=value=>String(value).replace(/[\r\n]/g,' ').replace(/[\[\]<>`*_]/g,'');
export function insightsMarkdown(report) {
  const lines=['# Your local activity patterns','',`${report.analyzedMessages.toLocaleString('en-US')} messages analyzed across ${report.sessionsWithAnalyzedMessages} sessions. These are descriptive patterns and review candidates; no preferences were approved.`,'',`Available dates: ${report.dateRange.from??'unknown'} to ${report.dateRange.to??'unknown'}; ${report.unknownDateMessages} messages have no reliable date.`,'','## Wording patterns','',...report.patterns.map(p=>`- ${p.label}: ${p.messages} messages, ${p.occurrences} matches, ${p.sessions} sessions.`),'','## Repeated prompts','',...report.repeatedPrompts.map(p=>`- ${p.count} times across ${p.sessions} sessions: ${p.text?plain(p.text):p.fingerprint}`),'','## Emphatic wording to review','',...report.emphaticCandidates.map(p=>`- ${p.lexicalHits} explicit wording matches (${plain(p.agent)}): ${plain(p.excerpt)}`),'','## Limits','',...report.limitations.map(s=>'- '+s),''];
  return lines.join('\n');
}
