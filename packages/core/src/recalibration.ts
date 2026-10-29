import { DIMENSIONS, type ArticulateProfile, type Dimension } from "./schema.ts";

/** Default private-alpha refresh cadence (owner-locked). */
export const DEFAULT_CALIBRATION_INTERVAL_DAYS = 60;

export interface CalibrationSnapshot {
  at: string;
  /** Effective presentation values in [0,1] after overrides — never raw answers. */
  dimensions: Record<Dimension, number>;
}

export interface RecalibrationStatus {
  due: boolean;
  intervalDays: number;
  lastCalibratedAt: string | null;
  nextDueAt: string | null;
  daysUntilDue: number | null;
  requiresUserConfirm: true;
  note: string;
}

export interface DimensionDelta {
  dimension: Dimension;
  previous: number;
  current: number;
  delta: number;
  direction: "increased" | "decreased" | "stable";
}

export interface PersonalFeedback {
  summary: string;
  shifts: DimensionDelta[];
  positives: string[];
  softTips: string[];
  prohibitions: string[];
}

const LABELS: Record<Dimension, { low: string; high: string; tipUp: string; tipDown: string }> = {
  overview_first: {
    low: "step-by-step openings",
    high: "big-picture openings",
    tipUp: "Try: “Start with the map, then the steps.”",
    tipDown: "Try: “Walk me through the steps in order first.”"
  },
  detail_level: {
    low: "concise first passes",
    high: "in-depth first passes",
    tipUp: "Try: “Give full detail up front; I’ll skim.”",
    tipDown: "Try: “Short answer first; ask before expanding.”"
  },
  visual_structure: {
    low: "prose-first explanations",
    high: "diagrams and structured layouts",
    tipUp: "Try: “Show a labeled diagram or table, then prose.”",
    tipDown: "Try: “Prefer clear paragraphs; diagrams only if needed.”"
  },
  example_preference: {
    low: "abstract definitions first",
    high: "worked examples and analogies",
    tipUp: "Try: “One concrete example before the general rule.”",
    tipDown: "Try: “Define the idea first; example only if I ask.”"
  },
  scaffolding: {
    low: "less hand-holding",
    high: "explicit intermediate checkpoints",
    tipUp: "Try: “Break this into checkpoints and check me.”",
    tipDown: "Try: “Give me the goal and let me attempt, then correct.”"
  },
  interaction_level: {
    low: "continuous explanation",
    high: "questions along the way",
    tipUp: "Try: “Ask me a quick check question every few steps.”",
    tipDown: "Try: “Explain fully without interrupting with quizzes.”"
  }
};

function effectiveValue(profile: ArticulateProfile, dimension: Dimension): number {
  const override = profile.manualOverrides?.[dimension];
  return override === undefined ? profile.dimensions[dimension].value : override;
}

export function snapshotProfile(profile: ArticulateProfile, at: string): CalibrationSnapshot {
  if (!Number.isFinite(Date.parse(at))) throw new Error("Invalid snapshot timestamp");
  const dimensions = Object.fromEntries(
    DIMENSIONS.map(d => [d, effectiveValue(profile, d)])
  ) as Record<Dimension, number>;
  return { at, dimensions };
}

export function withCalibrationSnapshot(profile: ArticulateProfile, at: string, max = 5): ArticulateProfile {
  const snap = snapshotProfile(profile, at);
  const prior = profile.calibrationHistory ?? [];
  const calibrationHistory = [...prior.filter(s => s.at !== at), snap]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-max);
  return {
    ...profile,
    updatedAt: at,
    lastCalibratedAt: at,
    calibrationHistory
  };
}

export function recalibrationStatus(
  profile: ArticulateProfile | null | undefined,
  now = new Date().toISOString(),
  intervalDays = DEFAULT_CALIBRATION_INTERVAL_DAYS
): RecalibrationStatus {
  const note = "Recalibration never auto-overwrites a confirmed profile; the user must review and confirm.";
  if (!profile?.confirmedAt) {
    return {
      due: false, intervalDays, lastCalibratedAt: null, nextDueAt: null, daysUntilDue: null,
      requiresUserConfirm: true, note
    };
  }
  const last = profile.lastCalibratedAt ?? profile.confirmedAt;
  const lastMs = Date.parse(last);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs)) throw new Error("Invalid recalibration timestamps");
  const nextMs = lastMs + intervalDays * 24 * 60 * 60 * 1000;
  const daysUntilDue = Math.ceil((nextMs - nowMs) / (24 * 60 * 60 * 1000));
  return {
    due: nowMs >= nextMs,
    intervalDays,
    lastCalibratedAt: last,
    nextDueAt: new Date(nextMs).toISOString(),
    daysUntilDue,
    requiresUserConfirm: true,
    note
  };
}

export function compareCalibration(
  previous: CalibrationSnapshot | ArticulateProfile,
  current: ArticulateProfile,
  threshold = 0.08
): DimensionDelta[] {
  const prevDims = "dimensions" in previous && typeof (previous as CalibrationSnapshot).at === "string"
    ? (previous as CalibrationSnapshot).dimensions
    : Object.fromEntries(DIMENSIONS.map(d => [d, effectiveValue(previous as ArticulateProfile, d)])) as Record<Dimension, number>;
  return DIMENSIONS.map(dimension => {
    const prev = prevDims[dimension];
    const curr = effectiveValue(current, dimension);
    const delta = curr - prev;
    const direction = Math.abs(delta) < threshold ? "stable" : delta > 0 ? "increased" : "decreased";
    return { dimension, previous: prev, current: curr, delta, direction };
  });
}

/**
 * Personal-only coaching. Never invents population percentiles or ability ranks.
 */
export function buildPersonalFeedback(
  current: ArticulateProfile,
  previousSnapshot?: CalibrationSnapshot | null
): PersonalFeedback {
  const prohibitions = [
    "Do not claim population percentiles, leaderboards, or “top N% of AI users.”",
    "Do not frame shifts as intelligence, talent, or clinical change.",
    "Do not alter facts, uncertainty, or safety guidance to match preferences."
  ];
  if (!previousSnapshot) {
    const highs = DIMENSIONS
      .map(d => ({ d, v: effectiveValue(current, d) }))
      .filter(x => x.v >= 0.64)
      .slice(0, 3);
    const positives = [
      "You now have an editable, on-device presentation profile you can override anytime.",
      "Ask your AI host to apply Articulate only when you want personalized explanation packaging."
    ];
    const softTips = [
      "Right after confirming: ask for your Articulate policy, then “explain X using my policy without changing facts.”",
      "When an answer feels wrong-shaped (not wrong-fact), say which format you wanted: map, steps, example, or checklist.",
      "Keep uncertainty visible: ask models to separate what is known from what is unknown."
    ];
    for (const { d } of highs) softTips.unshift(LABELS[d].tipUp);
    return {
      summary: "This is your first confirmed Articulate presentation profile. Recalibrate in about two months, or sooner if your preferences change.",
      shifts: [],
      positives,
      softTips: softTips.slice(0, 5),
      prohibitions
    };
  }
  const shifts = compareCalibration(previousSnapshot, current);
  const moved = shifts.filter(s => s.direction !== "stable");
  const positives: string[] = [];
  const softTips: string[] = [];
  for (const shift of moved) {
    const label = LABELS[shift.dimension];
    if (shift.direction === "increased") {
      positives.push(`Compared with your last local snapshot, you lean more toward ${label.high}.`);
      softTips.push(label.tipUp);
    } else {
      positives.push(`Compared with your last local snapshot, you lean more toward ${label.low}.`);
      softTips.push(label.tipDown);
    }
  }
  if (!moved.length) {
    positives.push("Your presentation preferences look stable versus your last local snapshot.");
    softTips.push("On your next hard topic, try one contrasting format on purpose (example-first vs map-first) and keep whichever helped.");
  }
  const summary = moved.length
    ? `Local recalibration found ${moved.length} meaningful presentation shift${moved.length === 1 ? "" : "s"} versus your previous on-device snapshot.`
    : "Local recalibration found no large presentation shifts versus your previous on-device snapshot.";
  return { summary, shifts, positives, softTips: softTips.slice(0, 4), prohibitions };
}
