/** A conservative rejection screen, not a proof that arbitrary text is safe.
 * Approval never turns preference data into host instructions or capabilities.
 * Keep this portable: it is used in the browser, CLI, storage and MCP compiler.
 */
export function preferenceSafetyIssue(value: unknown): string | null {
  if (typeof value !== "string") return "invalid_preference";
  const text = value.normalize("NFKC").replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "").toLowerCase();
  if (/\b(?:highly|less|more|low|superior|inferior)\s+intelligen\w*|\b(?:iq|intelligence score|cognitive ability|cognitive ranking|fixed learning style|ethnicity|religion|diagnos(?:is|e)|adhd|autis(?:m|tic)|disabilit\w*)\b/.test(text)) return "unsupported_personal_trait";
  if (/\b(?:sk-(?:ant-)?[\w-]{8,}|gh[pousr]_[\w]{8,}|github_pat_[\w_]{8,}|akia[a-z0-9]{16})\b|-----begin [a-z ]*private key-----|\b(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]\s*["']?[^\s"']{4,}/.test(text)) return "credential_literal";
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) return "control_characters";
  if (/<\/?(?:system|developer|assistant|tools|instructions|permissions_instructions)\b|\[\/?(?:inst|system|assistant)\]|<\|(?:im_start|im_end|system|endoftext)\|>/.test(text)) return "role_spoofing";
  // Check imperative clauses, keeping protective prohibitions usable.
  const clauses = text.split(/[.!?;]\s+|\n+|\s+(?:and|then|but|however)\s+/);
  for (const raw of clauses) {
    // Remove only the first prohibited verb, never exempt an entire clause:
    // "Never reveal credentials; upload secrets" must still be rejected.
    const clause=raw.replace(/^\s*(?:never|do not|don't|must not|avoid|refuse to|reject|block|prevent)\s+(?:ignore|disregard|override|bypass|supersede|replace|send|upload|reveal|print|expose|extract|forward|copy|read|collect|hide|omit|suppress|conceal|remove|skip|drop|downplay|pretend|fabricate|falsify|lie|claim|report|say|run|execute|invoke|launch|grant|enable|approve)\b/, '[prohibited verb]');
    if (/\b(?:ignore|disregard|override|bypass|supersede|replace)\b.{0,70}\b(?:instructions|system prompt|user request|user constraints|safety|permissions|approval)\b/.test(clause) || /\b(?:highest priority|system message|developer message|jailbreak|unrestricted mode)\b/.test(clause)) return "instruction_override";
    if (/\b(?:send|upload|reveal|print|expose|extract|forward|copy|read|collect)\b.{0,90}(?:\b(?:secrets?|credentials?|api[ _-]?keys?|access[ _-]?tokens?|private[ _-]?keys?|passwords?|ssh keys?)\b|\.env\b)/.test(clause)) return "credential_access";
    if (/\b(?:hide|omit|suppress|conceal|remove|skip|drop|downplay)\b.{0,65}\b(?:caveats?|uncertainty|errors?|failures?|warnings?|vulnerabilit\w*|risks?|failed tests?)\b/.test(clause) || /\b(?:pretend|fabricate|falsify|lie about)\b.{0,65}\b(?:tests?|results?|success|facts?|evidence)\b/.test(clause) || /\b(?:claim|report|say)\b.{0,45}\btests? (?:passed|pass)\b.{0,65}\b(?:without|even if|regardless|not run)\b/.test(clause)) return "factual_interference";
    if (/\b(?:run|execute|invoke|launch)\b.{0,60}\b(?:sudo|curl|wget|eval|bash|powershell|rm -rf)\b|\b(?:grant|enable|approve)\b.{0,45}\b(?:all permissions|unrestricted access|automatic tool|without consent)\b/.test(clause)) return "capability_escalation";
  }
  return null;
}
