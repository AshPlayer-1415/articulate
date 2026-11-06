# Test Articulate with your coding agent

Open Claude Code, Codex or Cursor in a local project you are comfortable using
for a pilot. In Claude Desktop, use a local chat and give the agent the absolute
project folder. Start with one host and one project.

## Paste this into your agent

```text
Help me test the Articulate 0.0.1 npm pilot in one local project with this agent.
Follow https://github.com/AshPlayer-1415/articulate/blob/main/docs/agent-pilot.md
starting at "Install and connect". Run the terminal checks you can on my
computer and give me the exact next action when you need me to use an app,
terminal, or browser. Confirm the project path and host before setup. Let me
make the choices about activity collection, profile review, settings changes,
and sharing. After reload, help me run the MCP check and one real task. Keep
private data local and give me a short pass, fail, or skipped summary.
```

## Install and connect

1. **Agent — check the machine.** Identify the host and confirm the absolute
   test project folder with the tester. In a local terminal, check `node -v`,
   `npm -v` and `npm ls -g articulate-local --depth=0`. The supported Node
   lines start at 22.23.4, 24.22.2 and 26.13.0 respectively. If the runtime is
   outside those ranges or there is already a different Articulate version,
   stop and explain the change needed before proceeding.
2. **Agent — install and check the CLI.** Run these on the tester's computer.
   If the chat has no local terminal or the install needs a writable npm prefix,
   give the tester the commands for their own terminal. Installation uses
   public npm access without an account. In PowerShell, use `npm.cmd` and
   `articulate.cmd` if script policy blocks the default shims.

   ```sh
   npm i -g articulate-local@pilot
   npm ls -g articulate-local --depth=0
   articulate help
   ```

   Expect `articulate-local@0.0.1`. For a repeat of this exact pilot, substitute
   `articulate-local@0.0.1` in the install command. The version listed here
   verifies the CLI install. The MCP check below verifies the host's server.
3. **Tester — choose and review the scope.** Have the agent open a real
   interactive terminal in the chosen folder and start `articulate project`.
   If the agent only has a background shell, run the command in your terminal.
   Review and confirm the local scan for that project. Keep only preferences
   you want applied. If history yields no usable rules, the wizard offers
   choices such as “When debugging, show the failing case, the fix, and a
   verification step.” The tester operates the wizard and browser. Leave
   other projects, transcripts, credentials and private permission links
   outside the chat.
4. **Tester — approve the connection.** The 0.0.1 wizard can prepare local
   connection files and then asks before writing settings for all four hosts.
   If you accept that settings change, select only your test host for sharing
   and approve its local browser page. If you want to change settings for just
   one host, decline the automatic install and use that host's generated
   settings and its separate permission page. If you already prepared the
   files, `articulate connect` reopens the connection flow.
   [Host setup and manual configuration](agents.md)
5. **Tester — reload the host.** Reload MCP or quit and reopen the host, then
   open a fresh chat in the same project. For Claude Desktop, finish
   Install/Update with the prepared local extension first. Claude Code shows
   its server in `/mcp`. In Cursor, enable Articulate in MCP settings if asked.
   [Host-specific steps](agents.md)

## Verify from the new chat

Replace `<absolute project folder>` with the path on your machine, then paste
this into the newly connected host.

```text
Test the actual Articulate MCP tools in this chat for <absolute project folder>.
Call articulate_status, articulate_get_analysis with projectPath, and
articulate_get_policy with the same projectPath, task "debugging", and
personalization true. Report the bundle version, sharing state, revision,
coverage gaps, and whether a reviewed preference applied. Expected version
is 0.0.1. Report missing tools or denied access as failures. Use the approved
preference to explain why [1,2,3].slice(0,2-1) returns [1]. Leave files and
preferences as they are.
```

The result should still explain that `2-1` is 1 and that `slice` excludes the
end index. An empty preference list means the connection can pass while the
personalization check is skipped.

To see if it helps with your work, use the same small real debugging question
and model in two fresh chats. In the first, ask for the answer without Articulate
or any saved preferences. In the second, ask the agent to retrieve and apply
the reviewed debugging policy. Compare correctness, the number of corrections
you needed, and which answer you could act on. Use a real task whose result you
can check. A successful tool call shows that the connection works.

## Send back the result

Ask the agent to fill out this summary for you. Review it before sharing.

```text
OS / Node version / host:
Articulate package version / MCP bundle version:
Install / connection / policy retrieval / task test: pass, fail, or skipped
Which answer helped, and what changed:
Redacted error or coverage gap, if any:
```

Share only this summary and redact identifying paths or error details.
[Report a bug](https://github.com/AshPlayer-1415/articulate/issues/new?template=bug_report.md)

## Remove the pilot

Remove or disable Articulate in the host's MCP settings and reload the host.
In Claude Desktop, uninstall the Articulate extension if you installed it.
Remove any other Articulate entries created by the all-host setup if you are
done testing. Run `npm uninstall -g articulate-local` to remove the CLI.
If you also want to erase the local profile and backups, use `articulate privacy`
**before** uninstalling the CLI and follow the erase prompt after saving any
backups you need. [Data and deletion](privacy.md)
