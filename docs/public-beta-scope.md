# Public testing beta scope

This is a work-in-progress testing beta, not ready for general public/production
use. Public source allows volunteers to inspect behavior, reproduce problems and
exercise cross-platform CI. It does not establish security certification, broad
agent compatibility, learning gains or the correctness of inferred preferences.

## Included

Source required for the local CLI/MCP and optional local analysis, exact dependency
metadata, build/package scripts, synthetic tests, pinned CI, licenses/notices,
user setup/agent/privacy/testing docs, security guidance and maintainer guards.
Source and npm versions can differ. The staged source is alpha.8; the published
npm alpha remains alpha.7 until a separate reviewed publication succeeds.

## Excluded

Private development history, internal product/business documents, owner histories,
profile/activity databases, raw diagnostic reports, credentials, consent URLs,
device-bound host settings/extensions, caches and local build artifacts. Ignored
files are not part of the source manifest. CI artifacts contain synthetic test
reports and the allowlisted seven-file runtime package only.

Before the visibility transition, the maintainer audited all local Git objects,
tracked files, remote refs and existing Actions logs/artifacts, including nested
runtime archives. There were no issues or releases requiring separate content
review. Automated credential/owner-path checks found no matches in that audited
material; this supports review and is not a guarantee that all possible sensitive
strings or vulnerabilities can be detected. Normal author attribution remains
visible in Git history and license notices. Later changes require new review.

The destination guard fixes repository identity, public visibility and exact
source hashes. It forbids private-data/history imports and unattended package,
container and registry publication. The source package root stays npm-private.
No workflow changes repository visibility. A separate development repository is
kept private and is not used as a public CI workspace.

Standard GitHub-hosted runners are free for public repositories, subject to
GitHub's concurrency and other usage limits. Larger runners can be billed; this
workflow does not select them. Full native CI and real-host acceptance are separate
checks; inspect actual run results for the tested commit.

Report ordinary bugs with a redacted synthetic reproduction. Use GitHub private
vulnerability reporting for security issues, and never attach chats, profiles,
credentials, private code or consent links in public issues or workflow inputs.
