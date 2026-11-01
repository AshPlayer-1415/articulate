# Profile/shortcut build evidence — 2026-11-01

This ledger separates primary documentation, engineering observations and limits.
All new test stores are synthetic. No owner histories or credentials are fixtures.

## Primary sources and decisions

- [MCP tools specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools),
  read 2026-11-01: tools expose schemas; hosts choose their interaction model.
  The 2026 revision also recommends deterministic tool ordering for cache reuse.
  Decision: keep a stable tool catalog, explicit profile/project/session arguments
  and a CLI picker. Do not promise a universal native dropdown.
- [Cursor CLI MCP documentation](https://prod.cursor.com/docs/cli/mcp), read
  2026-11-01: CLI shares MCP configuration with the editor, supports tool listing
  and explicit enable/disable. The transport test uses a pinned official Cursor
  2026.10.22-27dcf5f archive with independent SHA-256 per platform. Discovery alone
  does not establish model invocation or GUI behavior.
- [Node 24.22.2 release notes](https://nodejs.org/en/blog/release/v24.22.2), read
  2026-11-01: retained the patched tested runtime. Native matrix pins 22.23.4,
  24.22.2 and 26.13.0; no dependency upgrade was needed for scoped data storage.
- [SQLite PRAGMA reference](https://www.sqlite.org/pragma.html#pragma_secure_delete),
  consulted 2026-11-01: logical clearing/compaction cannot promise forensic erasure
  of backups, external runtime copies or provider data. Generation checks prevent
  already-open current-version writers from restoring erased application records.

Installed MCP SDK is 2.4.0. An official GitHub releases-page fetch failed; a search
snippet is not treated as a complete release-note review or proof of newest SDK
status. A versioned Node API-document fetch also failed earlier; runtime behavior
is verified directly. No claim of universal MCP-host conformance is made.

## Engineering gates

Source tests cover migration rollback, aliases, CAS edits, parent revision pins,
parallel client/chat selection, independent grants, stale scope approvals, context
budgets/cache provenance, source erasure, model deletion races, General denial,
procedure pins/inputs/versions, stale or linked documentation, malformed JSON,
explicit overall aggregation and whole-store writer retirement.

Installed-package checks exercise all four client configurations through actual
SDK stdio transports. Separate real Cursor CLI checks cover discovery/model use;
report each exact runtime and outcome. Do not equate client labels with native
Codex, Claude Code or Claude Desktop GUI execution.

First attempts are preserved in private local logs. A restricted local run failed
permission-server setup with listen EPERM; rerunning with loopback permission
passed. A new recovery-test fixture initially omitted its source directory; the
corrected fixture passed. The first old-binary test stopped at the missing General
profile check; after adding a synthetic profile it reached and refused schema 2.
Those setup failures were not hidden or counted as successful executions.

Fresh native CI, package-boundary checks and a fixed canonical tarball must pass
before registry publication. Keep inference experimental and human factual review
separate from automated compatibility checks. No efficacy claim is authorized.

Local final source suite: 246/246 on macOS arm64 for Node 22.23.4, 24.22.2 and
26.13.0; TypeScript passed. Installed Node24 checks: distribution 9, resilience
14, profiles/shortcuts 11. Real Cursor CLI (Auto) completed six synthetic MCP
calls, refused ungranted Personal, resolved SR4@1, preserved exact JSON and left
the fixture unchanged. This is one observed model run, not an efficacy study.
