import { ARTICULATE_VERSION } from "./version.ts";
import { type Dimension } from "./schema.ts";
import { type Choice, type QuestionKind } from "./assessment.ts";
import { type AdaptiveItemDraft } from "./adaptive.ts";

/**
 * Host surface kit — how Claude (or another host) should *create* assessment
 * wording from the user’s real prompting habits, while Articulate keeps kinds
 * and scoring maps fixed.
 */

export interface PatternSignal {
  id: string;
  lookFor: string;
  implies: string;
  preferDimensions: readonly Dimension[];
}

export interface SurfaceSlot {
  id: string;
  kind: QuestionKind;
  purpose: string;
  hostMust: string;
  /** Locked evidence per choice id — hosts rewrite labels/prompts, not scores. */
  lockedEvidence?: Record<string, Partial<Record<Dimension, number>>>;
  examplePrompt: string;
  exampleChoices?: readonly { id: string; label: string }[];
}

export interface HostSurfaceKit {
  version: string;
  recommendedFlow: readonly string[];
  patternSignals: readonly PatternSignal[];
  rules: readonly string[];
  slots: readonly SurfaceSlot[];
  /** Minimum adaptive drafts expected when host-memory personalization is on. */
  minPersonalizedSlots: number;
}

const E_SENTENCE = {
  a: { overview_first: 0.85, detail_level: 0.35 },
  b: { example_preference: 1, overview_first: 0.4 },
  c: { scaffolding: 0.95, overview_first: 0.15 }
} as const;

const E_ORG = {
  a: { example_preference: 1 },
  b: { overview_first: 1, visual_structure: 0.85 },
  c: { overview_first: 0.1, scaffolding: 0.85 }
} as const;

const E_FORMAT = {
  a: { visual_structure: 0.1 },
  b: { visual_structure: 1 },
  c: { visual_structure: 0.75 }
} as const;

const E_COMPONENTS = {
  a: { detail_level: 0.75 },
  b: { example_preference: 0.85 },
  c: { visual_structure: 0.95 },
  d: { example_preference: 1 },
  e: { scaffolding: 0.9 }
} as const;

const E_UNCERTAINTY = {
  a: { detail_level: 0.55, overview_first: 0.7 },
  b: { overview_first: 0.8, scaffolding: 0.55 },
  c: { example_preference: 0.85 }
} as const;

const E_CLOZE = {
  a: { interaction_level: 1 },
  b: { example_preference: 0.95 },
  c: { scaffolding: 0.95 },
  d: { overview_first: 0.9, visual_structure: 0.6 }
} as const;

const E_COMPARISON = {
  a: { overview_first: 0.95 },
  b: { overview_first: 0.05, scaffolding: 0.8 },
  c: { example_preference: 0.95 }
} as const;

export const HOST_SURFACE_KIT: HostSurfaceKit = {
  version: ARTICULATE_VERSION,
  recommendedFlow: [
    "Call articulate_status. Follow hostBootstrap (default path named_styles).",
    "Ask: May I read the projects and chats already visible in this host to learn how you want replies written?",
    "If yes: call articulate_pattern_kit, read only that allowed context, show short notes, and call articulate_save_patterns after they approve.",
    "Use articulate_style_kit and articulate_save_styles only for gaps the history does not answer.",
    "Then articulate_get_policy. Optional deeper tune: articulate_start path=habit_first or path=full."
  ],
  patternSignals: [
    {
      id: "example_first",
      lookFor: "show me an example / for instance / concrete / walk through my case",
      implies: "Lean example-first openings and parallel worked cases when stuck.",
      preferDimensions: ["example_preference"]
    },
    {
      id: "map_first",
      lookFor: "big picture / how does this fit / architecture / overview before details",
      implies: "Lead with maps/relationships before steps.",
      preferDimensions: ["overview_first", "visual_structure"]
    },
    {
      id: "steps_first",
      lookFor: "step by step / checklist / numbered / what do I do first",
      implies: "Prefer ordered steps and scaffolding.",
      preferDimensions: ["scaffolding"]
    },
    {
      id: "short_then_deep",
      lookFor: "keep it short / TL;DR / then expand / don’t dump",
      implies: "Compact first pass; detail on request.",
      preferDimensions: ["detail_level"]
    },
    {
      id: "diagrams",
      lookFor: "diagram / ascii / table / flowchart / draw it",
      implies: "Offer structured visuals early.",
      preferDimensions: ["visual_structure"]
    },
    {
      id: "no_quiz",
      lookFor: "just tell me / don’t quiz me / no Socratic",
      implies: "Low interaction_level; continuous explanation.",
      preferDimensions: ["interaction_level"]
    },
    {
      id: "builder_context",
      lookFor: "shipping / PR / production / API / infra / ML ops / debugging",
      implies: "Use their real work domain as the quiz topic — not a classroom vignette.",
      preferDimensions: ["example_preference", "scaffolding"]
    }
  ],
  rules: [
    "Fixed kinds and choice ids stay the same; only prompts/labels/texts change.",
    "Every preference choice must keep the lockedEvidence scores for that slot.",
    "Same facts across structure_compare / sentence_preference options — packaging only.",
    "Never invent IQ, ability, percentiles, or diagnoses.",
    "Do not paste raw chat transcripts into Articulate; only derived wording.",
    "Topic should match how they actually use AI (work, building, research, hobbies) — not ‘what course are you taking’.",
    "If memory is thin, still personalize with a plausible domain they named; otherwise use the canonical bank."
  ],
  minPersonalizedSlots: 5,
  slots: [
    {
      id: "background",
      kind: "free_text",
      purpose: "Optional context; skip-friendly. Prefer host summary of role/domain over ‘what are you learning’.",
      hostMust: "Ask about role/domain and depth of use — not enrollment in a class.",
      examplePrompt: "In a sentence: what do you usually ask AI to help with (building, debugging, research, writing…), and how deep do you already go?"
    },
    {
      id: "sentence_open",
      kind: "sentence_preference",
      purpose: "Which opening packaging they prefer for the same idea.",
      hostMust: "Pick ONE concept from their world. Write three openings with identical facts: purpose / example / steps.",
      lockedEvidence: E_SENTENCE,
      examplePrompt: "Same idea about deploying a model endpoint. Which opening would you rather see first?",
      exampleChoices: [
        { id: "a", label: "A model endpoint lets a client send input and get a prediction back." },
        { id: "b", label: "Example: POST /predict {\"text\":\"…\"} → {\"label\":\"positive\", \"score\":0.91}." },
        { id: "c", label: "Step 1: client builds the request. Step 2: server runs inference. Step 3: client reads the JSON." }
      ]
    },
    {
      id: "overview",
      kind: "likert",
      purpose: "Self-report overview-first preference.",
      hostMust: "Keep dimension overview_first. You may reword for their domain; keep 1–5 rating.",
      examplePrompt: "When AI introduces an unfamiliar idea in my work, I want the overall purpose before the individual steps. (1–5)"
    },
    {
      id: "organization",
      kind: "single_choice",
      purpose: "First move when confused.",
      hostMust: "Keep three options: example → map → ordered steps, with locked evidence.",
      lockedEvidence: E_ORG,
      examplePrompt: "A new system design is confusing. Which opening would you try first?",
      exampleChoices: [
        { id: "a", label: "A small worked example, then generalize" },
        { id: "b", label: "A map of how the pieces connect" },
        { id: "c", label: "An ordered sequence of operations" }
      ]
    },
    {
      id: "format",
      kind: "structure_compare",
      purpose: "Prose vs diagram vs hybrid for equal facts.",
      hostMust: "Same concept, three equal-information layouts (prose / diagram / hybrid).",
      lockedEvidence: E_FORMAT,
      examplePrompt: "For the same idea in your domain, which representation would you want first?",
      exampleChoices: [
        { id: "a", label: "Clear prose" },
        { id: "b", label: "Labeled relationship diagram" },
        { id: "c", label: "Text combined with a diagram" }
      ]
    },
    {
      id: "components",
      kind: "multi_choice",
      purpose: "First-explanation kit features.",
      hostMust: "Keep five feature options a–e with locked evidence; you may rename labels to their jargon.",
      lockedEvidence: E_COMPONENTS,
      examplePrompt: "Select ALL that would help in a first explanation of something you actually do:",
      exampleChoices: [
        { id: "a", label: "Definitions and key facts" },
        { id: "b", label: "An everyday analogy" },
        { id: "c", label: "A flow diagram" },
        { id: "d", label: "A worked example from my stack" },
        { id: "e", label: "A step-by-step checklist" }
      ]
    },
    {
      id: "guidance",
      kind: "likert",
      purpose: "Scaffolding preference.",
      hostMust: "Keep dimension scaffolding; frame around hard work problems, not school homework.",
      examplePrompt: "When a work problem is difficult, I want explicit intermediate steps rather than figuring out the path myself. (1–5)"
    },
    {
      id: "interaction",
      kind: "likert",
      purpose: "Socratic vs continuous explanation.",
      hostMust: "Keep dimension interaction_level; avoid ‘learn’ framing if they are shipping, not studying.",
      examplePrompt: "I get more from an answer when it invites me to answer small questions along the way. (1–5)"
    },
    {
      id: "uncertainty",
      kind: "cloze_choice",
      purpose: "How to surface uncertainty / exceptions.",
      hostMust: "Keep cloze blank and three options with locked evidence.",
      lockedEvidence: E_UNCERTAINTY,
      examplePrompt: "When a topic has exceptions or uncertain evidence, an explanation should ___ first.",
      exampleChoices: [
        { id: "a", label: "state what is known vs unknown before details" },
        { id: "b", label: "give the main story, then list caveats in a short box" },
        { id: "c", label: "walk through a confident example, then mark where it may not apply" }
      ]
    },
    {
      id: "cloze",
      kind: "cloze_choice",
      purpose: "What they want when stuck.",
      hostMust: "Keep four recovery strategies a–d with locked evidence.",
      lockedEvidence: E_CLOZE,
      examplePrompt: "Complete: “When I get stuck, I want the assistant to ___.”",
      exampleChoices: [
        { id: "a", label: "ask a quick check question, then continue" },
        { id: "b", label: "show a worked example parallel to my problem" },
        { id: "c", label: "give a checklist of next steps" },
        { id: "d", label: "redraw the big picture, then zoom in" }
      ]
    },
    {
      id: "comparison",
      kind: "structure_compare",
      purpose: "Clearest equal-info packaging after seeing three styles.",
      hostMust: "Generate three equal-fact explanations in their domain (overview / steps / example). Randomize display order but keep choice ids’ evidence locked.",
      lockedEvidence: E_COMPARISON,
      examplePrompt: "After seeing equal-information explanations in three styles, which one was clearest?",
      exampleChoices: [
        { id: "a", label: "Overview / relationships" },
        { id: "b", label: "Sequential steps" },
        { id: "c", label: "Concrete example" }
      ]
    }
  ]
};

/** Attach locked evidence to host-written choice labels. */
export function withLockedEvidence(
  slotId: string,
  choices: readonly { id: string; label: string; text?: string }[]
): Choice[] | null {
  const slot = HOST_SURFACE_KIT.slots.find(s => s.id === slotId);
  if (!slot?.lockedEvidence) return null;
  return choices.map(c => {
    const evidence = slot.lockedEvidence![c.id];
    if (!evidence) throw new Error(`Unknown choice id ${c.id} for slot ${slotId}`);
    return {
      id: c.id,
      label: c.label,
      ...(c.text ? { text: c.text } : {}),
      evidence: { ...evidence }
    };
  });
}

/**
 * Build a full personalized draft set for a domain string (host helper / tests).
 * Hosts may still hand-write drafts; this is the reference shape.
 */
export function buildDomainAdaptiveDrafts(domain: string): AdaptiveItemDraft[] {
  const topic = domain.trim().slice(0, 80) || "your work";
  const drafts: AdaptiveItemDraft[] = [
    {
      id: "background",
      kind: "free_text",
      prompt: `In a sentence: how do you usually use AI for ${topic}, and how deep do you already go?`,
      guidance: "Optional. Skip allowed. Not scored into traits.",
      hostTopicHint: topic.slice(0, 120)
    },
    {
      id: "sentence_open",
      kind: "sentence_preference",
      prompt: `Same idea in ${topic}. Which opening sentence would you rather see first?`,
      hostTopicHint: topic.slice(0, 120),
      choices: withLockedEvidence("sentence_open", [
        { id: "a", label: `Purpose: what ${topic} is trying to accomplish in one line.` },
        { id: "b", label: `Example: a tiny concrete case from ${topic}, then the rule.` },
        { id: "c", label: `Steps: numbered actions to get a first working result in ${topic}.` }
      ])!
    },
    {
      id: "overview",
      kind: "likert",
      dimension: "overview_first",
      prompt: `When AI introduces something unfamiliar in ${topic}, I want the overall purpose before the individual steps. (1–5)`
    },
    {
      id: "organization",
      kind: "single_choice",
      prompt: `Something in ${topic} is confusing. Which opening would you try first?`,
      choices: withLockedEvidence("organization", [
        { id: "a", label: "A small worked example, then generalize" },
        { id: "b", label: "A map of how the pieces connect" },
        { id: "c", label: "An ordered sequence of operations" }
      ])!
    },
    {
      id: "format",
      kind: "structure_compare",
      prompt: `For the same ${topic} concept, which representation would you want to try first?`,
      guidance: "Keep factual content identical across options.",
      choices: withLockedEvidence("format", [
        { id: "a", label: "Clear prose" },
        { id: "b", label: "Labeled relationship diagram" },
        { id: "c", label: "Text combined with a diagram" }
      ])!
    },
    {
      id: "components",
      kind: "multi_choice",
      prompt: `Select ALL features that would help in a first explanation about ${topic}:`,
      choices: withLockedEvidence("components", [
        { id: "a", label: "Definitions and key facts" },
        { id: "b", label: "An everyday analogy" },
        { id: "c", label: "A flow diagram" },
        { id: "d", label: "A worked example from my stack" },
        { id: "e", label: "A step-by-step checklist" }
      ])!
    },
    {
      id: "guidance",
      kind: "likert",
      dimension: "scaffolding",
      prompt: `When a ${topic} problem is difficult, I want explicit intermediate steps rather than figuring out the path myself. (1–5)`
    },
    {
      id: "interaction",
      kind: "likert",
      dimension: "interaction_level",
      prompt: `I get more from answers about ${topic} when the explanation invites me to answer small questions along the way. (1–5)`
    },
    {
      id: "uncertainty",
      kind: "cloze_choice",
      prompt: `When ${topic} has exceptions or uncertain evidence, an explanation should ___ first.`,
      choices: withLockedEvidence("uncertainty", [
        { id: "a", label: "state what is known vs unknown before details" },
        { id: "b", label: "give the main story, then list caveats in a short box" },
        { id: "c", label: "walk through a confident example, then mark where it may not apply" }
      ])!
    },
    {
      id: "cloze",
      kind: "cloze_choice",
      prompt: `Complete: “When I get stuck on ${topic}, I want the assistant to ___.”`,
      choices: withLockedEvidence("cloze", [
        { id: "a", label: "ask a quick check question, then continue" },
        { id: "b", label: "show a worked example parallel to my problem" },
        { id: "c", label: "give a checklist of next steps" },
        { id: "d", label: "redraw the big picture, then zoom in" }
      ])!
    },
    {
      id: "comparison",
      kind: "structure_compare",
      prompt: `Which equal-information explanation style for ${topic} was clearest?`,
      guidance: "Host should show three equal-fact variants before asking.",
      choices: withLockedEvidence("comparison", [
        { id: "a", label: "Overview / relationships" },
        { id: "b", label: "Sequential steps" },
        { id: "c", label: "Concrete example" }
      ])!
    }
  ];
  return drafts;
}

export function getHostSurfaceKit(): HostSurfaceKit {
  return HOST_SURFACE_KIT;
}
