import { DIMENSIONS, type ArticulateProfile, type Dimension, type Evidence } from "./schema.ts";

export const MAX_RETAINED_EVIDENCE = 512;

/** Transparent engineering heuristic; not a validated psychometric estimator. */
export function scoreDimension(evidence: readonly Evidence[], dimension: Dimension) {
  const selected = evidence.filter(e => e.dimension === dimension);
  const sum = selected.reduce((n, e) => n + e.score * e.reliability, 0);
  const weight = selected.reduce((n, e) => n + e.reliability, 0);
  const kinds = new Set(selected.map(e => e.source)).size;
  return {
    value: Math.round(((0.5 + sum) / (1 + weight)) * 1000) / 1000,
    evidenceStrength: Math.round(Math.min(0.9, weight * 0.13 + kinds * 0.04) * 1000) / 1000,
    observationCount: selected.length
  };
}

/**
 * Replacing evidence from the same item (per assessment instance) prevents
 * double-counting accidental submissions. Do not store raw free-text responses.
 */
export function applyEvidence(profile: ArticulateProfile, incoming: readonly Evidence[]): ArticulateProfile {
  const byKey = new Map<string, Evidence>();
  for (const e of [...profile.evidence, ...incoming]) {
    if (!DIMENSIONS.includes(e.dimension) || !Number.isFinite(e.score) || e.score < 0 || e.score > 1 ||
        !Number.isFinite(e.reliability) || e.reliability < 0 || e.reliability > 1 ||
        !e.itemId || !e.timestamp) throw new Error("Invalid evidence");
    const key=e.itemId+":"+e.dimension;
    byKey.delete(key);
    byKey.set(key,e);
  }
  const evidence = [...byKey.values()].slice(-MAX_RETAINED_EVIDENCE);
  return {
    ...profile,
    updatedAt: incoming.at(-1)?.timestamp ?? profile.updatedAt,
    evidence,
    dimensions: Object.fromEntries(DIMENSIONS.map(d => [d, scoreDimension(evidence, d)])) as ArticulateProfile["dimensions"]
  };
}
