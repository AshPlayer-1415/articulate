import { type ArticulateProfile } from "./schema.ts";
import { resolvePolicy } from "./policy.ts";
import { COMPARISON_STIMULI, type ComparisonId } from "./stimuli.ts";

/** Exact-facts, no-model before/after layout demonstration.
 * This demonstrates output STRUCTURE, not validated comprehension gain. */
export function createComparisonPreview(profile: ArticulateProfile, topic: ComparisonId = "comparison"): {
  title: string;
  standard: string;
  adapted: string;
  appliedRules: string[];
  canonicalFacts: readonly string[];
} {
  const content = COMPARISON_STIMULI[topic];
  const facts = content.canonicalFacts;
  const policy = resolvePolicy(profile, "concept");
  const overview = policy.instructions.some(x => x.startsWith("Begin with the overall"));
  const steps = policy.instructions.some(x => x.startsWith("Begin with actionable steps"));
  const visual = policy.instructions.some(x => x.includes("diagram or table"));
  const first = [facts[0], facts[1]];
  const rest = [...facts.slice(2)];
  const formatGroup = (heading: string, claims: readonly string[]) =>
    "### " + heading + "\n" + claims.map(c => "- " + c).join("\n");
  const secondHeading = topic === "comparison" ? "Worked example" : "What happens";
  const sections = steps
    ? [formatGroup(topic === "comparison" ? "Worked steps" : "Sequence", rest), formatGroup("How it works", first)]
    : [formatGroup(overview ? "Big picture" : "Core concept", first), formatGroup(secondHeading, rest)];
  const diagrams: Record<ComparisonId, string> = {
    comparison: "factorial(3) → factorial(2) → factorial(1) → base case",
    format: "Client → request → Server (processes request) → response → Client",
    photosynthesis: "Light + carbon dioxide + water → plant sugars + released oxygen"
  };
  if (visual) sections.push("### Structural overview\n`" + diagrams[topic] + "`");
  return {
    title: content.concept,
    standard: facts.join(" "),
    adapted: sections.join("\n\n"),
    appliedRules: policy.instructions,
    canonicalFacts: facts
  };
}
