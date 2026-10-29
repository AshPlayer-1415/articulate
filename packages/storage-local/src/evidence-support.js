import {digest} from './activity-schema.js';

/** Descriptive support, never statistical confidence or permission to activate.
 * Source/session pairs are namespaces. Copies with identical text cannot by
 * themselves establish independent support, even across different clients.
 */
export function evidenceSupport(events) {
  const users=events.filter(e=>e.role==='user');
  const requests=new Set(users.map(e=>e.fingerprint??digest(String(e.content??'').replace(/\s+/g,' ').trim())));
  const sessions=new Set(users.map(e=>JSON.stringify([e.sourceId??e.agent??'unknown',e.sessionId])));
  const dated=users.filter(e=>e.timestamp&&Number.isFinite(Date.parse(e.timestamp)));
  return {userMessages:users.length,sessions:sessions.size,distinctRequests:requests.size,
    independentSupportUpperBound:Math.min(sessions.size,requests.size),
    unknownDates:users.length-dated.length,
    firstSeen:dated.length?new Date(Math.min(...dated.map(e=>Date.parse(e.timestamp)))).toISOString():null,
    lastSeen:dated.length?new Date(Math.max(...dated.map(e=>Date.parse(e.timestamp)))).toISOString():null,
    recurringPreferenceEstablished:false,
    limitation:'Counts describe cited evidence only. Copies, semantic equivalence, conflicts and lasting intent require review; task repetition is not a durable preference.'};
}
