/** Conservative screens for imported requests, never a substitute for human review. */
import {cleanUserText} from './insights.mjs';
import {preferenceSafetyIssue} from '@articulate/core';
import {safeRule} from '../../../packages/storage-local/src/activity-schema.js';
export function preferenceIssue(rule) {
  const safety=preferenceSafetyIssue(rule);if(safety)return safety;
  if(/\b(?:permissions?|authorization|credentials?|cross[- ]session|permission laundering|(?:host|client|MCP) (?:configuration|config|settings))\b|\b(?:CLAUDE|AGENTS)\.md\b/i.test(rule))return 'host_authority_boundary';
  if(/\b(?:highly|less|more|low|superior|inferior)\s+intelligen\w*|\b(?:IQ|intelligence score|cognitive ability|cognitive ranking|fixed learning style)\b/i.test(rule))return 'unsupported_personal_trait';
  if(/[:;]\s*$/.test(rule))return 'unfinished_fragment';
  if(/^(?:please\s+)?always\s+(?:check|inspect)(?:\s+first)?[.!]?$/i.test(rule.trim()))return 'unspecified_action';
  if(/\\[nrt"]|CallDynamicTool|articulate_status|mcp__|inputSchema|developer_instructions|when the person asks to use|<\/?(?:tools|system|developer|environment_context|skills_instructions)\b/i.test(rule))return 'host_or_tool_boilerplate';
  return null;
}
export function preferenceText(content) {
  const cleaned=cleanUserText(content);
  if(cleaned.excluded)return '';
  return cleaned.text.replace(/<(tools|system|developer|user_instructions|permissions_instructions)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
}
export const applicableRule=observation=>{try{safeRule(observation.rule);}catch{return false;}return observation.origin==='user-edit'||!preferenceIssue(observation.rule);};

/** Conservative grounding screen, not a semantic or usefulness guarantee.
 * A one-time task cannot become durable memory just because a model cites it.
 */
export function durablePreferenceEvidence(content) {
  return /\b(?:I|we)\s+(?:prefer|like explanations|want replies)\b|\b(?:always|never|whenever)\b|\b(?:from now on|going forward|every time|future (?:work|replies|responses|explanations|collaboration)|remember (?:to|that|my)|when (?:debugging|reviewing|explaining)|for code reviews)\b/i.test(preferenceText(content??''));
}

/** Only the person's own requests can support a durable collaboration preference. */
export function preferenceEvidence(events) {
  return events.filter(e=>e.role==='user'&&(!e.kind||['message','correction'].includes(e.kind))).map(e=>({...e,content:preferenceText(e.content??'')})).filter(e=>e.content.trim()&&!/\b(?:for (?:this|the current) (?:reply|response|answer|task|session) only|just this once|one[- ]off request|(?:do not|don't|never) (?:save|remember|store) (?:this|that|it) (?:as a |as my |as an? ongoing )?(?:preference|rule|habit))\b/i.test(e.content));
}
