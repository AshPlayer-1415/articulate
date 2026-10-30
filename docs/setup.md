# Setup and test a connection

1. Follow the README build instructions and keep `dist/local` in a stable folder.
2. Run `node dist/local/bin/articulate.mjs project /absolute/path/to/repository`
   or `node dist/local/bin/articulate.mjs all`. Choose the scope and review the
   proposed preferences. Read coverage gaps before calling setup complete.
3. Run `node dist/local/bin/articulate.mjs connect`. Review the configuration
   changes, select agents and approve each selected client's local browser page.
   The CLI backs up existing settings. Claude Desktop may require installing the
   prepared device-specific extension; keep that package local.
4. Reload the MCP connection in each agent and start a new chat. Use the same
   project path in each test. Articulate does not force tool use in future chats.
5. Ask the agent:

   > Test Articulate for projectPath /absolute/path/to/repository. Call
   > articulate_status, articulate_get_analysis and articulate_get_policy with
   > task="debugging". Report the bundle version, client sharing state, memory
   > revision, coverage gaps and applied preference IDs. Do not scan histories,
   > edit files or save preferences. Then explain why [1,2,3].slice(0,2-1)
   > returns one item, preserving all essential facts and caveats.

6. Confirm the expected bundle version, correct client, granted sharing and
   matching revisions. Empty approved rules are valid. A missing tool can mean
   the host is loading an older extension; check the installed bundle rather
   than enabling sharing repeatedly. A failed grant should remain a failure.
7. Inspect the explanation yourself. `slice` excludes its end index, so this
   expression returns `[1]`. Preference retrieval alone does not prove answer
   quality. Revoke one client's grant and confirm its policy call is refused;
   approve it again only if you want access restored.

The automated suite uses temporary synthetic stores. This proposed snapshot's
clean-tree checks do not replace real application installation and user-led
permission tests on another machine. See the actual CI run for automated macOS, Windows and Linux results; real
application UI installation and approval still require checks on each OS.
