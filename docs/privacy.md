# Your data and choices

Articulate is local by default. Explicit setup discovers supported coding-agent
stores and asks before importing activity. Imported content can include copied
text, private code and imperfect credential redaction. Inspect the coverage and
review results; redaction is not a guarantee that every secret is removed.
The setup explains selected-text retention, normally 30 days. Pause, remove and
erase commands are available in the CLI help.

The reviewed profile, imported activity and per-client grants are separate.
Approving a source does not approve sharing with every AI application. Each
registered client gets its own local permission choice. Raw imported transcripts
are not returned by MCP. Permitted summaries, preferences and tool arguments may
be processed by the AI provider you connected. An agent can also have its own
filesystem tools; Articulate cannot govern those independent capabilities.

Local inference requires a separately installed model. A compatible remote
provider needs explicit configuration and the remote-analysis opt-in flag. That
path sends the selected analysis input to that provider and is not local-only.
Articulate has no automatic cloud fallback, account, activity upload or telemetry.
Dependency downloads and host applications have their own network behavior.

Use the CLI client controls to inspect or revoke grants. A refresh notice is
guidance, not permission to scan or approve anything automatically. Erasure affects
Articulate's local data; it does not erase original host histories, backups or
data already sent to an AI provider. Device-bound extension files and connection
files can contain sensitive local paths. Keep them on your device.

Named profiles have separate client grants and never inherit General automatically.
See [profiles and shortcuts](work-modes.md) for scope, versioning and cache rules.
Run `articulate privacy` to view the actual managed storage location and use the
interactive erasure flow. New profile/shortcut data lives in activity.sqlite in
that folder; Articulate does not encrypt it.

Close agents and stop analyses before whole-store erasure. It also removes local
credentials and settings backups; restore any backups you need first. Remove MCP
entries in each host separately. The erasure result reports if a Windows process
kept an empty database file open. External exports/provider/runtime copies and OS
backups remain. This is logical deletion, not guaranteed forensic wiping.
