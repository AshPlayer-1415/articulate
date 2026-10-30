# Compatibility, failure cases and scope

Articulate's alpha is a local CLI and stdio MCP server for preferences that a
person reviews. A passing connection test establishes transport and permission
behavior for the tested build. It does not establish that every model follows
preferences, that answers become more accurate, or that every possible machine
configuration is supported.

## Acceptance checks

| Risk | Executable check | What it does not establish |
| --- | --- | --- |
| OS/runtime differences | Native macOS arm64, Windows x64 and Ubuntu x64 CI; Node 22.23.4, 24.22.2 and 26.13.0 | Other architectures, Linux distributions, old OS releases or Node versions outside package engines |
| Installation and paths | Exact seven-file npm pack/install; native command shim; Windows PowerShell; Unicode/space paths; unrelated working directory; missing build | Every shell, antivirus policy, enterprise endpoint agent or packaging system |
| Settings damage or credential-like error text | Preserve unrelated settings, repeat setup without replacing clients, refuse complex TOML/hard-linked files, malformed JSON preflight with canaries | A complete filesystem transaction, malicious OS administrators or arbitrary racing writers |
| Multiple profiles and inherited environment | Explicitly bind both Articulate directory variables; same client IDs with different credentials; foreign-instance refusal | Shared credentials deliberately copied between machines or an OS sandbox |
| Several agents running together | Four live packaged MCP processes, matching revisions, live note changes, immediate revocation, crash/reconnect | Unlimited concurrency or a performance SLA |
| Project boundary | Foreign project retrieval refused; another project's notes absent | Host filesystem tools independently reading other folders |
| Corrupt local JSON | Profile/session errors withhold file contents over MCP and leave the files for local recovery | Automatic repair of corrupted state or arbitrary disk failure |
| Untrusted input and task fidelity | Existing source regressions for quoted/assistant/tool evidence, injection-like requests, inactive proposals, exact format and content-preserving presentation | A proof against every prompt injection or an independent security certification |
| Actual Cursor transport | Pinned official CLI archive on one Node line per native OS, initialization/tool discovery through a discovery-only gate | Desktop UI, model behavior or user approval dialogs |

Read the actual CI run and report artifacts for the commit being evaluated.
A row in this table or the presence of a workflow is not proof that it passed.
The optional Cursor transport script runs only on disposable GitHub CI and uses
no model account/token. Official archive hashes are pinned after HTTPS retrieval;
this is reproducibility checking, not an independent vendor signature audit.
Cursor remains an optional test tool, not an Articulate runtime dependency.

A separate synthetic Cursor model test can verify actual read-only tool calls and
current-request precedence on the machine where it runs. Such a test must keep
real profiles, host histories, global MCPs and private source unavailable to the
model, enforce tool restrictions, retain failures and verify the fixture did not
change. A successful Mac model session is not a Windows/Linux model-session pass.

## Deliberate boundaries

- No automatic approval of inferred rules or unrestricted editing of profiles.
- No autonomous coding, security assessment or workflow execution triggered by
  a stored preference. Task shortcuts and workflow libraries are future work.
- No activity uploads, cloud synchronization, account requirement or automatic
  model download/fallback. Remote analysis is a separately configured opt-in.
- No claim to measure intelligence, personality, learning rate or educational
  outcomes; no factual-improvement claim from formatting preferences or CI.
- No guarantee that unavailable, deleted, cloud-only or unsupported histories can
  be recovered. Missing evidence stays a coverage gap.
- No replacement for the host's permissions, sandbox or security review. An MCP
  process has its OS user's permissions; Articulate's client grants limit its own
  APIs, not another application's file or shell tools.
- No support promise for old/odd Node lines, untested CPU/OS combinations,
  network-mounted data stores or unlimited concurrent writers.

## Setup, relocation and recovery

Keep the installed package and selected Node runtime in stable locations. After
moving an installation, changing Node paths or updating a Desktop extension, run
Connect again and reload the host. Regenerating settings is tested to preserve
client identities and grants; the relocation fixture uses the same schema/build,
not an arbitrary future-version migration. Complex or malformed host settings
are refused before host settings are written; repair them locally or use the
host's native setup with the generated connection file. Do not paste their
contents or credential-bearing errors into feedback.

Never delete a corrupt profile just to make a test pass. Preserve it privately,
restore a known backup if available, and keep the first error in a redacted bug
report. Real agent UI install, permissions and reload behavior still need a
friend on each target OS. Use the tests in [testing.md](testing.md), and rate
correctness separately from preferred presentation.
