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

Expected version for this candidate: 2.2.0-alpha.7. Revisions should agree. A
missing tool usually means an old server/extension is loaded, not that its result
can be invented. Revoke one client via its local permission window and confirm
its policy call is denied while another approved client still works.

Official host references checked 2026-10-29:
[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
[Claude Code MCP](https://code.claude.com/docs/en/mcp),
[Cursor MCP](https://cursor.com/docs/mcp).
These describe host configuration; our simulated protocol tests do not prove a
real GUI installation or marketplace approval.
