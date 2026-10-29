import { DIMENSIONS, type ArticulateProfile, type Dimension, type Evidence } from "./schema.ts";
import { applyEvidence } from "./scoring.ts";
import { HOST_SURFACE_KIT } from "./hostSurfaces.ts";
import { resolvePolicy, policyToPrompt, type LearningTask } from "./policy.ts";

/** Weak host-memory priors — quiz answers should outweigh these. */
export const HABIT_PRIOR_RELIABILITY = 0.22;

export type HabitSignalId =
  | "example_first"
  | "map_first"
  | "steps_first"
  | "short_then_deep"
  | "diagrams"
  | "no_quiz"
  | "builder_context";

const SIGNAL_PRIORS: Record<HabitSignalId, Partial<Record<Dimension, number>>> = {
  example_first: { example_preference: 0.82, overview_first: 0.45 },
  map_first: { overview_first: 0.85, visual_structure: 0.75 },
  steps_first: { scaffolding: 0.85, overview_first: 0.25 },
  short_then_deep: { detail_level: 0.28 },
  diagrams: { visual_structure: 0.88 },
  no_quiz: { interaction_level: 0.22 },
  builder_context: { example_preference: 0.7, scaffolding: 0.55 }
};

const KNOWN_SIGNALS = new Set(Object.keys(SIGNAL_PRIORS) as HabitSignalId[]);

export interface HabitProposal {
  path: "habit_first";
  bankId: "agent_v2";
  habitPrior: Partial<Record<Dimension, number>>;
  matchedSignals: HabitSignalId[];
  draftInstructions: string[];
  draftPolicyText: string;
  probeCount: number;
  askUser: string;
  notes: string[];
}

function averagePriors(matched: HabitSignalId[]): Partial<Record<Dimension, number>> {
  const sums: Partial<Record<Dimension, number[]>> = {};
  for (const id of matched) {
    for (const [dim, score] of Object.entries(SIGNAL_PRIORS[id])) {
      const d = dim as Dimension;
      (sums[d] ??= []).push(score!);
    }
  }
  const out: Partial<Record<Dimension, number>> = {};
  for (const d of DIMENSIONS) {
    const vals = sums[d];
    if (!vals?.length) continue;
    out[d] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1000) / 1000;
  }
  return out;
}

function syntheticProfileFromPrior(prior: Partial<Record<Dimension, number>>): ArticulateProfile {
  const profile = {
    schemaVersion: "0.1.0" as const,
    profileId: "habit-draft",
    createdAt: "2026-10-12T00:00:00.000Z",
    updatedAt: "2026-10-12T00:00:00.000Z",
    dimensions: Object.fromEntries(
      DIMENSIONS.map(d => [d, {
        value: prior[d] ?? 0.5,
        evidenceStrength: prior[d] === undefined ? 0 : 0.2,
        observationCount: prior[d] === undefined ? 0 : 1
      }])
    ) as ArticulateProfile["dimensions"],
    evidence: [],
    domainFamiliarity: {},
    manualOverrides: {},
    confirmedAt: "2026-10-12T00:00:00.000Z",
    consent: {
      localPersistence: true,
      sharePolicyWithAiProvider: true,
      optionalResearchTelemetry: false as const
    }
  };
  return profile;
}

/**
 * Turn host-observed prompting pattern ids into a draft policy + weak priors.
 * Does not read or write disk; host must get user consent before start.
 */
export function proposeHabitsFromSignals(
  signalIds: readonly string[],
  task: LearningTask = "concept"
): HabitProposal {
  const matched = [...new Set(signalIds)]
    .filter((id): id is HabitSignalId => KNOWN_SIGNALS.has(id as HabitSignalId));
  const habitPrior = averagePriors(matched);
  const draftProfile = syntheticProfileFromPrior(habitPrior);
  const policy = resolvePolicy(draftProfile, task);
  const kitSignals = HOST_SURFACE_KIT.patternSignals.filter(s => matched.includes(s.id as HabitSignalId));
  return {
    path: "habit_first",
    bankId: "agent_v2",
    habitPrior,
    matchedSignals: matched,
    draftInstructions: policy.instructions,
    draftPolicyText: policyToPrompt(policy),
    probeCount: 6,
    askUser: matched.length
      ? "I inferred these explanation habits from how you prompt. After a short 6-item check, you can confirm or edit."
      : "No clear habit signals — using a short equal-fact preference check with neutral priors.",
    notes: [
      ...kitSignals.map(s => s.implies),
      "Priors are weak; the 6 probes and your overrides win.",
      "Never invent IQ, percentiles, or diagnoses from habits."
    ]
  };
}

/** Normalize host-supplied dimension map in [0,1]. */
export function normalizeHabitPrior(raw: unknown): Partial<Record<Dimension, number>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<Dimension, number>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!DIMENSIONS.includes(key as Dimension)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) continue;
    out[key as Dimension] = Math.round(value * 1000) / 1000;
  }
  return out;
}

/** Apply weak habit_prior evidence before the short quiz. */
export function applyHabitPriors(
  profile: ArticulateProfile,
  prior: Partial<Record<Dimension, number>>,
  now: string
): ArticulateProfile {
  const evidence: Evidence[] = [];
  for (const d of DIMENSIONS) {
    const score = prior[d];
    if (score === undefined) continue;
    evidence.push({
      itemId: `habit_prior:${d}`,
      dimension: d,
      score,
      reliability: HABIT_PRIOR_RELIABILITY,
      source: "habit_prior",
      timestamp: now
    });
  }
  if (!evidence.length) return profile;
  return applyEvidence(profile, evidence);
}

export function listHabitSignalIds(): HabitSignalId[] {
  return [...KNOWN_SIGNALS];
}
