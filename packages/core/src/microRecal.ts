import { DIMENSIONS, type ArticulateProfile, type Dimension, type Evidence } from "./schema.ts";
import { applyEvidence } from "./scoring.ts";

/**
 * Opt-in micro-recalibration (v0.4): user says the last answer was the wrong
 * *shape* (map / steps / example / checklist). Updates local evidence only —
 * no silent full rescoring, no population ranks, no ability claims.
 */

export const SHAPE_FEEDBACK_IDS = ["map", "steps", "example", "checklist"] as const;
export type ShapeFeedbackId = (typeof SHAPE_FEEDBACK_IDS)[number];

/** Stronger than habit_prior, weaker than a full quiz battery. */
export const SHAPE_FEEDBACK_RELIABILITY = 0.48;

const SHAPE_SCORES: Record<ShapeFeedbackId, Partial<Record<Dimension, number>>> = {
  map: {
    overview_first: 0.9,
    visual_structure: 0.85,
    scaffolding: 0.35,
    example_preference: 0.4
  },
  steps: {
    overview_first: 0.2,
    scaffolding: 0.92,
    example_preference: 0.45,
    interaction_level: 0.4
  },
  example: {
    example_preference: 0.95,
    overview_first: 0.4,
    scaffolding: 0.45
  },
  checklist: {
    scaffolding: 0.9,
    detail_level: 0.65,
    overview_first: 0.35,
    interaction_level: 0.35
  }
};

const SHAPE_TIPS: Record<ShapeFeedbackId, string> = {
  map: "Next time I’ll lead with a labeled map/relationships, then details.",
  steps: "Next time I’ll open with ordered steps/checkpoints before the big picture.",
  example: "Next time I’ll start with a concrete worked example parallel to your case.",
  checklist: "Next time I’ll give a concise checklist of next actions first."
};

export function isShapeFeedbackId(value: unknown): value is ShapeFeedbackId {
  return typeof value === "string" && (SHAPE_FEEDBACK_IDS as readonly string[]).includes(value);
}

export function listShapeFeedbackIds(): ShapeFeedbackId[] {
  return [...SHAPE_FEEDBACK_IDS];
}

export function evidenceForShapeFeedback(
  shape: ShapeFeedbackId,
  now: string
): Evidence[] {
  if (!isShapeFeedbackId(shape)) throw new Error("Unknown shape feedback id");
  if (!Number.isFinite(Date.parse(now))) throw new Error("Invalid shape feedback timestamp");
  const scores = SHAPE_SCORES[shape];
  const out: Evidence[] = [];
  for (const d of DIMENSIONS) {
    const score = scores[d];
    if (score === undefined) continue;
    out.push({
      // Stable id so repeating the same shape refreshes rather than stacks.
      itemId: `shape_feedback:${shape}`,
      dimension: d,
      score,
      reliability: SHAPE_FEEDBACK_RELIABILITY,
      source: "explicit_feedback",
      timestamp: now
    });
  }
  return out;
}

export interface ShapeFeedbackResult {
  shape: ShapeFeedbackId;
  tip: string;
  dimensionsTouched: Dimension[];
  profile: ArticulateProfile;
  note: string;
}

/**
 * Apply one user-requested packaging correction. Caller must have confirmed
 * the user asked for this shape change in-session.
 */
export function applyShapeFeedback(
  profile: ArticulateProfile,
  shape: ShapeFeedbackId,
  now = new Date().toISOString()
): ShapeFeedbackResult {
  const evidence = evidenceForShapeFeedback(shape, now);
  const next = applyEvidence(profile, evidence);
  return {
    shape,
    tip: SHAPE_TIPS[shape],
    dimensionsTouched: evidence.map(e => e.dimension),
    profile: next,
    note: "Micro-update only. Full ~60-day recalibration still requires an explicit new assessment + confirm."
  };
}
