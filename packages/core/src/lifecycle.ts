import { createProfile, confirmProfile, isArticulateProfile, type ArticulateProfile } from "./schema.ts";
import { createAssessmentSession, progress, type AssessmentSession } from "./session.ts";
import { withCalibrationSnapshot } from "./recalibration.ts";
import type { AssessmentBankId } from "./banks.ts";
import type { Question } from "./assessment.ts";

/** Active state remains usable while a fresh, explicitly approved draft accumulates. */
export function beginAssessment(
  active: ArticulateProfile, sessionId: string, attemptId: string, now: string,
  bank: AssessmentBankId = "classic", surfaces?: Question[] | null
): AssessmentSession {
  const neutral = createProfile(active.profileId, active.createdAt);
  const draftProfile: ArticulateProfile = {
    ...active, updatedAt: now, confirmedAt: null,
    evidence: [], dimensions: neutral.dimensions
  };
  return {...createAssessmentSession(active.profileId,sessionId,attemptId,now,bank,surfaces),draftProfile};
}

export function assessmentProfile(active: ArticulateProfile, session: AssessmentSession | null): ArticulateProfile {
  return session?.profileId === active.profileId ? session.draftProfile ?? active : active;
}

export function finishAssessment(active: ArticulateProfile, session: AssessmentSession, now: string) {
  if (session.profileId !== active.profileId || !progress(session).done)
    throw new Error("Finish the assessment before confirming.");
  const draft = assessmentProfile(active,session);
  if (!isArticulateProfile(draft)) throw new Error("Invalid assessment draft");
  // Disclosure permissions always come from the latest trusted local state.
  const profile = withCalibrationSnapshot(confirmProfile({...draft,consent:active.consent},now),now);
  const {draftProfile: _draft, ...completed} = session;
  return {profile,session:completed};
}
