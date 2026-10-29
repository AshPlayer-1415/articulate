/**
 * User-named response styles. The host personalizes the questions;
 * Articulate stores only the name and response rule the user confirms.
 */

import { preferenceSafetyIssue } from "./preferenceSafety.ts";

export const STYLE_NAME_MAX = 40;
export const STYLE_SHAPE_MAX = 500;
export const STYLE_COUNT_MAX = 8;

export const ANSWER_SPINE = [
  "Open with a one-line answer.",
  "Then give the useful detail.",
  "End with one don't-miss line: the number, caveat, or decision they would skip."
] as const;

export interface StyleQuestionNeed {
  id: string;
  need: string;
  why: string;
  hostPrompt: string;
  answerShape: "short_text" | "single_choice_plus_text";
}

export interface NamedStyle {
  id: string;
  name: string;
  responseShape: string;
  isDefault: boolean;
}

export interface StyleDraftInput {
  name: string;
  responseShape: string;
  isDefault: boolean;
}

export const STYLE_QUESTION_KIT: readonly StyleQuestionNeed[] = [
  {
    id: "first_in_this_work",
    need: "What they want to see first in this kind of work.",
    why: "Sets the opening of the response rule.",
    hostPrompt: "Using this project and how they already ask, phrase one short question about what should come first. Offer a few concrete options drawn from that work, plus a free-text line.",
    answerShape: "single_choice_plus_text"
  },
  {
    id: "leave_out",
    need: "What they want left out so they do not skim past the point.",
    why: "Keeps replies from burying the useful part.",
    hostPrompt: "Ask what to skip for this kind of task, using examples from their current project. One short question.",
    answerShape: "short_text"
  },
  {
    id: "always_visible",
    need: "What must always stay visible (the don't-miss).",
    why: "The last line of the default spine is theirs to define.",
    hostPrompt: "Ask what they would regret missing if they only skimmed: a number, a caveat, a decision, or something from this project.",
    answerShape: "short_text"
  },
  {
    id: "style_name_and_shape",
    need: "The name they want for this style, and the response rule in their words.",
    why: "The stored style is their name plus their wording, not a preset mode.",
    hostPrompt: "Ask them to name this style and describe how replies should look. You may show a draft based on the answers above. They edit the name and the rule before anything is saved.",
    answerShape: "short_text"
  },
  {
    id: "is_default",
    need: "Whether this style is the default.",
    why: "One confirmed style is the default. Others are chosen by name.",
    hostPrompt: "Ask which confirmed style should be the default. Do not invent a name they did not accept.",
    answerShape: "single_choice_plus_text"
  }
];

export function getStyleQuestionKit(): {
  spine: readonly string[];
  needs: readonly StyleQuestionNeed[];
  hostInstructions: string[];
} {
  return {
    spine: ANSWER_SPINE,
    needs: STYLE_QUESTION_KIT,
    hostInstructions: [
      "Look only at context the user already allowed in this host.",
      "Draft one to four styles, then ask these needs in one native Q&A form.",
      "Phrase each question from their project. Do not read the kit aloud as a script.",
      "Save only names and response rules they confirmed. Do not send project text, transcripts, or chat logs to Articulate tools."
    ]
  };
}

function cleanLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeDump(text: string): boolean {
  const newlines = text.split("\n").length - 1;
  if (newlines > 2) return true;
  return /(\[user\]|\[assistant\]|\[system\]|transcript|conversation log)/i.test(text);
}

export function storedStylesAreValid(value: unknown): value is NamedStyle[] {
  if (!Array.isArray(value) || value.length > STYLE_COUNT_MAX) return false;
  const names = new Set<string>();
  let defaults = 0;
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const style = item as Record<string, unknown>;
    if (typeof style.id !== "string" || !/^style-[1-8]$/.test(style.id)) return false;
    if (typeof style.name !== "string" || typeof style.responseShape !== "string") return false;
    if (style.name !== cleanLine(style.name) || style.name.length < 1 || style.name.length > STYLE_NAME_MAX) return false;
    if (style.responseShape !== cleanLine(style.responseShape)) return false;
    if (style.responseShape.length < 8 || style.responseShape.length > STYLE_SHAPE_MAX) return false;
    if (looksLikeDump(style.name) || looksLikeDump(style.responseShape)) return false;
    if (/[<>{}]/.test(style.name)) return false;
    if (style.isDefault !== true && style.isDefault !== false) return false;
    const key = style.name.toLowerCase();
    if (names.has(key)) return false;
    names.add(key);
    if (style.isDefault) defaults += 1;
  }
  if (value.length === 0) return true;
  return defaults === 1;
}

/** Turn a host form into stored styles. Rejects dumps and unnamed drafts. */
export function normalizeNamedStyles(input: unknown): NamedStyle[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > STYLE_COUNT_MAX)
    throw new Error(`Provide 1–${STYLE_COUNT_MAX} styles the user confirmed`);
  const drafts: StyleDraftInput[] = input.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("Each style needs a name and a response rule");
    const raw = item as Record<string, unknown>;
    if (typeof raw.name !== "string" || typeof raw.responseShape !== "string")
      throw new Error("Each style needs a name and a response rule");
    if (looksLikeDump(raw.name) || looksLikeDump(raw.responseShape))
      throw new Error("Save the user's response rule only, not a transcript or project dump");
    const name = cleanLine(raw.name);
    const responseShape = cleanLine(raw.responseShape);
    if (preferenceSafetyIssue(name) || preferenceSafetyIssue(responseShape))
      throw new Error("Unsafe preference content; save presentation preferences only");
    if (!name || name.length > STYLE_NAME_MAX) throw new Error(`Style name must be 1–${STYLE_NAME_MAX} characters`);
    if (responseShape.length < 8 || responseShape.length > STYLE_SHAPE_MAX)
      throw new Error(`Response rule must be 8–${STYLE_SHAPE_MAX} characters`);
    if (/[<>{}]/.test(name)) throw new Error("Style name must be plain text");
    if (raw.isDefault !== true && raw.isDefault !== false)
      throw new Error("Each style needs isDefault true or false, with exactly one default");
    return { name, responseShape, isDefault: raw.isDefault };
  });
  const seen = new Set<string>();
  for (const draft of drafts) {
    const key = draft.name.toLowerCase();
    if (seen.has(key)) throw new Error("Style names must be unique");
    seen.add(key);
  }
  const defaults = drafts.filter(d => d.isDefault).length;
  if (defaults !== 1) throw new Error("Mark exactly one default style");
  return drafts.map((draft, index) => ({
    id: `style-${index + 1}`,
    name: draft.name,
    responseShape: draft.responseShape,
    isDefault: draft.isDefault
  }));
}

export const PATTERN_FIELD_MAX = 180;
export const PATTERN_COUNT_MAX = 24;

export interface ArticulationPattern {
  id: string;
  situation: string;
  wantedOutput: string;
  gap: string;
  readback: string;
}

export function getPatternKit(): {
  hostInstructions: string[];
  fields: { id: string; write: string }[];
} {
  return {
    hostInstructions: [
      "Ask before reading projects or chats. Use only context this host can already see and the user pointed at.",
      "Do not crawl other apps, home directories, or chat databases. Articulate never receives the raw history.",
      "Take the time to group repeated situations. For each one, write four short notes: the situation, the output they pressed for, why the reply missed, and how they read output in that situation.",
      "Show those notes and save only after they approve. Ask the style-kit questions only for gaps the history does not answer.",
      "Default storage is the local profile. Do not commit it. They may copy a file into a gitignored project path themselves."
    ],
    fields: [
      { id: "situation", write: "When this comes up, in a few words." },
      { id: "wantedOutput", write: "What they wanted the reply to be." },
      { id: "gap", write: "Why the model reply was lacking." },
      { id: "readback", write: "How they understand output in this situation." }
    ]
  };
}

function cleanPatternField(label: string, value: unknown): string {
  if (typeof value !== "string") throw new Error(`Each pattern needs a ${label}`);
  if (looksLikeDump(value))
    throw new Error("Save short pattern notes only, not a transcript or project dump");
  const text = cleanLine(value);
  if (preferenceSafetyIssue(text)) throw new Error("Unsafe preference content; save presentation preferences only");
  if (text.length < 8 || text.length > PATTERN_FIELD_MAX)
    throw new Error(`${label} must be 8–${PATTERN_FIELD_MAX} characters`);
  return text;
}

export function storedPatternsAreValid(value: unknown): value is ArticulationPattern[] {
  if (!Array.isArray(value) || value.length > PATTERN_COUNT_MAX) return false;
  return value.every((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const pattern = item as Record<string, unknown>;
    if (pattern.id !== `pattern-${index + 1}`) return false;
    for (const key of ["situation", "wantedOutput", "gap", "readback"] as const) {
      const text = pattern[key];
      if (typeof text !== "string" || text !== cleanLine(text)) return false;
      if (text.length < 8 || text.length > PATTERN_FIELD_MAX) return false;
      if (looksLikeDump(text)) return false;
    }
    return true;
  });
}

/** Derived notes from an approved local read. Rejects transcripts. */
export function normalizeArticulationPatterns(input: unknown): ArticulationPattern[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > PATTERN_COUNT_MAX)
    throw new Error(`Provide 1–${PATTERN_COUNT_MAX} approved pattern notes`);
  return input.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("Each pattern needs situation, wantedOutput, gap, and readback");
    const raw = item as Record<string, unknown>;
    return {
      id: `pattern-${index + 1}`,
      situation: cleanPatternField("situation", raw.situation),
      wantedOutput: cleanPatternField("wantedOutput", raw.wantedOutput),
      gap: cleanPatternField("gap", raw.gap),
      readback: cleanPatternField("readback", raw.readback)
    };
  });
}

export function patternInstructions(patterns: readonly ArticulationPattern[] | undefined): string[] {
  if (!patterns?.length) return [];
  return patterns.filter(pattern => ![pattern.situation, pattern.wantedOutput, pattern.gap, pattern.readback].some(preferenceSafetyIssue)).map(pattern =>
    `When ${pattern.situation}: they want ${pattern.wantedOutput}. A miss looks like ${pattern.gap}. They read the reply by ${pattern.readback}.`
  );
}

export function pickNamedStyle(
  styles: readonly NamedStyle[] | undefined,
  styleName?: string | null
): NamedStyle | null {
  if (!styles?.length) return null;
  styles = styles.filter(style => !preferenceSafetyIssue(style.name) && !preferenceSafetyIssue(style.responseShape));
  if (!styles.length) return null;
  if (styleName && styleName.trim()) {
    const wanted = styleName.trim().toLowerCase();
    const found = styles.find(s => s.name.toLowerCase() === wanted || s.id === styleName.trim());
    if (!found) throw new Error("Unknown style name");
    return found;
  }
  return styles.find(s => s.isDefault) ?? styles[0];
}
