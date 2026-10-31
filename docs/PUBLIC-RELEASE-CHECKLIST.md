# Public repository and npm checklist

The owner authorized public npm publication on 2026-10-30 while keeping GitHub
private. Only the exact reviewed tarball is authorized for manual publication;
no workflow publishes or changes visibility. Friends do not need source-repo
access. The full runtime README is served by npm and ships inside the package.

## Repository contents

- [x] CLI and local MCP source, exact dependency lockfile and version metadata.
- [x] Working build of a JavaScript-only CLI package, with an explicit file allowlist.
- [x] macOS/Windows/Linux CI for source tests, type checking and installed-package MCP checks.
- [x] README with repository install path and separate later npm instructions.
- [x] Claude Code/Desktop, Codex and Cursor connection/permission guide.
- [x] Complete Apache-2.0 text, project NOTICE and bundled dependency notices.
- [x] Privacy, troubleshooting, testing, contribution and security-reporting docs.
- [x] Bug template requesting only versions and redacted synthetic reproduction.
- [x] No private Git history, owner data, credentials, raw reports or device-bound bundles.
- [ ] Review all CI results for the final commit; a workflow file is not evidence of a pass.
- [ ] Test actual agent UI install/reload on one Mac and one Windows machine.

## Optional later public-source release

1. Review the full tracked tree, Git author metadata/history, license/attribution
   and final CI results. Keep the separate development repository private.
2. Confirm this is your intended alpha scope and claims. Inference remains
   experimental; no learning/factual-improvement/security-certification claim.
3. Make this clean repository public in GitHub Settings when satisfied.
4. Enable GitHub private vulnerability reporting and verify its reporting form;
   SECURITY.md alone does not enable it. Use private reports for sensitive issues.

## Publish the reviewed public npm package with private GitHub

`articulate` is already an unrelated npm package. The prepared name is
`articulate-local`, found unregistered on 2026-10-29 but not reserved. Check again
using your own npm account before publication; availability is not ownership.

From a reviewed checkout, with Node/npm installed:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run build
npm run test:distribution
npm run test:resilience
npm pack ./dist/local --dry-run --ignore-scripts
npm login
npm publish /absolute/path/to/reviewed/articulate-local-2.2.0-alpha.7.tgz --tag alpha --access public --registry=https://registry.npmjs.org/ --ignore-scripts
```

The first published version is the prerelease 2.2.0-alpha.7. npm automatically
added both alpha/latest during processing; removing latest returned HTTP 400.
Both currently reference the alpha. Use @alpha explicitly and do not claim a
stable release. The published artifact passed an unauthenticated fresh-cache
global install, npx launch, README check and read-only MCP smoke. Confirm the
actual package name/version, alpha tag, seven-file pack list and policy-pinned
SHA-256 before publishing. Prefer the successful CI canonical artifact from the reviewed source commit.
For this first publication, runtime files exactly match successful run
41144672833; only the self-contained README and npm homepage/issue links changed.
The new tarball was inspected and passed local install/MCP tests. A fresh run
41175863862 could not start because GitHub reported an account payment/spending
restriction; it is not recorded as a passing new CI run. The exact current
artifact SHA and original runtime evidence are pinned in release-policy.json. Complete
npm's account/2FA requirements yourself; never commit a token or put one in a
workflow. The monorepo root remains `private:true`; publish only `dist/local`.
Then test from a fresh directory with `npx --yes --package articulate-local@alpha
articulate help`, and update the README's publication status with the exact version.

This does not register the MCP in a directory or claim vendor marketplace approval.

## Actual first publication

Published 2026-10-30 (publisher local date), account ash-player3.1415, exact
reviewed artifact SHA-256
1198facd84b3597c0e6455260be8e628b71103ae34e0e53edbed0cd6e444ccda.
Registry integrity matches the submitted bytes. The initial placeholder was not
reported as the release; version/tag/owner and fresh registry installation were
verified after processing. Seven public-runtime smoke checks passed. GitHub
visibility was checked and remained private. No credentials or codes were shared.
A published name/version cannot be reused; future changes require a new version,
review and explicit publication scope. Do not retry this publication.
