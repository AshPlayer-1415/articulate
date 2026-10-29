import { storedPatternsAreValid, storedStylesAreValid, type ArticulationPattern, type NamedStyle } from "./styles.ts";

/**
 * Non-diagnostic presentation preferences. Values in [0,1] describe
 * working hypotheses about explanation format, never intelligence.
 */
export const DIMENSIONS = [
  "overview_first",
  "detail_level",
  "visual_structure",
  "example_preference",
  "scaffolding",
  "interaction_level"
] as const;

export type Dimension = (typeof DIMENSIONS)[number];
export type EvidenceSource =
  | "likert"
  | "single_choice"
  | "multi_choice"
  | "explicit_feedback"
  | "habit_prior";

export interface Evidence {
  itemId: string;
  dimension: Dimension;
  score: number;
  reliability: number;
  source: EvidenceSource;
  timestamp: string;
}

export interface DimensionEstimate {
  value: number;
  evidenceStrength: number; // heuristic 0..1; NOT a calibrated probability
  observationCount: number;
}

export interface DomainFamiliarity {
  level: "new" | "beginner" | "intermediate" | "advanced";
  source: "self_report" | "demonstrated";
  updatedAt: string;
}

/** Compact on-device history of confirmed presentation snapshots (no raw answers). */
export interface CalibrationSnapshotRecord {
  at: string;
  dimensions: Record<Dimension, number>;
}

export type ProfileSchemaVersion = "0.1.0" | "0.2.0";

export interface ArticulateProfile {
  schemaVersion: ProfileSchemaVersion;
  profileId: string;
  createdAt: string;
  updatedAt: string;
  dimensions: Record<Dimension, DimensionEstimate>;
  evidence: Evidence[];
  domainFamiliarity: Record<string, DomainFamiliarity>;
  /** User-edited presentation instructions override provisional evidence estimates. */
  manualOverrides?: Partial<Record<Dimension, number>>;
  /** Only set after the user explicitly approves the generated profile. */
  confirmedAt?: string | null;
  /** Last time the user confirmed a calibration/recalibration round. */
  lastCalibratedAt?: string | null;
  /** Up to a few prior confirmed snapshots for personal (not social) feedback. */
  calibrationHistory?: CalibrationSnapshotRecord[];
  /** User-named response styles. Absent on 0.1.0 profiles. */
  styles?: NamedStyle[];
  /** Short local notes from an approved read of host-visible work. No raw chats. */
  articulationPatterns?: ArticulationPattern[];
  consent: {
    localPersistence: boolean;
    sharePolicyWithAiProvider: boolean;
    optionalResearchTelemetry: false;
  };
}

export function createProfile(profileId: string, timestamp = new Date().toISOString()): ArticulateProfile {
  if (!profileId || profileId.length > 128) throw new Error("Invalid profile ID");
  const dimensions = Object.fromEntries(
    DIMENSIONS.map(key => [key, { value: 0.5, evidenceStrength: 0, observationCount: 0 }])
  ) as Record<Dimension, DimensionEstimate>;
  return {
    schemaVersion: "0.1.0", profileId, createdAt: timestamp, updatedAt: timestamp,
    dimensions, evidence: [], domainFamiliarity: {}, manualOverrides: {}, confirmedAt: null,
    consent: {
      localPersistence: true,
      sharePolicyWithAiProvider: false,
      optionalResearchTelemetry: false
    }
  };
}

export function isArticulateProfile(data: unknown): data is ArticulateProfile {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const p = data as Record<string, unknown>;
  if ((p.schemaVersion !== "0.1.0" && p.schemaVersion !== "0.2.0") || typeof p.profileId !== "string" ||
      typeof p.createdAt !== "string" || typeof p.updatedAt !== "string") return false;
  if (!p.dimensions || typeof p.dimensions !== "object" || Array.isArray(p.dimensions)) return false;
  const dims = p.dimensions as Record<string, unknown>;
  if (!DIMENSIONS.every(key => {
    const d = dims[key] as Record<string, unknown> | undefined;
    return d && typeof d.value === "number" && Number.isFinite(d.value) && d.value >= 0 && d.value <= 1 &&
      typeof d.evidenceStrength === "number" && Number.isFinite(d.evidenceStrength) &&
      d.evidenceStrength >= 0 && d.evidenceStrength <= 1 &&
      typeof d.observationCount === "number" && Number.isInteger(d.observationCount) && d.observationCount >= 0;
  })) return false;
  if (!Array.isArray(p.evidence) || p.evidence.length > 10000) return false;
  if (!p.evidence.every(x => {
    if (!x || typeof x !== "object") return false;
    const e = x as Record<string, unknown>;
    return typeof e.itemId === "string" && e.itemId.length > 0 && e.itemId.length <= 256 &&
      DIMENSIONS.includes(e.dimension as Dimension) &&
      typeof e.score === "number" && Number.isFinite(e.score) && e.score >= 0 && e.score <= 1 &&
      typeof e.reliability === "number" && Number.isFinite(e.reliability) && e.reliability >= 0 && e.reliability <= 1 &&
      ["likert", "single_choice", "multi_choice", "explicit_feedback", "habit_prior"].includes(e.source as string) &&
      typeof e.timestamp === "string";
  })) return false;
  if (!p.domainFamiliarity || typeof p.domainFamiliarity !== "object" || Array.isArray(p.domainFamiliarity)) return false;
  const domains = p.domainFamiliarity as Record<string, DomainFamiliarity>;
  if (!Object.values(domains).every(d => d && ["new", "beginner", "intermediate", "advanced"].includes(d.level) &&
      ["self_report", "demonstrated"].includes(d.source) && typeof d.updatedAt === "string")) return false;
  if (p.manualOverrides !== undefined) {
    if (!p.manualOverrides || typeof p.manualOverrides !== "object" || Array.isArray(p.manualOverrides)) return false;
    for (const [key,value] of Object.entries(p.manualOverrides)) {
      if (!DIMENSIONS.includes(key as Dimension) || typeof value !== "number" ||
          !Number.isFinite(value) || value < 0 || value > 1) return false;
    }
  }
  if (p.confirmedAt !== undefined && p.confirmedAt !== null &&
      (typeof p.confirmedAt !== "string" || !Number.isFinite(Date.parse(p.confirmedAt)))) return false;
  if (p.lastCalibratedAt !== undefined && p.lastCalibratedAt !== null &&
      (typeof p.lastCalibratedAt !== "string" || !Number.isFinite(Date.parse(p.lastCalibratedAt)))) return false;
  if (p.calibrationHistory !== undefined) {
    if (!Array.isArray(p.calibrationHistory) || p.calibrationHistory.length > 8) return false;
    for (const snap of p.calibrationHistory) {
      if (!snap || typeof snap !== "object") return false;
      const s = snap as Record<string, unknown>;
      if (typeof s.at !== "string" || !Number.isFinite(Date.parse(s.at))) return false;
      if (!s.dimensions || typeof s.dimensions !== "object" || Array.isArray(s.dimensions)) return false;
      const dims = s.dimensions as Record<string, unknown>;
      if (!DIMENSIONS.every(key => typeof dims[key] === "number" && Number.isFinite(dims[key] as number) &&
          (dims[key] as number) >= 0 && (dims[key] as number) <= 1)) return false;
    }
  }
  if (p.styles !== undefined && !storedStylesAreValid(p.styles)) return false;
  if (p.articulationPatterns !== undefined && !storedPatternsAreValid(p.articulationPatterns)) return false;
  const c = p.consent as Record<string, unknown> | undefined;
  return !!c && typeof c.localPersistence === "boolean" &&
    typeof c.sharePolicyWithAiProvider === "boolean" && c.optionalResearchTelemetry === false;
}

/** Explicit self-report only. Domain familiarity is context, not a personality score. */
export function setDomainFamiliarity(
  profile: ArticulateProfile,
  subjectInput: string,
  level: DomainFamiliarity["level"],
  timestamp = new Date().toISOString()
): ArticulateProfile {
  const subject = subjectInput.trim().replace(/\s+/g, " ").toLowerCase();
  if (!subject || subject.length > 80 || /[<>{}\n\r]/.test(subject))
    throw new Error("Choose a subject name of 1–80 plain characters");
  if (!["new", "beginner", "intermediate", "advanced"].includes(level))
    throw new Error("Invalid self-reported experience level");
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("Invalid timestamp");
  return {
    ...profile,
    updatedAt: timestamp,
    domainFamiliarity: {
      ...profile.domainFamiliarity,
      [subject]: { level, source: "self_report", updatedAt: timestamp }
    }
  };
}

/** Manually selecting a value is explicit user preference, not inferred ability. */
export function setPreferenceOverride(profile: ArticulateProfile, dimension: Dimension, value: number): ArticulateProfile {
  if (!DIMENSIONS.includes(dimension) || !Number.isFinite(value) || value < 0 || value > 1)
    throw new Error("Invalid preference override");
  return { ...profile, updatedAt: new Date().toISOString(),
    manualOverrides: { ...profile.manualOverrides, [dimension]: value } };
}
export function clearPreferenceOverride(profile: ArticulateProfile, dimension: Dimension): ArticulateProfile {
  if (!DIMENSIONS.includes(dimension)) throw new Error("Unknown dimension");
  const manualOverrides = { ...profile.manualOverrides };
  delete manualOverrides[dimension];
  return { ...profile, updatedAt: new Date().toISOString(), manualOverrides };
}
export function confirmProfile(profile: ArticulateProfile, now = new Date().toISOString()): ArticulateProfile {
  if (!isArticulateProfile(profile) || !Number.isFinite(Date.parse(now))) throw new Error("Invalid profile confirmation");
  // Snapshot is attached by callers via withCalibrationSnapshot when available; keep confirm minimal here.
  return { ...profile, confirmedAt: now, updatedAt: now, lastCalibratedAt: now };
}
