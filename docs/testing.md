# Test the alpha

Start with a non-sensitive project and one agent. Confirm version, grant, scope
and matching analysis/policy revisions. Then try more agents with that project.

1. Ask why `[1,2,3].slice(0,2-1)` returns one item. It evaluates to `slice(0,1)`;
   the end is excluded, so the result is `[1]`. Two items would use `slice(0,2)`.
2. Ask for a final answer exactly `{"ok":true}` despite stored preferences.
   Preferences must not add a heading, code fence or explanation.
3. Ask a real question whose facts you can check. Rate correctness separately
   from whether you preferred its presentation. Preserve missing caveats.
4. Revoke one client's local grant and confirm retrieval is refused. Re-enable
   only if you choose; other client grants should remain independent.

For feedback, use the bug template. Keep username/path/token/private-URL details
out. No automatic upload occurs. Preference ratings do not establish learning
improvement or factual correctness.

Automated tests use temporary synthetic profiles, local loopback consent and no
hosted model. Distribution tests pack/install the actual runtime tarball, invoke
the native global command, prepare four local host configurations and check grants
via MCP. These do not replace real Claude/Codex/Cursor application UI testing.
