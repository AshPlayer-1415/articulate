import { type Question } from "./assessment.ts";
import { ASSESSMENT } from "./assessment.ts";

/**
 * Agent-native bank (product contract v1). Same length as classic for shared
 * session progress math; kinds emphasize preference formats over free metaphor.
 * Canonical wording is the fallback when the host does not personalize surfaces.
 */
export const AGENT_ASSESSMENT_V1: readonly Question[] = [
  {
    id: "background",
    kind: "free_text",
    prompt: "In a sentence: what do you usually ask AI to help with (building, debugging, research, writing, hobbies…), and how deep do you already go?",
    guidance: "Optional context — not a student requirement. Skip allowed. Prefer host-memory / role summary when the user allows it."
  },
  {
    id: "sentence_open",
    kind: "sentence_preference",
    prompt: "Same idea about using a new API. Which opening sentence would you rather see first?",
    choices: [
      {
        id: "a",
        label: "An API lets a client ask a server to do work and return a result.",
        evidence: { overview_first: 0.85, detail_level: 0.35 }
      },
      {
        id: "b",
        label: "Example: your app sends GET /users/42; the server returns that user’s JSON.",
        evidence: { example_preference: 1, overview_first: 0.4 }
      },
      {
        id: "c",
        label: "Step 1: client builds a request. Step 2: server handles it. Step 3: client reads the response.",
        evidence: { scaffolding: 0.95, overview_first: 0.15 }
      }
    ]
  },
  {
    id: "overview",
    kind: "likert",
    dimension: "overview_first",
    prompt: "When AI introduces an unfamiliar idea, I want the overall purpose before the individual steps. (1–5)"
  },
  {
    id: "organization",
    kind: "single_choice",
    prompt: "A new technical idea is confusing. Which opening would you try first?",
    choices: [
      { id: "a", label: "A small worked example, then generalize", evidence: { example_preference: 1 } },
      { id: "b", label: "A map of how the pieces connect", evidence: { overview_first: 1, visual_structure: 0.85 } },
      { id: "c", label: "An ordered sequence of operations", evidence: { overview_first: 0.1, scaffolding: 0.85 } }
    ]
  },
  {
    id: "format",
    kind: "structure_compare",
    prompt: "For the same technical concept, which representation would you want to try first?",
    guidance: "Host must keep factual content identical across options; only packaging may differ.",
    choices: [
      { id: "a", label: "Clear prose", evidence: { visual_structure: 0.1 } },
      { id: "b", label: "Labeled relationship diagram", evidence: { visual_structure: 1 } },
      { id: "c", label: "Text combined with a diagram", evidence: { visual_structure: 0.75 } }
    ]
  },
  {
    id: "components",
    kind: "multi_choice",
    prompt: "Select ALL features that would help in a first explanation:",
    choices: [
      { id: "a", label: "Definitions and key facts", evidence: { detail_level: 0.75 } },
      { id: "b", label: "An everyday analogy", evidence: { example_preference: 0.85 } },
      { id: "c", label: "A flow diagram", evidence: { visual_structure: 0.95 } },
      { id: "d", label: "A worked example", evidence: { example_preference: 1 } },
      { id: "e", label: "A step-by-step checklist", evidence: { scaffolding: 0.9 } }
    ]
  },
  {
    id: "guidance",
    kind: "likert",
    dimension: "scaffolding",
    prompt: "When a problem is difficult, I want explicit intermediate steps rather than figuring out the path myself. (1–5)"
  },
  {
    id: "interaction",
    kind: "likert",
    dimension: "interaction_level",
    prompt: "I get more from an answer when it invites me to answer small questions along the way. (1–5)"
  },
  {
    id: "uncertainty",
    kind: "cloze_choice",
    prompt: "When a topic has exceptions or uncertain evidence, an explanation should ___ first.",
    guidance: "Live answers must still preserve uncertainty regardless of preference.",
    choices: [
      { id: "a", label: "state what is known vs unknown before details", evidence: { detail_level: 0.55, overview_first: 0.7 } },
      { id: "b", label: "give the main story, then list caveats in a short box", evidence: { overview_first: 0.8, scaffolding: 0.55 } },
      { id: "c", label: "walk through a confident example, then mark where it may not apply", evidence: { example_preference: 0.85 } }
    ]
  },
  {
    id: "cloze",
    kind: "cloze_choice",
    prompt: "Complete: “When I get stuck, I want the assistant to ___.”",
    guidance: "Do not infer intelligence or learning disability from this choice.",
    choices: [
      { id: "a", label: "ask a quick check question, then continue", evidence: { interaction_level: 1 } },
      { id: "b", label: "show a worked example parallel to my problem", evidence: { example_preference: 0.95 } },
      { id: "c", label: "give a checklist of next steps", evidence: { scaffolding: 0.95 } },
      { id: "d", label: "redraw the big picture, then zoom in", evidence: { overview_first: 0.9, visual_structure: 0.6 } }
    ]
  },
  {
    id: "comparison",
    kind: "structure_compare",
    prompt: "After seeing equal-information explanations in three styles, which one was clearest?",
    guidance: "UI/host must randomize order and hold factual content constant.",
    choices: [
      { id: "a", label: "Overview / relationships", evidence: { overview_first: 0.95 } },
      { id: "b", label: "Sequential steps", evidence: { overview_first: 0.05, scaffolding: 0.8 } },
      { id: "c", label: "Concrete example", evidence: { example_preference: 0.95 } }
    ]
  },
  {
    id: "transfer",
    kind: "comprehension",
    prompt: "Quick check (not scored as ability): factorial(4) = 4 × factorial(3). What is factorial(4)?",
    guidance: "Near-transfer only; does not estimate ability or change style scores.",
    choices: [
      { id: "a", label: "6" },
      { id: "b", label: "12" },
      { id: "c", label: "24" },
      { id: "d", label: "48" }
    ]
  }
] as const;

/**
 * Habit-first short bank (product v0.2). Equal-fact preference probes only;
 * host memory seeds weak priors so likerts become optional.
 */
function agentV1Item(id: string): Question {
  const item = AGENT_ASSESSMENT_V1.find(q => q.id === id);
  if (!item) throw new Error("Missing agent_v1 item " + id);
  return item;
}

export const AGENT_ASSESSMENT_V2: readonly Question[] = [
  agentV1Item("background"),
  agentV1Item("sentence_open"),
  agentV1Item("organization"),
  agentV1Item("format"),
  agentV1Item("cloze"),
  agentV1Item("comparison")
];

export const ASSESSMENT_BANKS = {
  classic: ASSESSMENT,
  agent_v1: AGENT_ASSESSMENT_V1,
  agent_v2: AGENT_ASSESSMENT_V2
} as const;

export type AssessmentBankId = keyof typeof ASSESSMENT_BANKS;

export function getAssessmentBank(bankId: AssessmentBankId = "classic"): readonly Question[] {
  return ASSESSMENT_BANKS[bankId];
}

export const AGENT_STAGES = [
  { id: "background", title: "Background", questionIds: ["background"] },
  {
    id: "preferences",
    title: "How you prefer explanations",
    questionIds: ["sentence_open", "overview", "organization", "format", "components"]
  },
  {
    id: "guidance",
    title: "Guidance and reflection",
    questionIds: ["guidance", "interaction", "uncertainty", "cloze"]
  },
  { id: "comparison", title: "Compare and apply", questionIds: ["comparison", "transfer"] }
] as const;

export const AGENT_V2_STAGES = [
  { id: "context", title: "Context", questionIds: ["background"] },
  {
    id: "probes",
    title: "Equal-fact preference probes",
    questionIds: ["sentence_open", "organization", "format", "cloze", "comparison"]
  }
] as const;
