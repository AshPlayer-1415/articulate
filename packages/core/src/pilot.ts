/**
 * Comprehension pilot helpers (v0.5). Synthetic topics + counterbalancing +
 * human score-sheet shapes. Never claims learning efficacy from preferences.
 */

export const PILOT_CONCEPT_RUBRIC_MAX = 3;
export const PILOT_CONDITIONS = ["default", "adapted"] as const;
export type PilotCondition = (typeof PILOT_CONDITIONS)[number];

export interface PilotTransferRubric {
  correctIfMentions: readonly string[];
  mustNotClaim: readonly string[];
}

export interface PilotTopic {
  id: string;
  title: string;
  qualityCaseId: string | null;
  task: string;
  canonicalFacts: readonly string[];
  caveats: readonly string[];
  conceptPrompt: string;
  transferPrompt: string;
  transferRubric: PilotTransferRubric;
}

export interface PilotPair {
  id: string;
  theme: string;
  topics: readonly [PilotTopic, PilotTopic] | readonly PilotTopic[];
}

export interface PilotCatalog {
  version: number;
  disclaimer: string;
  primaryEndpoint: string;
  secondaryEndpoints: readonly string[];
  pairs: readonly PilotPair[];
}

export interface PilotAssignment {
  participantSlot: number;
  pairId: string;
  order: readonly { topicId: string; condition: PilotCondition }[];
  note: string;
}

export interface PilotScoreSheet {
  participantSlot: number;
  pairId: string;
  topicId: string;
  condition: PilotCondition;
  conceptRubric0to3: null;
  transferCorrect: null;
  timeToAdequateSeconds: null;
  clarificationTurns: null;
  perceivedEffort1to5: null;
  safetyGateFailed: null;
  scorerNotes: "";
  instructions: string[];
}

export interface PilotSessionPlan {
  participantSlot: number;
  assignments: PilotAssignment[];
  scoreSheets: PilotScoreSheet[];
  prohibitions: string[];
}

export interface PilotRecordedScore {
  participantSlot: number;
  pairId: string;
  topicId: string;
  condition: PilotCondition;
  conceptRubric0to3: number;
  transferCorrect: boolean;
  timeToAdequateSeconds?: number | null;
  clarificationTurns?: number | null;
  perceivedEffort1to5?: number | null;
  safetyGateFailed?: boolean;
}

export interface PilotAggregate {
  incompletePairs: number;
  excludedSafetyPairs: number;
  nPairedConceptScores: number;
  meanAdaptedMinusDefault: number | null;
  transferAccuracyDefault: number | null;
  transferAccuracyAdapted: number | null;
  disclaimer: string;
  status: "DRY_RUN_ONLY_NOT_EFFICACY_EVIDENCE";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPilotCatalog(data: unknown): data is PilotCatalog {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const c = data as Record<string, unknown>;
  if (c.version !== 1 || !isNonEmptyString(c.disclaimer) || !isNonEmptyString(c.primaryEndpoint))
    return false;
  if (!Array.isArray(c.secondaryEndpoints) || !Array.isArray(c.pairs) || c.pairs.length < 1)
    return false;
  for (const pair of c.pairs) {
    if (!pair || typeof pair !== "object") return false;
    const p = pair as Record<string, unknown>;
    if (!isNonEmptyString(p.id) || !isNonEmptyString(p.theme) || !Array.isArray(p.topics) || p.topics.length !== 2)
      return false;
    for (const topic of p.topics) {
      if (!topic || typeof topic !== "object") return false;
      const t = topic as Record<string, unknown>;
      if (!isNonEmptyString(t.id) || !isNonEmptyString(t.title) || !isNonEmptyString(t.task))
        return false;
      if (t.qualityCaseId !== null && !isNonEmptyString(t.qualityCaseId)) return false;
      if (!Array.isArray(t.canonicalFacts) || t.canonicalFacts.length < 2) return false;
      if (!t.canonicalFacts.every(isNonEmptyString)) return false;
      if (!Array.isArray(t.caveats) || !t.caveats.every(isNonEmptyString)) return false;
      if (!isNonEmptyString(t.conceptPrompt) || !isNonEmptyString(t.transferPrompt)) return false;
      const rub = t.transferRubric as Record<string, unknown> | undefined;
      if (!rub || !Array.isArray(rub.correctIfMentions) || !Array.isArray(rub.mustNotClaim)) return false;
      if (!rub.correctIfMentions.every(isNonEmptyString) || !rub.mustNotClaim.every(isNonEmptyString))
        return false;
    }
  }
  return true;
}

export function listPilotTopics(catalog: PilotCatalog): PilotTopic[] {
  return catalog.pairs.flatMap(pair => [...pair.topics]);
}

/**
 * Counterbalanced within-person assignment for one synthetic participant slot.
 * Even slots: first topic default, second adapted. Odd slots: reversed.
 */
export function assignPilotPair(
  catalog: PilotCatalog,
  pairId: string,
  participantSlot: number
): PilotAssignment {
  if (!Number.isInteger(participantSlot) || participantSlot < 0)
    throw new Error("participantSlot must be a non-negative integer");
  const pair = catalog.pairs.find(p => p.id === pairId);
  if (!pair) throw new Error("Unknown pilot pair id");
  const [a, b] = pair.topics;
  const reverse = participantSlot % 2 === 1;
  const order = reverse
    ? [
        { topicId: a.id, condition: "adapted" as const },
        { topicId: b.id, condition: "default" as const }
      ]
    : [
        { topicId: a.id, condition: "default" as const },
        { topicId: b.id, condition: "adapted" as const }
      ];
  return {
    participantSlot,
    pairId,
    order,
    note: reverse
      ? "Odd slot: adapted-first then default (order counterbalance)."
      : "Even slot: default-first then adapted (order counterbalance)."
  };
}

export function buildPilotSessionPlan(
  catalog: PilotCatalog,
  participantSlot: number
): PilotSessionPlan {
  const assignments = catalog.pairs.map(pair => assignPilotPair(catalog, pair.id, participantSlot));
  const byId = new Map(listPilotTopics(catalog).map(t => [t.id, t]));
  const scoreSheets: PilotScoreSheet[] = [];
  for (const assignment of assignments) {
    for (const step of assignment.order) {
      const topic = byId.get(step.topicId);
      if (!topic) throw new Error("Missing topic in assignment");
      scoreSheets.push({
        participantSlot, pairId:assignment.pairId,
        topicId: topic.id,
        condition: step.condition,
        conceptRubric0to3: null,
        transferCorrect: null,
        timeToAdequateSeconds: null,
        clarificationTurns: null,
        perceivedEffort1to5: null,
        safetyGateFailed: null,
        scorerNotes: "",
        instructions: [
          "Score concept explanation 0–3 using the mechanism rubric (not enjoyment).",
          "Mark transferCorrect only against the authored transfer rubric.",
          "Fail safetyGate if facts/caveats were altered even if the user liked the answer.",
          "Do not store participant names, chat URLs, or real profiles in this sheet."
        ]
      });
    }
  }
  return {
    participantSlot,
    assignments,
    scoreSheets,
    prohibitions: [
      "Do not treat preference scores or satisfaction as comprehension.",
      "Do not publish dry-run aggregates as efficacy evidence.",
      "Do not commit real participant answers, profiles, or transcripts.",
      "Human semantic review is required before any claim about factual fidelity."
    ]
  };
}

export function validatePilotRecord(record: unknown): PilotRecordedScore {
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw new Error("Pilot record must be an object");
  const r = record as Record<string, unknown>;
  if (!Number.isInteger(r.participantSlot) || (r.participantSlot as number)<0 || (r.participantSlot as number)>9999)
    throw new Error("Anonymous participantSlot 0–9999 required");
  if (typeof r.pairId!=="string" || !/^[a-z][a-z0-9_-]{0,79}$/.test(r.pairId))
    throw new Error("pairId required");
  if (!isNonEmptyString(r.topicId)) throw new Error("topicId required");
  for (const key of ["timeToAdequateSeconds","clarificationTurns","perceivedEffort1to5"] as const) {
    const n=r[key];
    if (n != null && (typeof n!=="number" || !Number.isFinite(n) || n<0)) throw new Error("Invalid pilot metric");
  }
  if (r.clarificationTurns != null && !Number.isInteger(r.clarificationTurns)) throw new Error("Invalid clarification count");
  if (r.perceivedEffort1to5 != null && (!Number.isInteger(r.perceivedEffort1to5) || (r.perceivedEffort1to5 as number)<1 || (r.perceivedEffort1to5 as number)>5)) throw new Error("Invalid effort rating");
  if (r.condition !== "default" && r.condition !== "adapted")
    throw new Error("condition must be default or adapted");
  if (typeof r.conceptRubric0to3 !== "number" || !Number.isInteger(r.conceptRubric0to3) ||
      r.conceptRubric0to3 < 0 || r.conceptRubric0to3 > PILOT_CONCEPT_RUBRIC_MAX)
    throw new Error("conceptRubric0to3 must be an integer 0–3");
  if (typeof r.transferCorrect !== "boolean") throw new Error("transferCorrect must be boolean");
  return {
    participantSlot: r.participantSlot as number,
    pairId: r.pairId,
    topicId: r.topicId,
    condition: r.condition,
    conceptRubric0to3: r.conceptRubric0to3,
    transferCorrect: r.transferCorrect,
    timeToAdequateSeconds: typeof r.timeToAdequateSeconds === "number" ? r.timeToAdequateSeconds : null,
    clarificationTurns: typeof r.clarificationTurns === "number" ? r.clarificationTurns : null,
    perceivedEffort1to5: typeof r.perceivedEffort1to5 === "number" ? r.perceivedEffort1to5 : null,
    safetyGateFailed: r.safetyGateFailed === true
  };
}

/**
 * Aggregate synthetic/human-entered scores for dry-run plumbing only.
 * Always returns NOT_EFFICACY_EVIDENCE.
 */
export function aggregatePilotScores(records: readonly unknown[]): PilotAggregate {
  const scored = records.map(validatePilotRecord);
  const groups = new Map<string, PilotRecordedScore[]>();
  for (const r of scored) {
    const key=r.participantSlot+":"+r.pairId;
    const group=groups.get(key) ?? [];
    if (group.some(p=>p.condition===r.condition || p.topicId===r.topicId))
      throw new Error("Duplicate participant/pair condition or topic");
    group.push(r);groups.set(key,group);
  }
  const deltas: number[] = [];
  const defaults: PilotRecordedScore[] = [], adapted: PilotRecordedScore[] = [];
  let incompletePairs=0, excludedSafetyPairs=0;
  for (const pair of groups.values()) {
    if (pair.some(r=>r.safetyGateFailed)) {excludedSafetyPairs++;continue;}
    const d=pair.find(r=>r.condition==="default"), a=pair.find(r=>r.condition==="adapted");
    if (!d || !a) {incompletePairs++;continue;}
    deltas.push(a.conceptRubric0to3-d.conceptRubric0to3);
    defaults.push(d);adapted.push(a);
  }
  const rate = (xs: PilotRecordedScore[]) =>
    xs.length ? xs.filter(x => x.transferCorrect).length / xs.length : null;
  return {
    incompletePairs, excludedSafetyPairs,
    nPairedConceptScores: deltas.length,
    meanAdaptedMinusDefault: deltas.length
      ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 1000) / 1000
      : null,
    transferAccuracyDefault: rate(defaults),
    transferAccuracyAdapted: rate(adapted),
    disclaimer:
      "DRY RUN / PIPELINE CHECK ONLY. Not a powered study, not efficacy evidence, not a marketing claim. Follow docs/evaluation-protocol.md before any real pilot.",
    status: "DRY_RUN_ONLY_NOT_EFFICACY_EVIDENCE"
  };
}

/** Heuristic transfer check for synthetic dry-runs — not comprehension measurement. */
export function screenTransferAnswer(
  topic: PilotTopic,
  answer: string
): { likelyCorrect: boolean; matched: string[]; hitProhibited: string[]; note: string } {
  const text = answer.toLowerCase();
  const matched = topic.transferRubric.correctIfMentions.filter(s => text.includes(s.toLowerCase()));
  const hitProhibited = topic.transferRubric.mustNotClaim.filter(s => text.includes(s.toLowerCase()));
  return {
    likelyCorrect: matched.length > 0 && hitProhibited.length === 0,
    matched,
    hitProhibited,
    note: "Literal cue screen only. Human rubric scoring is required for pilot outcomes."
  };
}
