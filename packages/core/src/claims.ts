/**
 * Public claim bar (v1.1). Machine-readable product positioning.
 * Preference packaging ≠ proven learning efficacy.
 */

export const CLAIM_BAR_VERSION = "1.1.0";

export const ALLOWED_CLAIMS = [
  "On-device presentation preferences, including response styles the user names.",
  "Presentation preferences must preserve facts, numbers, caveats, safety and uncertainty; host answers still require task-specific verification.",
  "Task-conditioned packaging emphasis (concept, debugging, mathematics, research, shipping).",
  "Opt-in shape micro-recalibration when packaging felt wrong but facts were fine.",
  "Where a host loads the local MCP/extension after install + confirmed profile, policy tools are available in that conversation.",
  "Synthetic fidelity alarms and pilot templates exist; human semantic review is still required."
] as const;

export const FORBIDDEN_CLAIMS = [
  "IQ, ability ranking, diagnosis, or fixed learning-style labels.",
  "Population percentiles, leaderboards, or 'top N% of users'.",
  "Scientifically established learning gains from preference matching alone.",
  "Equating user satisfaction or preference with comprehension or transfer.",
  "Treating CI green, quality literal screens, or dry-run pilot aggregates as efficacy evidence.",
  "Guaranteed factual correctness, immunity to every prompt injection, or improvement of every personalized answer.",
  "Articulate-operated cloud profile sync, telemetry, or account-required profiles.",
  "ChatGPT skills-only pack as a finished native on-device profile connector."
] as const;

export const POSITIONING_MODE = "preferences_only" as const;

export interface ClaimBar {
  version: string;
  positioning: typeof POSITIONING_MODE;
  mayClaim: readonly string[];
  mustNotClaim: readonly string[];
  sessionAvailability: {
    afterInstallAndConfirm: string;
    whenHostCannotAutoAttach: string;
  };
  efficacy: {
    status: "NOT_CLAIMED";
    pathToClaim: string;
  };
  summary: string;
}

/** Stable claim bar for status surfaces and release docs. */
export function getClaimBar(): ClaimBar {
  return {
    version: CLAIM_BAR_VERSION,
    positioning: POSITIONING_MODE,
    mayClaim: ALLOWED_CLAIMS,
    mustNotClaim: FORBIDDEN_CLAIMS,
    sessionAvailability: {
      afterInstallAndConfirm:
        "When the host loads Articulate MCP/tools in a conversation, call articulate_get_policy after the user confirms a named style and sharing is enabled.",
      whenHostCannotAutoAttach:
        "Document the host limit and keep explicit user invoke; do not invent a silent always-on profile leak."
    },
    efficacy: {
      status: "NOT_CLAIMED",
      pathToClaim:
        "Only after a privacy-reviewed pilot per docs/evaluation-protocol.md with predeclared endpoints and human review — never from preference scores alone."
    },
    summary:
      "Articulate packages explanations for this user. It does not prove they learn more. Preferences only until reviewed pilot evidence exists."
  };
}
