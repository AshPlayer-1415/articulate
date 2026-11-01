# Articulate

> **Testing beta — not ready for general public or production use.**
> This repository is public so volunteers can inspect and test the work in progress.
> Expect bugs and incomplete coverage. Historical inference is experimental;
> review every proposed preference and keep backups. Public source availability
> does not mean a stable release or verified support for every agent/platform.

One reviewed understanding of how you work, shared with your coding agents.

Articulate is a local CLI and MCP server for collaboration preferences you review.
It can bring available Codex, Claude Code and Cursor activity together for one
project or across projects, then let separately approved agents use the reviewed
profile. Claude Desktop can consume it; its chat history is not an import source.
Historical inference is experimental. This testing beta does not measure intelligence,
personality or learning rate, and does not establish improved factual accuracy.

The GitHub source repository is public for beta testing. You do **not** need a
GitHub or Articulate account to use this npm package. Its included JavaScript code
and documentation are public. No Articulate telemetry or automatic cloud upload
is included. Your connected AI provider can process permitted tool results.

## Install on macOS, Windows or Linux

Install a supported Node.js LTS release from https://nodejs.org/ first. The tested
minimum patches are 22.23.4, 24.22.2 and 26.13.0. Use a currently patched release
on one of these lines. Docker and an API key are not required for basic setup.

In Terminal (Mac/Linux) or PowerShell/Command Prompt (Windows):

```sh
npm install --global articulate-local@{{VERSION}}
articulate
```

This installs the command `articulate`. The npm package named `articulate` is an
unrelated product; use **articulate-local**. On PowerShell, if a `.ps1` launcher is
blocked, use `npm.cmd` and `articulate.cmd` explicitly. Do not change system-wide
execution policy to install this beta.

For a one-time launch without a global install:

```sh
npx --yes --package articulate-local@{{VERSION}} articulate
```

Keep installations stable after connecting agents. With a temporary npx install,
regenerate connections if its cached package/runtime is later removed. A global
install is the recommended first-friend test path.

## Choose the scope

Run `articulate` for the interactive menu, or use one of these commands:

```sh
articulate project /absolute/path/to/repository
articulate all
```

On Windows, for example:

```powershell
articulate project "C:\work\my-project"
```

Use the actual project folder, not your home directory. Agents are detected from
available local records; you do not need to select a different agent per project.
Read the scope/retention prompt, approve only the sources you want, inspect
coverage gaps, and review proposed preferences before agents can use them.
You can choose preferences manually if no reliable local history is available.
A quick extraction finds literal requests; richer local-model analysis is an
optional, separately configured experimental feature. Cloud-only, deleted,
unsupported or unattributable records can remain absent.

## Connect Claude, Codex, Cursor or all of them

```sh
articulate connect
```

Review the settings-change prompt. Configuration preparation covers Codex,
Claude Code, Claude Desktop and Cursor, preserves unrelated settings and saves
private backups locally. Select which clients may share the reviewed profile;
each gets a separate local browser approval. One client's approval does not
approve the others. Closing or declining an approval leaves access disabled.
Claude Desktop can also require installing/updating the prepared device-specific
extension. Keep that extension and credential/connection files on your machine.

After Connect:

- **Codex:** reload MCP connections or restart the local host, then open a new chat.
- **Claude Code:** reload/restart the connection; `/mcp` shows its status.
- **Claude Desktop:** finish the local extension installation/update, reload, then
  start a new chat with the connector enabled.
- **Cursor:** enable the Articulate MCP entry/tools and open a new agent chat.
  For Cursor CLI, run `agent mcp enable articulate`, then
  `agent mcp list-tools articulate` from the same physical workspace path.

Cursor's approval to start a server is separate from Articulate's permission to
share a profile. In the tested Cursor CLI, macOS temporary-path aliases could
make an approval appear lost; using the canonical physical workspace path for
both commands resolved it. Do not compensate by granting more tools.
Only use host applications that their vendors actually support on your OS.
Articulate does not force tool use or copy memory into every future chat.

## Verify the connection

Start a new agent chat in a non-sensitive project and paste:

> Test Articulate for this repository's actual absolute projectPath. Call
> articulate_status, articulate_get_analysis and articulate_get_policy with
> task="debugging". Report the bundle version, client sharing state, memory
> revision, coverage gaps and approved preference IDs. Do not import history,
> save preferences, change sharing or edit files during this check.

Confirm version **{{VERSION}}**, the correct client, granted access and matching
revisions. Missing tools usually mean an old server/extension is still loaded.
Empty approved preferences and coverage gaps are valid results, not a reason to
invent a profile. Check answer correctness separately from preferred formatting.
For example, `[1,2,3].slice(0,2-1)` returns `[1]` because the end index is excluded.
A current request for exactly `{"ok":true}` must not gain labels or explanations
from stored preferences. Revoke one client and verify it is denied while another
approved client can still retrieve its permitted profile.

## Data and control

The local profile, source-import approval and per-client sharing grants are
separate. Selected imported text may contain private code or credentials despite
redaction; inspect it locally. Setup explains retention, normally 30 days.
Raw imported transcripts are not returned through MCP. Permitted summaries and
preferences may be processed by the AI host you connect. Its independent file
and shell tools remain governed by that host, not by Articulate's API grants.

There is no automatic model download, cloud fallback or background import.
Remote analysis requires separate explicit provider configuration and opt-in;
it sends selected analysis input to that provider and is not local-only.
A refresh notice does not authorize scanning, inference approval or history
upload. Current task instructions override stored presentation preferences.
Articulate does not autonomously execute coding/security workflows.

Run `articulate help` for source pause/removal, client revocation and local erasure
commands. Local erasure does not delete the original agent histories or copies
already sent to providers. Configuration backups are inside your Articulate data
folder; restore anything needed before erasing that folder.

## Update, troubleshoot and give feedback

Update with `npm install --global articulate-local@{{VERSION}}`, rerun
`articulate connect`, finish any Desktop extension update, reload each host and
start a new chat. Generated paths bind the installed Node/package location.

- **Command not found:** reopen the terminal and check the Node/npm global command
  directory is on PATH. Use a user-managed Node installation for prefix-permission
  errors; do not blindly use sudo or force replacement of another command.
- **Old private alpha installed as `@articulate/local`:** if that is your own legacy
  installation, remove only that old global package with
  `npm uninstall --global @articulate/local --ignore-scripts`, then install
  `articulate-local@{{VERSION}}`. Keep your local Articulate data and regenerate
  connections. Do not uninstall an unrelated package merely because names collide.
- **Sharing disabled:** open that client's local permission page, review it, and
  choose whether to approve. Repeated approval cannot fix an old server build.
- **Settings rejected:** repair malformed JSON locally or use the host's native
  setup with the generated connection file. Complex Codex TOML is deliberately
  refused. Corrupt profile/session files are preserved; restore a known backup
  or seek help rather than deleting data to obtain a passing check.

For this friends' alpha, send feedback privately to the person who shared the
package. Include OS, Node, Articulate and agent versions, the command, expected
result and a redacted error or synthetic reproduction. Do not attach chat exports,
profiles, activity databases, credentials, device-specific bundles or consent
links. Report suspected vulnerabilities privately, not in public comments.
The private GitHub repository/issue tracker does not require access for usage.

Automated native CLI/MCP tests cover macOS arm64, Linux x64 and Windows x64 on the
three Node lines above, including a single shared package, concurrent clients,
instance/project boundaries, revocation, crashes, relocation and corrupt JSON.
Cursor CLI transport is checked on all three OSes; real model-session checks were
run on Mac. Windows automation used Server 2025, not Windows desktop UI testing.
Real desktop install/approval, other architectures/distributions, managed endpoint
policies, arbitrary future schema migration and unlimited concurrency remain
separate checks. Passing tests are not security certification or proof of learning
or accuracy improvements.

Apache-2.0. See LICENSE, NOTICE and THIRD_PARTY_NOTICES.txt in the installed package.

## Profiles and versioned shortcuts

This version adds `articulate modes`: an interactive menu to create Work, Personal
or project/task profiles, assign already imported activity, review suggestions,
choose agent access and manage reusable procedures. No new scan runs just because
you create a profile. General preferences are separate and are never silently
blended into a named profile.

Before creating the first profile, update every connected server/extension and
reload MCP. Creating it upgrades the managed SQLite schema to 2; older binaries
refuse this storage. Back up first if you need rollback.

Run `articulate connect` after creation and approve the profiles each client may
use in its local browser page. General has a separate checkbox. Then ask:

> List my permitted Articulate profiles. Use Work for this repository. Get its
> analysis and debugging policy with modeRef Work and the actual projectPath.
> Follow my current request and keep essential caveats. Save nothing.

Use modeRef on each request when the host cannot provide a reliable session ID.
An explicit chat selection is client/session/project specific. A revoked, unknown
or deleted profile fails instead of falling back to General. MCP does not promise
a native profile dropdown in every host.

In the menu, choose Saved shortcuts. Give a reviewed procedure a key such as SR4,
a title, steps, required inputs and completion checks. Keys are case-insensitive
within a profile; aliases may include #56 or **1. Ask the agent:

> Use Work and resolve SR4@1 for this project, with route /billing. Show me the
> procedure before taking action.

The resolver executes nothing and adds no agent permissions. Missing inputs,
mismatched project-version labels or changed reviewed documentation withhold
steps. Input values stay separate from instructions. Quoted/history keys are not
new user requests. Old revisions stay pinned when a procedure is edited.

The interactive `articulate modes` is the recommended setup interface. Full source
guide: https://github.com/AshPlayer-1415/articulate/blob/main/docs/work-modes.md

`articulate privacy` shows the managed data folder, normally ~/.articulate. New
profiles, revisions, procedures, proposals, grants and caches live in activity.sqlite
there; storage is not encrypted by Articulate. Context caches recheck grants and
use bounded UTF-8 byte budgets, not model token guarantees. Incomplete analysis
can reuse completed windows within its profile; it does not borrow another
profile's results or automatically approve suggestions.

Use Delete one profile in the menu to erase its managed content. To erase all
Articulate data, stop analyses, close agents, restore any needed settings backups,
then use Data & privacy or:

```sh
articulate erase --confirmation "DELETE LOCAL ARTICULATE DATA" --approve
```

Host configuration entries, original agent histories, independent exports, OS
backups and provider/runtime copies remain. Remove MCP entries in each app
separately. Windows may retain an empty DB file while an agent holds it open;
close agents and rerun erasure. Logical deletion is not guaranteed forensic wiping.
