import { DIMENSIONS, type Dimension } from "./schema.ts";
import { type Choice, type Question, type QuestionKind } from "./assessment.ts";

/** Item kinds a host may redesign the surface of (scoring map must stay explicit). */
export const ADAPTIVE_KINDS = [
  "sentence_preference",
  "cloze_choice",
  "structure_compare",
  "single_choice",
  "multi_choice",
  "likert",
  "free_text"
] as const;

export type AdaptiveKind = (typeof ADAPTIVE_KINDS)[number];

export interface AdaptiveItemDraft {
  id: string;
  kind: QuestionKind;
  prompt: string;
  dimension?: Dimension;
  reverse?: boolean;
  choices?: readonly Choice[];
  guidance?: string;
  /** Host-only note: topic/domain used for personalization; never stored as evidence text. */
  hostTopicHint?: string;
}

export interface AdaptiveValidationResult {
  ok: boolean;
  item?: Question;
  errors: string[];
}

const CHOICE_KINDS = new Set<QuestionKind>([
  "sentence_preference", "cloze_choice", "structure_compare", "single_choice", "multi_choice", "comprehension"
]);

function isDimension(value: unknown): value is Dimension {
  return typeof value === "string" && (DIMENSIONS as readonly string[]).includes(value);
}

function validateChoices(kind: QuestionKind, choices: unknown): { ok: true; choices: Choice[] } | { ok: false; error: string } {
  if (!Array.isArray(choices) || choices.length < 2 || choices.length > 8)
    return { ok: false, error: "Choice items need 2–8 options" };
  const seen = new Set<string>();
  const out: Choice[] = [];
  for (const raw of choices) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid choice object" };
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== "string" || !/^[a-z0-9_-]{1,32}$/i.test(c.id) || seen.has(c.id))
      return { ok: false, error: "Choice ids must be unique short tokens" };
    seen.add(c.id);
    if (typeof c.label !== "string" || c.label.trim().length < 1 || c.label.length > 500)
      return { ok: false, error: "Choice labels must be 1–500 characters" };
    if (c.text !== undefined && (typeof c.text !== "string" || c.text.length > 4000))
      return { ok: false, error: "Optional choice text must be ≤4000 characters" };
    let evidence: Partial<Record<Dimension, number>> | undefined;
    if (c.evidence !== undefined) {
      if (!c.evidence || typeof c.evidence !== "object" || Array.isArray(c.evidence))
        return { ok: false, error: "Choice evidence must be a dimension map" };
      evidence = {};
      for (const [key, score] of Object.entries(c.evidence as Record<string, unknown>)) {
        if (!isDimension(key) || typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1)
          return { ok: false, error: "Evidence scores must be dimensions in [0,1]" };
        evidence[key] = score;
      }
    }
    if (kind !== "comprehension" && kind !== "likert" && (!evidence || Object.keys(evidence).length === 0))
      return { ok: false, error: "Preference choices must declare explicit dimension evidence" };
    out.push({
      id: c.id,
      label: c.label.trim(),
      ...(typeof c.text === "string" ? { text: c.text } : {}),
      ...(evidence ? { evidence } : {})
    });
  }
  return { ok: true, choices: out };
}

/**
 * Validate a host-redesigned assessment surface. Rejects ability/IQ framing cues,
 * missing scoring maps, and oversized prompts. Does not call any network.
 */
export function validateAdaptiveItem(draft: unknown): AdaptiveValidationResult {
  const errors: string[] = [];
  if (!draft || typeof draft !== "object" || Array.isArray(draft))
    return { ok: false, errors: ["Draft must be an object"] };
  const d = draft as Record<string, unknown>;
  if (typeof d.id !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(d.id))
    errors.push("id must be a short snake_case token");
  if (typeof d.kind !== "string" || !(ADAPTIVE_KINDS as readonly string[]).includes(d.kind))
    errors.push("kind must be an allowed adaptive item type");
  if (typeof d.prompt !== "string" || d.prompt.trim().length < 8 || d.prompt.length > 1200)
    errors.push("prompt must be 8–1200 characters");
  const banned = /(?:\biq\b|intelligence quotient|\bintelligence\b|learning disability|\bdiagnose\b|top\s*\d+\s*%|\bpercentile\b|smarter than|\bdumb\b|\bgifted\b)/i;
  if (typeof d.prompt === "string" && banned.test(d.prompt))
    errors.push("prompt must not use ability-ranking or diagnostic language");
  if (d.guidance !== undefined && (typeof d.guidance !== "string" || d.guidance.length > 800))
    errors.push("guidance must be a string ≤800 characters");
  if (d.hostTopicHint !== undefined && (typeof d.hostTopicHint !== "string" || d.hostTopicHint.length > 120))
    errors.push("hostTopicHint must be ≤120 characters");

  const kind = d.kind as QuestionKind;
  let choices: Choice[] | undefined;
  if (CHOICE_KINDS.has(kind) || kind === "multi_choice" || kind === "single_choice" ||
      kind === "sentence_preference" || kind === "cloze_choice" || kind === "structure_compare") {
    const checked = validateChoices(kind, d.choices);
    if (!checked.ok) errors.push(checked.error);
    else choices = checked.choices;
  }
  if (kind === "likert") {
    if (!isDimension(d.dimension)) errors.push("likert items require a presentation dimension");
    if (d.choices !== undefined) errors.push("likert items must not include choices");
  }
  if (kind === "free_text") {
    if (d.choices !== undefined) errors.push("free_text items must not include choices");
    if (d.dimension !== undefined) errors.push("free_text items must not bind a scored dimension");
  }
  if (errors.length) return { ok: false, errors };

  const item: Question = {
    id: d.id as string,
    kind,
    prompt: (d.prompt as string).trim(),
    ...(isDimension(d.dimension) ? { dimension: d.dimension } : {}),
    ...(d.reverse === true ? { reverse: true } : {}),
    ...(choices ? { choices } : {}),
    ...(typeof d.guidance === "string" ? { guidance: d.guidance } : {})
  };
  return { ok: true, item, errors: [] };
}

/** Measurement bindings come from the authored bank, never the host. */
export function canonicalMeasurementMatches(base: Question, draft: Question): boolean {
  if (draft.kind !== base.kind || draft.dimension !== base.dimension || !!draft.reverse !== !!base.reverse) return false;
  if ((draft.choices?.length ?? 0) !== (base.choices?.length ?? 0)) return false;
  return (base.choices ?? []).every(choice => {
    const candidate=draft.choices?.find(c=>c.id===choice.id);
    if (!candidate) return false;
    const a=Object.entries(choice.evidence ?? {}).sort();
    const b=Object.entries(candidate.evidence ?? {}).sort();
    return JSON.stringify(a)===JSON.stringify(b);
  });
}

/** Replace canonical surfaces with validated host drafts keyed by question id. */
export function applyAdaptiveSurfaces(
  canonical: readonly Question[],
  drafts: readonly unknown[] | null | undefined
): { questions: Question[]; replacedIds: string[]; rejected: { id?: string; errors: string[] }[] } {
  if (!drafts || drafts.length === 0) return { questions: [...canonical], replacedIds: [], rejected: [] };
  const byId = new Map(canonical.map(q => [q.id, q]));
  const replacedIds: string[] = [];
  const rejected: { id?: string; errors: string[] }[] = [];
  for (const draft of drafts) {
    const result = validateAdaptiveItem(draft);
    const id = draft && typeof draft === "object" && typeof (draft as { id?: unknown }).id === "string"
      ? (draft as { id: string }).id : undefined;
    if (!result.ok || !result.item) {
      rejected.push({ id, errors: result.errors });
      continue;
    }
    const base = byId.get(result.item.id);
    if (!base) {
      rejected.push({ id: result.item.id, errors: ["Unknown question id; cannot invent new measured items"] });
      continue;
    }
    if (!canonicalMeasurementMatches(base, result.item)) {
      rejected.push({id:result.item.id,errors:["Canonical kind, choice ids, dimensions and scoring maps are locked"]});
      continue;
    }
    if (replacedIds.includes(base.id)) {
      rejected.push({id:base.id,errors:["Duplicate adaptive draft"]});continue;
    }
    byId.set(base.id, {
      ...base, prompt:result.item.prompt,
      guidance:result.item.guidance ?? base.guidance,
      ...(base.choices ? {choices:base.choices.map(c=>{
        const surface=result.item!.choices!.find(d=>d.id===c.id)!;
        return {...c,label:surface.label,...(surface.text!==undefined?{text:surface.text}:{})};
      })}: {})
    });
    replacedIds.push(result.item.id);
  }
  return {
    questions: canonical.map(q => byId.get(q.id) ?? q),
    replacedIds,
    rejected
  };
}
