import {
  LocalProfileStore, LocalAssessmentSessionStore, LocalAssessmentCheckpoint,
  withRecoveredLocalProfileLock
} from "../src/index.js";
import { createProfile, createAssessmentSession } from "@articulate/core";

const directory=process.argv[2];
if(!directory)throw new Error("Need local profile directory");
const profile=new LocalProfileStore(directory);
const session=new LocalAssessmentSessionStore(directory);
const data=createProfile("crash-user");
const progress=createAssessmentSession(data.profileId,"crash-session","crash-attempt",new Date().toISOString());
const checkpoint=new LocalAssessmentCheckpoint(directory,profile,session,{
  afterProfile:()=>process.exit(47)
});
await withRecoveredLocalProfileLock(directory,()=>checkpoint.commit(data,progress));
throw new Error("Crash injection failed to terminate process");
