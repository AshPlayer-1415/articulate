#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { randomUUID } from "node:crypto";
import {
  DIMENSIONS, createProfile, beginAssessment, isAssessmentSession,
  currentQuestion, displayQuestion, progress, submitAssessmentAnswer,
  applyEvidence, resolvePolicy, policyToPrompt, createComparisonPreview, setDomainFamiliarity
} from "@articulate/core";
import { LocalProfileStore, LocalAssessmentSessionStore, LocalAssessmentCheckpoint, withRecoveredLocalProfileLock, withLocalProfileLock } from "@articulate/storage-local";

const profiles = new LocalProfileStore();
const sessions = new LocalAssessmentSessionStore();
const checkpoint = new LocalAssessmentCheckpoint(profiles.directory, profiles, sessions);
const cmd = process.argv[2] || "help";

async function main() {
  if (cmd === "profile") {
    const profile = await withRecoveredLocalProfileLock(profiles.directory, () => profiles.load());
    console.log(profile ? JSON.stringify(profile, null, 2) : "No profile stored on this device.");
    return;
  }
  if (cmd === "domain") {
    const subject = process.argv[3];
    const level = process.argv[4];
    if (!subject || !["new", "beginner", "intermediate", "advanced"].includes(level))
      throw new Error('Usage: npm run domain -- "subject name" beginner|new|intermediate|advanced');
    await withRecoveredLocalProfileLock(profiles.directory, async () => {
      let profile = await profiles.load();
      if (!profile) throw new Error("Complete an assessment first.");
      if ((await sessions.load())?.draftProfile) throw new Error("Finish or cancel the pending assessment before editing context.");
      profile = setDomainFamiliarity(profile, subject, level);
      await profiles.save(profile);
    });
    console.log("Self-reported subject familiarity stored locally; inspect with npm run profile.");
    return;
  }
  if (cmd === "demo") {
    const profile = await withRecoveredLocalProfileLock(profiles.directory, () => profiles.load());
    if (!profile) return console.log("Run npm run assessment first.");
    const demo = createComparisonPreview(profile);
    console.log("\\nARTICULATE EXPLANATION PREVIEW — " + demo.title);
    console.log("\\nBEFORE (same facts, conventional formatting):\\n" + demo.standard);
    console.log("\\nAFTER (same facts, profile-influenced structure):\\n" + demo.adapted);
    console.log("\\nResearch note: this is a deterministic layout comparison, not a model reply or proof of improved comprehension.");
    return;
  }
  if (cmd === "policy") {
    const profile = await withRecoveredLocalProfileLock(profiles.directory, () => profiles.load());
    if (!profile) return console.log("Run npm run assessment first.");
    console.log(policyToPrompt(resolvePolicy(profile, process.argv[3] || "concept")));
    console.log("\nThis output is local; nothing was transmitted to an AI provider.");
    return;
  }
  const rl = createInterface({ input, output });
  try {
    if (cmd === "reset") {
      if ((await rl.question("Type DELETE to remove your local Articulate profile and assessment progress: ")).trim() === "DELETE") {
        await withLocalProfileLock(profiles.directory, async () => {
          await checkpoint.discard();
          await sessions.remove();
          await profiles.remove();
        });
        console.log("Local profile and session removed.");
      } else console.log("No changes made.");
      return;
    }
    if (cmd === "cancel") {
      if ((await rl.question("Type CANCEL to discard the assessment draft and keep your active profile: ")).trim() === "CANCEL") {
        await withRecoveredLocalProfileLock(profiles.directory,()=>sessions.remove());
        console.log("Draft discarded; active profile retained.");
      }
      return;
    }
    if (cmd === "feedback") {
      const dimension = process.argv[3];
      const value = Number(process.argv[4]);
      if (!DIMENSIONS.includes(dimension) || !Number.isFinite(value) || value < 0 || value > 1)
        throw new Error("Usage: articulate feedback <dimension> <value 0..1>");
      await withRecoveredLocalProfileLock(profiles.directory, async () => {
        let profile = await profiles.load();
        if (!profile) throw new Error("First complete the assessment.");
        if ((await sessions.load())?.draftProfile) throw new Error("Finish or cancel the pending assessment before feedback.");
        if (profile.styles?.length) throw new Error("Edit the named style rule instead of dimension feedback.");
        const timestamp = new Date().toISOString();
        profile = applyEvidence(profile, [{
          itemId: "feedback-" + randomUUID(), dimension, score: value,
          reliability: 0.45, source: "explicit_feedback", timestamp
        }]);
        await profiles.save(profile);
      });
      console.log("Local profile updated. Inspect with npm run profile.");
      return;
    }
    if (cmd === "assess") {
      console.log("Articulate Research Alpha — approximately 8-minute hybrid calibration.");
      console.log("NOT a psychometric diagnosis or intelligence test. No Articulate server or model calls.");
      console.log("Raw free-text answers are not persisted; choice selections become derived evidence.");
      const consent = (await rl.question("Store your evolving profile and assessment progress ON THIS DEVICE? Type YES: ")).trim();
      if (consent !== "YES") return console.log("Cancelled; nothing was changed.");

      let { profile, session, resumed } = await withRecoveredLocalProfileLock(profiles.directory, async () => {
        let profile = await profiles.load() ?? createProfile("local-" + randomUUID());
        let session = await sessions.load();
        if (session && !isAssessmentSession(session)) throw new Error("Invalid saved progress");
        if (session && session.profileId !== profile.profileId)
          throw new Error("Saved progress belongs to a different profile. Use npm run reset to start fresh.");
        const resumed = Boolean(session && (session.draftProfile || !progress(session).done));
        if (!resumed) {
          session = beginAssessment(profile, "session-" + randomUUID(),
            "attempt-" + randomUUID(), new Date().toISOString());
          await checkpoint.commit(profile, session);
        }
        return { profile, session, resumed };
      });
      if (resumed)
        console.log("Resuming at question " + (session.nextIndex + 1) + " of " + progress(session).total + ".");

      while (!progress(session).done) {
        const p = progress(session);
        const item = displayQuestion(session);
        if (!item) break;
        const q = item.question;
        console.log("\nStage " + (p.stageIndex + 1) + "/" + p.stageCount + " — " + p.stageTitle);
        console.log("Question " + (p.completed + 1) + "/" + p.total + " (" + p.percent + "% complete)");
        console.log(q.prompt);
        if (item.comparisons) {
          for (const [index, v] of item.comparisons.entries())
            console.log("\n" + v.id + ") Explanation " + (index + 1) + "\n" + v.text);
        } else if (q.choices) {
          for (const v of q.choices) console.log("  " + v.id + ") " + v.label);
        }
        console.log("Type 'skip' to skip or 'quit' to save progress and return later.");
        const raw = (await rl.question("Your response: ")).trim();
        if (raw.toLowerCase() === "quit") {
          console.log("Your derived profile and question position remain on this device.");
          return;
        }
        let answer = raw.toLowerCase() === "skip" ? null : raw;
        if (answer !== null && q.kind === "likert") {
          if (!/^[1-5]$/.test(raw)) {
            console.log("Please enter one of 1, 2, 3, 4 or 5.");
            continue;
          }
          answer = Number(raw);
        }
        if (answer !== null && q.kind === "multi_choice")
          answer = raw.toLowerCase().split(",").map(x => x.trim()).filter(Boolean);
        if (answer !== null && (q.kind === "single_choice" || q.kind === "comprehension"))
          answer = raw.toLowerCase();

        try {
          const next = await withRecoveredLocalProfileLock(profiles.directory, async () => {
            const latestProfile = await profiles.load();
            const latestSession = await sessions.load();
            if (!latestProfile || !latestSession ||
                latestSession.sessionId !== session.sessionId ||
                latestSession.nextIndex !== session.nextIndex ||
                latestSession.profileId !== profile.profileId) {
              const conflict = new Error("Assessment changed in another local client.");
              conflict.code = "STALE_ASSESSMENT";
              throw conflict;
            }
            const result = submitAssessmentAnswer(latestSession, latestProfile, answer, new Date().toISOString());
            await checkpoint.commit(result.profile, result.session);
            return result;
          });
          profile = next.profile;
          session = next.session;
        } catch (e) {
          if (e.code === "STALE_ASSESSMENT") {
            console.log("Progress changed in another local client; reloading the current question.");
            const fresh = await withRecoveredLocalProfileLock(profiles.directory, async () => ({
              profile: await profiles.load(), session: await sessions.load()
            }));
            if (!fresh.profile || !fresh.session || fresh.session.profileId !== fresh.profile.profileId)
              throw new Error("Local progress was replaced or erased. Restart the assessment.");
            profile = fresh.profile;
            session = fresh.session;
          } else console.log("Please try again: " + e.message);
        }
      }
      console.log("\nCompleted. The provisional profile is stored only on this device.");
      if (session.transferCheck) console.log("Concept application check: " + (session.transferCheck.correct ? "correct" : "not correct yet") + ".");
      console.log("Use articulate_review_profile in your MCP host to review the draft, then explicitly confirm it.");
      console.log("The comparison stimuli are exploratory; they are not yet a validated psychometric assessment.");
      // Keep the completed session for explicit review/confirmation in the MCP client.
      return;
    }
    console.log("Commands: assess | profile | demo | domain <subject> <level> | policy [concept|debugging|mathematics|research|shipping] | feedback <dimension> <0..1> | cancel | reset");
  } finally { rl.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
