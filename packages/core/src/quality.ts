/**
 * Deterministic *surface-level* explanation safeguards for a private research
 * alpha. The checker looks for reviewer-authored exact evidence spans; it is
 * NOT a semantic entailment classifier or a substitute for human fact-checking.
 *
 * It runs fully offline. Inputs need not leave the user's own device.
 */
export const QUALITY_TASKS = ["concept", "mathematics", "debugging", "research"] as const;
export type QualityTask = (typeof QUALITY_TASKS)[number];

export interface QualityAnchor {
  id: string;
  label: string;
  /** At least one authored literal should appear (case/whitespace insensitive). */
  oneOf: string[];
}
export interface QualityFixture {
  id: string;
  task: QualityTask;
  question: string;
  required: QualityAnchor[];
  prohibited: QualityAnchor[];
  /** Optional presentation cues for the adapted example; advisory only. */
  formatSignals?: QualityAnchor[];
  examples: {
    baseline: string;
    adapted: string;
    regressions: { id: string; text: string }[];
  };
}
export interface QualityResult {
  caseId: string;
  guardPassed: boolean;
  requiredMatched: number;
  requiredTotal: number;
  missingRequired: string[];
  detectedProhibited: string[];
  missingFormatSignals: string[];
  /** The guard is conservative; this is true even if every span matched. */
  manualSemanticReviewRequired: true;
  notes: string[];
}

const ID = /^[a-z][a-z0-9_-]{0,79}$/;
const MAX_CANDIDATE = 32_768;

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === "object" && !Array.isArray(input);
}
function validAnchors(value: unknown, min: number): value is QualityAnchor[] {
  return Array.isArray(value) && value.length >= min && value.length <= 24 &&
    value.every(entry => isPlainObject(entry) &&
      typeof entry.id === "string" && ID.test(entry.id) &&
      typeof entry.label === "string" && entry.label.length > 0 && entry.label.length <= 180 &&
      Array.isArray(entry.oneOf) && entry.oneOf.length >= 1 && entry.oneOf.length <= 8 &&
      entry.oneOf.every((text: unknown) => typeof text === "string" &&
        text.trim().length > 0 && text.length <= 250) &&
      new Set(entry.oneOf).size === entry.oneOf.length) &&
    new Set(value.map(entry => entry.id)).size === value.length;
}

/** Schema-check the fixture before testing generated material. */
export function isQualityFixture(input: unknown): input is QualityFixture {
  if (!isPlainObject(input) || typeof input.id !== "string" || !ID.test(input.id) ||
      !QUALITY_TASKS.includes(input.task as QualityTask) ||
      typeof input.question !== "string" || !input.question.trim() || input.question.length > 1200 ||
      !validAnchors(input.required, 1) ||
      !validAnchors(input.prohibited, 0) ||
      (input.formatSignals !== undefined && !validAnchors(input.formatSignals, 0)) ||
      !isPlainObject(input.examples)) return false;
  const example = input.examples;
  if (typeof example.baseline !== "string" || example.baseline.length < 1 ||
      example.baseline.length > MAX_CANDIDATE ||
      typeof example.adapted !== "string" || example.adapted.length < 1 ||
      example.adapted.length > MAX_CANDIDATE ||
      !Array.isArray(example.regressions) || example.regressions.length < 1 ||
      example.regressions.length > 12) return false;
  const regressions = example.regressions as unknown[];
  const sections = [...input.required, ...input.prohibited, ...(input.formatSignals ?? [])] as QualityAnchor[];
  return new Set(sections.map(item => item.id)).size === sections.length &&
    regressions.every(entry => isPlainObject(entry) &&
      typeof entry.id === "string" && ID.test(entry.id) &&
      typeof entry.text === "string" && entry.text.length > 0 && entry.text.length <= MAX_CANDIDATE) &&
    new Set(regressions.map(entry => (entry as {id:string}).id)).size === regressions.length;
}

/** Normalize typography/casing only, NOT semantics or numbers. */
export function normalizeQualityText(text: string): string {
  return text.normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim().toLocaleLowerCase("en-US");
}
function matchEvidence(content: string, anchor: QualityAnchor): boolean {
  return anchor.oneOf.some(variant => content.includes(normalizeQualityText(variant)));
}

/** Checks only literal fixture-controlled spans; it CANNOT prove truth. */
export function evaluateQuality(fixture: QualityFixture, candidate: string): QualityResult {
  if (!isQualityFixture(fixture)) throw new Error("Invalid authored quality fixture");
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > MAX_CANDIDATE)
    throw new Error("Candidate explanation must be 1–32768 characters");
  const content = normalizeQualityText(candidate);
  const missingRequired = fixture.required.filter(item => !matchEvidence(content, item)).map(item => item.id);
  const detectedProhibited = fixture.prohibited.filter(item => matchEvidence(content, item)).map(item => item.id);
  const missingFormatSignals = (fixture.formatSignals ?? [])
    .filter(item => !matchEvidence(content, item)).map(item => item.id);
  return {
    caseId: fixture.id,
    guardPassed: missingRequired.length === 0 && detectedProhibited.length === 0,
    requiredMatched: fixture.required.length - missingRequired.length,
    requiredTotal: fixture.required.length,
    missingRequired,
    detectedProhibited,
    missingFormatSignals,
    manualSemanticReviewRequired: true,
    notes: [
      "Only reviewer-authored literal spans were checked; paraphrases can fail and contradictions can evade detection.",
      "Passing does not establish factual correctness, preserved meaning, learning gains or host-model compliance."
    ]
  };
}

export interface QualitySuiteResult {
  fixtureCount: number;
  positiveCasesPassed: number;
  positiveCasesTotal: number;
  negativeCasesRejected: number;
  negativeCasesTotal: number;
  passed: boolean;
  failures: { caseId: string; candidate: string; problem: string }[];
}

/** Verify authored controls before using a fixture as a regression gate. */
export function evaluateQualitySuite(fixtures: readonly QualityFixture[]): QualitySuiteResult {
  if (!Array.isArray(fixtures) || fixtures.length < 1 || fixtures.length > 100 ||
      fixtures.some(item => !isQualityFixture(item)) ||
      new Set(fixtures.map(item => item.id)).size !== fixtures.length)
    throw new Error("Invalid or duplicate quality regression fixture");
  const failures: QualitySuiteResult["failures"] = [];
  let positiveCasesPassed=0, negativeCasesRejected=0, negativeCasesTotal=0;
  for (const f of fixtures) {
    for (const variant of ["baseline", "adapted"] as const) {
      const score=evaluateQuality(f,f.examples[variant]);
      if (score.guardPassed) positiveCasesPassed++;
      else failures.push({caseId:f.id,candidate:variant,problem:"Expected approved exemplar to pass"});
    }
    for (const regression of f.examples.regressions) {
      negativeCasesTotal++;
      const score=evaluateQuality(f,regression.text);
      if (!score.guardPassed) negativeCasesRejected++;
      else failures.push({caseId:f.id,candidate:regression.id,problem:"Known defect escaped authored spans"});
    }
  }
  return {
    fixtureCount:fixtures.length,
    positiveCasesPassed,
    positiveCasesTotal:fixtures.length*2,
    negativeCasesRejected,
    negativeCasesTotal,
    passed: failures.length === 0,
    failures
  };
}
