# Public testing beta checklist

On 2026-10-31 the owner authorized this clean repository becoming public for
volunteer testing and standard public GitHub Actions. It is not ready for general
public/production use. The separate development repository remains private.
No workflow changes visibility or publishes npm/container/registry artifacts.

## Public contents and privacy

- CLI/MCP source and required local runtime modules, exact dependency lockfile,
  version metadata and build scripts.
- Synthetic regression tests, pinned cross-platform CI and package checks.
- Apache-2.0 license, NOTICE, dependency notice generation, setup/agent/privacy/
  testing/contribution/security docs and a redacted bug template.
- Exact source manifest and destination guards remain enforced. The source root
  stays npm-private; only the separately reviewed seven-file runtime is publishable.
- Before visibility changes, audit all Git objects/history/author attribution and
  remote refs, releases, issues, Actions logs and artifacts. Ignored artifacts are
  not published by Git, but existing remote Actions surfaces become visible.
- Exclude owner histories, private development history, internal reports, device
  paths, profiles, databases, credentials, consent links and host configurations.
  Synthetic tests/runner paths and normal open-source author attribution differ
  from owner activity. Pattern scans support review; they are not a secrecy proof.

## Verification gates

- README and future package README prominently identify the testing beta.
- Read actual native CI results for the current commit; a workflow file or older
  build's pass does not verify changed bytes.
- Test real agent UI install/reload on a Mac and Windows machine. Linux CLI and
  real desktop/model acceptance are separate checks.
- Review usefulness and factual fidelity independently. Source/test success does
  not establish learning gains, injection immunity or broad model compatibility.
- Enable and verify GitHub private vulnerability reporting before inviting public
  security feedback. Never request exploitable details or histories in issues.

## npm status

Published on 2026-11-02: `articulate-local@2.3.0-beta.1`, installed explicitly
with `npm install --global articulate-local@beta`. Alpha/latest stay on
2.2.0-alpha.7. The [public receipt](releases/2.3.0-beta.1-verification.json) records
the successful native run, canonical archive, registry integrity and anonymous
install checks. The exact manual publication scope stays pinned in release-policy.json.
Do not republish immutable versions or reuse their CI for a changed runtime.
Prepare a new exact policy and owner authorization for another version.
Authentication/2FA belongs in the owner's terminal/browser, never in chat or
Actions secrets for an unattended publisher.

Standard hosted runners are free for public repositories; concurrency and other
GitHub usage limits still apply. Do not enable paid/larger runners, broaden token
permissions or weaken testing to circumvent an account restriction. Repository
visibility does not register an MCP directory or claim vendor marketplace approval.

The profile milestone requires a fresh 9-job OS/Node matrix including the new
installed-package suite. Review exact source and package hashes before approval;
old alpha verification never substitutes for this changed runtime.

On 2026-11-01 the owner explicitly kept 2.3.0-beta.1 staged after native checks
passed. Do not retry publication or authentication until the owner resumes it.

On 2026-11-02 the owner resumed manual publication of the same frozen beta
artifact. Authentication and a fresh anonymous registry install remain required;
no package bytes or successful native-CI provenance were changed.

The owner resumed and approved publication on 2026-11-02. The frozen beta was
published and anonymous registry verification passed; the earlier hold is historical.
