# Troubleshooting

- **`articulate` not found:** reopen the terminal after installing. Check Node/npm
  are on PATH and the npm global prefix's command directory is on PATH. On Windows
  the command shim ends in `.cmd`. If PowerShell reports that a `.ps1` script
  cannot run, invoke `articulate.cmd` explicitly (and `npm.cmd` for npm). This
  selects the command shim without changing the machine's execution policy.
- **Old bundle version or missing tool:** update/rebuild the package, rerun Connect,
  finish any Desktop extension update, reload the host and start a new chat.
- **Sharing disabled:** open that client's local permission page and choose your
  intent. One client's approval does not grant another client's access.
- **Wrong project/no activity:** pass the actual repository folder. Local records
  can be absent, unsupported, deleted or unattributable. Cloud access is not
  implied. Choose preferences manually when reliable history is unavailable.
- **Settings cannot be merged:** preserve the backup and use the host's native
  integration with the generated connection settings. Do not overwrite unrelated
  MCP servers or bypass a complex-config rejection.
- **Permission/OS warning:** report its exact redacted wording. Do not disable
  system-wide protections or blindly run elevated commands.

To stop, revoke/disable Articulate in each host and reload. Restore any needed
backups before erasing local Articulate data; backups live inside that directory.
Erasing Articulate does not erase original histories, backups or provider data.
