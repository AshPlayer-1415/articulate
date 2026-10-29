import { canonicalMeasurementMatches, validateAdaptiveItem } from "./adaptive.ts";
import { ASSESSMENT, type Answer, type Question, interpretAnswer } from "./assessment.ts";
import {
  AGENT_STAGES, AGENT_V2_STAGES, ASSESSMENT_BANKS, type AssessmentBankId, getAssessmentBank
} from "./banks.ts";
import { applyEvidence } from "./scoring.ts";
import { isArticulateProfile, type ArticulateProfile, type Evidence } from "./schema.ts";
import { COMPARISON_STIMULI, displayVariants, evaluateTransferAnswer } from "./stimuli.ts";

export const STAGES = [
  { id: "background", title: "Background", questionIds: ["background"] },
  { id: "preferences", title: "How you prefer explanations", questionIds: ["overview", "depth", "organization", "format", "components"] },
  { id: "guidance", title: "Guidance and reflection", questionIds: ["guidance", "interaction", "uncertainty", "cloze"] },
  { id: "comparison", title: "Compare and apply", questionIds: ["comparison", "transfer"] }
] as const;

export interface AssessmentSession {
  /** 1 = classic bank only; 2 = bankId-aware (agent_v1 / agent_v2 / classic). */
  version: 1 | 2;
  sessionId: string;
  attemptId: string;
  profileId: string;
  startedAt: string;
  updatedAt: string;
  nextIndex: number;
  skippedQuestionIds: string[];
  transferCheck: { correct: boolean; rubricId: string } | null;
  /** Present on version 2; version 1 is treated as classic. */
  bankId?: AssessmentBankId;
  /**
   * Optional host-personalized surfaces (same ids/order as the bank).
   * Validated before save; never contains raw user answers.
   */
  surfaceOverrides?: Question[];
  /** Unconfirmed replacement. Never used for live policy until explicit promotion. */
  draftProfile?: ArticulateProfile;
}

export interface AssessmentProgress {
  completed: number;
  total: number;
  percent: number;
  stageIndex: number;
  stageCount: number;
  stageTitle: string;
  done: boolean;
  bankId: AssessmentBankId;
}

function bankFor(session: AssessmentSession): AssessmentBankId {
  if (session.version === 2 && session.bankId && Object.hasOwn(ASSESSMENT_BANKS, session.bankId)) return session.bankId;
  return "classic";
}

function questionsFor(session: AssessmentSession): readonly Question[] {
  const bank = getAssessmentBank(bankFor(session));
  if (!session.surfaceOverrides) return bank;
  if (session.surfaceOverrides.length !== bank.length) return bank;
  if (!session.surfaceOverrides.every((q, i) => q && q.id === bank[i].id)) return bank;
  return session.surfaceOverrides;
}

function stagesFor(session: AssessmentSession) {
  const id = bankFor(session);
  if (id === "agent_v1") return AGENT_STAGES;
  if (id === "agent_v2") return AGENT_V2_STAGES;
  return STAGES;
}

export function createAssessmentSession(
  profileId: string,
  sessionId: string,
  attemptId: string,
  now: string,
  bankId: AssessmentBankId = "classic",
  surfaceOverrides?: Question[] | null
): AssessmentSession {
  if (!profileId || !sessionId || !attemptId || !Number.isFinite(Date.parse(now))) throw new Error("Invalid session identity");
  if (!(Object.hasOwn(ASSESSMENT_BANKS, bankId))) throw new Error("Unknown assessment bank");
  const bank = getAssessmentBank(bankId);
  let overrides: Question[] | undefined;
  if (surfaceOverrides) {
    if (surfaceOverrides.length !== bank.length ||
        !surfaceOverrides.every((q, i) => q && q.id === bank[i].id))
      throw new Error("surfaceOverrides must match the assessment bank ids in order");
    if (!surfaceOverrides.every((q,i)=>canonicalMeasurementMatches(bank[i],q)))
      throw new Error("Assessment surface measurement differs from canonical bank");
    overrides = surfaceOverrides;
  }
  return {
    version: 2, sessionId, attemptId, profileId, startedAt: now, updatedAt: now,
    nextIndex: 0, skippedQuestionIds: [], transferCheck: null, bankId,
    ...(overrides ? { surfaceOverrides: overrides } : {})
  };
}

export function isAssessmentSession(data: unknown): data is AssessmentSession {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const p = data as Record<string, unknown>;
  const count = p.nextIndex;
  if ((p.version !== 1 && p.version !== 2) || typeof p.sessionId !== "string" || !p.sessionId ||
      typeof p.profileId !== "string" || !p.profileId || typeof p.attemptId !== "string" || !p.attemptId ||
      typeof p.startedAt !== "string" || !Number.isFinite(Date.parse(p.startedAt)) ||
      typeof p.updatedAt !== "string" || !Number.isFinite(Date.parse(p.updatedAt)) ||
      !Number.isInteger(count) || (count as number) < 0)
    return false;
  if (p.version === 2 && p.bankId !== undefined &&
      (typeof p.bankId !== "string" || !(Object.hasOwn(ASSESSMENT_BANKS, p.bankId)))) return false;
  const bankId: AssessmentBankId = p.version === 2 && typeof p.bankId === "string" && Object.hasOwn(ASSESSMENT_BANKS, p.bankId)
    ? (p.bankId as AssessmentBankId)
    : "classic";
  const bank = getAssessmentBank(bankId);
  if ((count as number) > bank.length) return false;
  const index = new Map(bank.map((q, i) => [q.id, i]));
  if (!Array.isArray(p.skippedQuestionIds) || p.skippedQuestionIds.length > bank.length ||
      p.skippedQuestionIds.some(v => typeof v !== "string" || !index.has(v)) ||
      new Set(p.skippedQuestionIds).size !== p.skippedQuestionIds.length) return false;
  if (p.transferCheck !== null) {
    const t = p.transferCheck as Record<string, unknown> | undefined;
    if (!t || typeof t.correct !== "boolean" || t.rubricId !== "factorial4-2026-01") return false;
  }
  if (p.draftProfile !== undefined && (!isArticulateProfile(p.draftProfile) ||
      p.draftProfile.profileId !== p.profileId || p.draftProfile.confirmedAt)) return false;
  if (p.surfaceOverrides !== undefined) {
    if (!Array.isArray(p.surfaceOverrides) || p.surfaceOverrides.length !== bank.length) return false;
    for (let i = 0; i < bank.length; i++) {
      const q = p.surfaceOverrides[i] as Question | undefined;
      if (!q || typeof q !== "object" || q.id !== bank[i].id || typeof q.kind !== "string" ||
          typeof q.prompt !== "string" || q.prompt.length < 1 || q.prompt.length > 1200)
        return false;
      if (!canonicalMeasurementMatches(bank[i],q)) return false;
      if (JSON.stringify(q)!==JSON.stringify(bank[i]) && !validateAdaptiveItem(q).ok) return false;
    }
  }
  return true;
}

export function currentQuestion(session: AssessmentSession): Question | null {
  return questionsFor(session)[session.nextIndex] ?? null;
}

export function progress(session: AssessmentSession): AssessmentProgress {
  const bank = questionsFor(session);
  const bankId = bankFor(session);
  const total = bank.length;
  const done = session.nextIndex === total;
  const id = currentQuestion(session)?.id ?? bank[total - 1].id;
  const stages = stagesFor(session);
  const stageIndex = Math.max(0, stages.findIndex(s => (s.questionIds as readonly string[]).includes(id)));
  return {
    completed: session.nextIndex, total,
    percent: Math.round((session.nextIndex / total) * 100),
    stageIndex, stageCount: stages.length, stageTitle: stages[stageIndex].title, done, bankId
  };
}

export function displayQuestion(session: AssessmentSession): { question: Question; comparisons: ReturnType<typeof displayVariants> | null } | null {
  const question = currentQuestion(session);
  if (!question) return null;
  const set = question.id === "format" || question.id === "comparison" ? COMPARISON_STIMULI[question.id] : null;
  const canonical=getAssessmentBank(bankFor(session)).find(q=>q.id===question.id);
  const custom=set && JSON.stringify(question)!==JSON.stringify(canonical);
  const stimulus=custom ? {...set,variants:question.choices!.map(c=>({
    id:c.id as "a"|"b"|"c",title:c.label,text:c.text ?? c.label
  }))} : set;
  return { question, comparisons: stimulus ? displayVariants(stimulus, session.sessionId) : null };
}

const SKIPPABLE = new Set<Question["kind"]>([
  "comprehension", "free_text", "single_choice", "multi_choice", "likert",
  "sentence_preference", "cloze_choice", "structure_compare"
]);

export function submitAssessmentAnswer(
  session: AssessmentSession, profile: ArticulateProfile, answer: Answer | null, now: string
): { session: AssessmentSession; profile: ArticulateProfile } {
  if (!isAssessmentSession(session)) throw new Error("Invalid session");
  if (session.profileId !== profile.profileId) throw new Error("Profile does not match session");
  if (!Number.isFinite(Date.parse(now))) throw new Error("Invalid submission timestamp");
  // Upgrade legacy in-progress sessions before they can mutate a confirmed profile.
  if (!session.draftProfile && profile.confirmedAt)
    session={...session,draftProfile:{...profile,confirmedAt:null}};
  const working = session.draftProfile ?? profile;
  const question = currentQuestion(session);
  if (!question) throw new Error("Assessment already complete");
  if (answer === null && SKIPPABLE.has(question.kind)) {
    return { session: { ...session, nextIndex: session.nextIndex + 1, updatedAt: now,
      skippedQuestionIds: [...session.skippedQuestionIds, question.id] }, profile };
  }
  if (typeof answer === "string" && answer.length > 2000) throw new Error("Answer exceeds 2000 characters");
  let transfer = session.transferCheck;
  let evidence: Evidence[] = [];
  if (question.id === "transfer") {
    if (typeof answer !== "string") throw new Error("Choose a transfer answer");
    transfer = evaluateTransferAnswer(answer);
  } else {
    if (question.kind === "free_text" && typeof answer !== "string") throw new Error("Expected text");
    evidence = interpretAnswer(question, answer!, now, session.attemptId);
  }
  const updated = evidence.length ? applyEvidence(working, evidence) : working;
  return {
    session: { ...session, nextIndex: session.nextIndex + 1, updatedAt: now, transferCheck: transfer,
      ...(session.draftProfile ? {draftProfile: updated} : {}) },
    profile: session.draftProfile ? profile : updated
  };
}

/** @deprecated Prefer getAssessmentBank — exported for older imports. */
export const CLASSIC_ASSESSMENT = ASSESSMENT;
