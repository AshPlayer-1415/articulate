import { type Dimension, type Evidence, type EvidenceSource } from "./schema.ts";

export type QuestionKind =
  | "likert"
  | "single_choice"
  | "multi_choice"
  | "free_text"
  | "comprehension"
  | "sentence_preference"
  | "cloze_choice"
  | "structure_compare";

export interface Choice {
  id: string;
  label: string;
  /** Optional longer body for structure/sentence comparisons (must keep facts aligned across options). */
  text?: string;
  evidence?: Partial<Record<Dimension, number>>;
}
export interface Question {
  id: string;
  kind: QuestionKind;
  prompt: string;
  dimension?: Dimension;
  reverse?: boolean;
  choices?: readonly Choice[];
  guidance?: string;
}

/**
 * Research-inspired original items. These are NOT licensed reproductions of
 * Pask, Need for Cognition, Budner, or other established instrument items.
 * Difficulty and delivery should be validated before claims of effectiveness.
 */
export const ASSESSMENT: readonly Question[] = [
  {
    id: "background",
    kind: "free_text",
    prompt: "Briefly, what do you usually use AI help for (work, studies, building, hobbies), and how deep do you already go in those topics?",
    guidance: "Context only — not a student requirement. Skip allowed."
  },
  {
    id: "overview",
    kind: "likert",
    dimension: "overview_first",
    prompt: "I understand unfamiliar ideas better when I see the overall purpose before the individual steps. (1–5)"
  },
  {
    id: "depth",
    kind: "likert",
    dimension: "detail_level",
    prompt: "For difficult concepts, I prefer enough detail to inspect the full explanation rather than a short summary. (1–5)"
  },
  {
    id: "organization",
    kind: "single_choice",
    prompt: "A new algorithm is confusing. Which opening would you try first?",
    choices: [
      { id: "a", label: "A small worked example, then generalize", evidence: { example_preference: 1 } },
      { id: "b", label: "A map of how the pieces connect", evidence: { overview_first: 1, visual_structure: 0.85 } },
      { id: "c", label: "An ordered sequence of operations", evidence: { overview_first: 0.1, scaffolding: 0.85 } }
    ]
  },
  {
    id: "format",
    kind: "single_choice",
    prompt: "For the same technical concept, which representation would you want to try first?",
    guidance: "In the final UI, display equivalently informative, randomized A/B/C examples.",
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
    prompt: "I learn a new idea best when the explanation invites me to answer small questions along the way. (1–5)"
  },
  {
    id: "uncertainty",
    kind: "free_text",
    prompt: "When a topic has exceptions or uncertain evidence, how should an explanation communicate that?",
    guidance: "Preserve actual uncertainty regardless of preference. Never infer intolerance from wording alone."
  },
  {
    id: "cloze",
    kind: "free_text",
    prompt: "Complete this sentence in your own words: 'A function is like ___ because ___.'",
    guidance: "Do not infer verbal/visual cognitive traits from one metaphor or word choice."
  },
  {
    id: "comparison",
    kind: "single_choice",
    prompt: "After seeing equal-information explanations in three styles, which one was clearest?",
    guidance: "UI must randomize order and hold factual content/difficulty constant.",
    choices: [
      { id: "a", label: "Overview / relationships", evidence: { overview_first: 0.95 } },
      { id: "b", label: "Sequential steps", evidence: { overview_first: 0.05, scaffolding: 0.8 } },
      { id: "c", label: "Concrete example", evidence: { example_preference: 0.95 } }
    ]
  },
  {
    id: "transfer",
    kind: "comprehension",
    prompt: "Try a new example: factorial(4) = 4 × factorial(3). What is factorial(4)?",
    guidance: "This checks one near-transfer application; it does not estimate ability or change style scores.",
    choices: [
      { id: "a", label: "6" },
      { id: "b", label: "12" },
      { id: "c", label: "24" },
      { id: "d", label: "48" }
    ]
  }
] as const;

export type Answer = string | readonly string[] | number;

/** Produce explicit preference evidence only. Free text / transfer never imply traits. */
export function interpretAnswer(question: Question, answer: Answer, timestamp: string, attemptId: string): Evidence[] {
  const result: Evidence[] = [];
  function add(dimension: Dimension, score: number, source: EvidenceSource, reliability: number) {
    result.push({
      itemId: attemptId + "/" + question.id, dimension, score, reliability, source, timestamp
    });
  }
  if (question.kind === "likert") {
    if (!Number.isInteger(answer) || typeof answer !== "number" || answer < 1 || answer > 5 || !question.dimension)
      throw new Error("Likert requires an integer from 1 to 5");
    const score = (answer - 1) / 4;
    add(question.dimension, question.reverse ? 1 - score : score, "likert", 0.55);
  }
  const choiceKinds = new Set<QuestionKind>([
    "single_choice", "multi_choice", "sentence_preference", "cloze_choice", "structure_compare"
  ]);
  if (choiceKinds.has(question.kind)) {
    const ids = question.kind === "multi_choice" ? answer : [answer];
    if (!Array.isArray(ids) || ids.length === 0 ||
        ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length)
      throw new Error("Invalid selected options");
    if (question.kind !== "multi_choice" && ids.length !== 1) throw new Error("Choose one option");
    const choices = ids.map(id => question.choices?.find(o => o.id === id));
    if (choices.some(c => !c)) throw new Error("Unknown option");
    const dimensions = new Map<Dimension, number[]>();
    for (const choice of choices) {
      for (const [d, score] of Object.entries(choice!.evidence ?? {})) {
        const scores = dimensions.get(d as Dimension) ?? [];
        scores.push(score as number);
        dimensions.set(d as Dimension, scores);
      }
    }
    const source: EvidenceSource = question.kind === "multi_choice" ? "multi_choice" : "single_choice";
    const reliability = question.kind === "multi_choice" ? 0.35 : 0.65;
    for (const [d, scores] of dimensions) {
      add(d, scores.reduce((n, s) => n + s, 0) / scores.length, source, reliability);
    }
  }
  return result;
}
