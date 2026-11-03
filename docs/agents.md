# Connect your agents

Run `articulate project /path/to/repository` or `articulate all`, review your
preferences, then run `articulate connect`. Each host gets a separate client
identity and grant, reading the same reviewed local profile within its scope.
Current instructions override preferences; raw imported transcripts are not
returned over MCP. An AI provider may process permitted tool results.

| Host | What to finish after Connect |
| --- | --- |
| Codex CLI/app/IDE | Reload MCP connections or restart the local host; use a new chat |
| Claude Code | Restart/reload the local MCP connection; `/mcp` shows status |
| Claude Desktop | Install/update the prepared local extension when prompted, then reload |
| Cursor | Check the Articulate MCP entry, enable the tools and start a new agent chat |

For Cursor CLI, explicitly approve the server in the selected workspace, then
inspect its tools:

```sh
agent mcp enable articulate
agent mcp list-tools articulate
```

Run both commands from the same physical workspace path. In the tested Cursor
CLI, macOS temporary-directory aliases could make an approval appear to be lost;
using the canonical workspace path resolved it. This does not require granting
more tools or changing profile permissions.

Cursor's host approval lets it start the MCP server. Articulate's separate local
sharing approval controls whether that client can retrieve your reviewed profile.
The CLI's headless auto-approval flag does not substitute for the explicit enable
step in the tested `mcp list-tools` subcommand.

Only use applications actually available on your OS. A host listed in the CLI
is not a claim that its vendor ships every desktop app on every OS.

The installer preserves unrelated settings and writes private backups under the
Articulate data directory's `config-backups`. It can prepare settings for all four
hosts even when you approve sharing with only one. Skip the settings change if
you do not want that. Complex Codex configuration can require native/manual
integration; the CLI fails instead of rewriting unsupported syntax.

For manual setup, use the generated connection files in your local `connections`
folder. Keep the exact client ID, data directory and credential-file path together.
Do not paste credential contents into config or chat. Use the absolute Node and
server paths generated on your own machine, not somebody else's connection file.

Verification prompt:

> Call articulate_status, articulate_get_analysis and articulate_get_policy with
> task="debugging" for this repository's absolute projectPath. Report the bundle
> version, client name/sharing, revisions, coverage and applied preference IDs.
> Do not import history, save preferences or edit files during the test.

Expected beta version: **2.3.0-beta.1**. For General-profile calls, policy and
analysis memory revisions should agree. A missing tool usually means an old
server/extension is loaded, not that its result can be invented.

For named profiles, first run `articulate modes`, then approve the intended profile
for each client in its local permission window. Use this alternative prompt:

> List my permitted Articulate profiles. Retrieve the Work profile's analysis and
> debugging policy for this repository with modeRef Work and the actual absolute
> projectPath. Report mode.id and mode.revision. Follow my current task; save nothing.

Compare the named profile's ID/revision across its policy and analysis results.
General's memory revision is a separate counter. `policySharingEnabled: false`
can mean General is not shared while named-profile grants are available; inspect
`articulate_list_modes` instead of assuming every grant is disabled. Use explicit
modeRef when the host cannot provide a reliable session ID. Read
[profiles and shortcuts](work-modes.md) before the first schema migration.

Revoke one client via its local permission window and confirm
its policy call is denied while another approved client still works.

Official host references checked 2026-10-29:
[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
[Claude Code MCP](https://code.claude.com/docs/en/mcp),
[Cursor MCP](https://cursor.com/docs/mcp).
These describe host configuration; our simulated protocol tests do not prove a
real GUI installation or marketplace approval.
