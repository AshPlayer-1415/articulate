# Public repository and npm checklist

The repository is prepared while private. The owner makes it public and publishes
npm separately; no workflow does either automatically.

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

## Owner: before changing visibility

1. Review the full tracked tree, Git author metadata/history, license/attribution
   and final CI results. Keep the separate development repository private.
2. Confirm this is your intended alpha scope and claims. Inference remains
   experimental; no learning/factual-improvement/security-certification claim.
3. Make this clean repository public in GitHub Settings when satisfied.
4. Enable GitHub private vulnerability reporting and verify its reporting form;
   SECURITY.md alone does not enable it. Use private reports for sensitive issues.

## Owner: publish the built npm package

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
npm pack ./dist/local --dry-run --ignore-scripts
npm login
npm publish ./dist/local --tag alpha --access public
```

The first publication is an alpha tag, not a stable `latest` release. Confirm the
actual package name/version and seven-file pack list before publishing. Complete
npm's account/2FA requirements yourself; never commit a token or put one in a
workflow. The monorepo root remains `private:true`; publish only `dist/local`.
Then test from a fresh directory with `npx --yes --package articulate-local@alpha
articulate help`, and update the README's publication status with the exact version.

This does not register the MCP in a directory or claim vendor marketplace approval.
