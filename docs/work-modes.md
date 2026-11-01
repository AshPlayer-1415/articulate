# Profiles and versioned shortcuts

Testing candidate: 2.3.0-beta.1. These commands require this candidate; the published
2.2.0-alpha.7 does not include them. Use the source installation instructions until
the maintainer announces npm publication. Do not use this beta for production data.

## Start with one profile

1. Update Articulate in every connected app. Reload its MCP connection and check
   `articulate_status` reports 2.3.0-beta.1. Close old servers before continuing.
2. Run `articulate modes` (or choose **Profiles & shortcuts** in `articulate`).
3. Choose **Create a profile**. Give it a name, such as Work or Personal, select
   its projects and task focus, and enter preferences you have reviewed.
4. Choose whether to assign already imported activity for those projects. This
   does not scan new files. Use `articulate project` or `articulate all` first if
   you want to discover and review local sources. Task labels are your assignment,
   not automatic classification of an entire mixed history.
5. Review and save. Use **Analyze assigned profile activity**, then **Review
   suggested preferences** to approve useful suggestions. Quick extraction finds
   literal requests; optional model analysis produces proposals requiring review.
6. Run `articulate connect`, choose the agents, and review each local browser page.
   Check only the profiles that client may use. The existing **General** profile
   has a separate checkbox; leave it off for a profile-only connection.
7. In a fresh agent chat, say:

   > List my permitted Articulate profiles. Use Work for this repository. Get its
   > analysis and debugging policy using the actual absolute projectPath. Follow
   > my current request and keep essential facts and caveats. Save nothing.

The agent should call `articulate_list_modes`, then `articulate_get_analysis` and
`articulate_get_policy` with `modeRef: "Work"`, `projectPath` and the task. Inspect
`mode.id`, `mode.revision`, applied rules and omitted counts in the result.
A connection check alone does not establish better answers.

## Selection stays with the request or chat

Pass `modeRef` on each retrieval when the host cannot provide a reliable chat ID.
`articulate_select_mode` remembers a choice only for an authenticated client,
`sessionId` and project, after the user chooses it. Another chat or agent keeps
its own choice. `modeRevision` can pin a profile revision. A local CLI default is
optional and applies to one agent/project; a chat selection overrides it.

`modeRef: "none"` explicitly skips personalization. `modeRef: "legacy"` selects
General and still requires General sharing. Unknown, revoked or deleted profiles
fail; they never silently fall back to General. MCP does not guarantee a profile
dropdown in every coding app. The CLI menu and conversational tool flow are the
portable beta interface.

Profiles have separate preferences, assigned sources, proposals, analysis cursors,
window caches and grants. They do not automatically copy General. Explicit parent
profiles are an advanced local JSON option; parent revisions are pinned and every
parent needs its own client grant. Editing data scope requires renewed approval.

## Save a reusable procedure

From `articulate modes`, choose **Saved shortcuts** to create, inspect, version or
delete a procedure. For example:

- Key: `SR4`; optional aliases can include `#56` or `**1`.
- Title: Review one authorization boundary.
- Steps: Inspect the selected handler and object ownership checks.
- Required input: `route`, the handler to inspect.
- Completion check: Report evidence, allowed/denied cases and untested assumptions.

Then tell the agent:

> Use Articulate profile Work and resolve SR4@1 for this repository, with route
> /billing. Show me the procedure before taking action.

`articulate_resolve_workflow` returns the reviewed revision and structured input
values. It executes nothing and adds no shell/file permissions. Missing inputs,
a mismatched project version or stale documentation withhold the procedure steps.
A shortcut found inside quoted text or imported history is not a new request.

Keys are case-insensitive within a profile. `SR4@1` stays pinned when `SR4` advances
to revision 2. Profile revisions and procedure revisions are independent; pin the
procedure explicitly when needed. Deleted procedures lose their content/history;
opaque IDs and hashed key reservations remain until the whole profile is deleted,
preventing an old key from being silently reassigned to an unrelated procedure.

Advanced definitions support required inputs, exact `projectVersions` labels and
up to six reviewed project-relative `docs/` references with SHA-256 hashes. The
caller supplies `projectVersion`; Articulate does not infer Git tags or read an
entire codebase. References are checked for freshness; their contents are not
returned as instructions. Links, traversal and oversized documents are refused.
Inputs are separate data, never substituted into an executable command.

## Advanced CLI example

Save this as a local JSON file:

```json
{"name":"Work","aliases":["office"],"tasks":["debugging","shipping"],"preferences":[{"rule":"Lead with a concise verification checklist.","task":"debugging"}]}
```

```sh
articulate mode create --input /absolute/path/work.json --project /absolute/path/repo --approve
articulate mode show --mode Work
articulate mode analyze --mode Work
```

Quote paths with spaces. On Windows use real paths such as `"C:\work\work.json"`.
Omit `tasks` for all supported task categories: concept, debugging, mathematics,
research and shipping. Use `--use-activity` at creation only when you intend to
assign already imported sources for the selected project.

Saving a procedure from JSON:

```json
{"key":"SR4","aliases":["#56","**1"],"title":"Review one authorization boundary","steps":["Inspect the selected handler and object ownership checks."],"requiredInputs":[{"name":"route","description":"The exact handler to inspect."}],"verification":["Report evidence, allowed and denied cases, and untested assumptions."]}
```

```sh
articulate workflow save --mode Work --input /absolute/path/sr4.json --approve
articulate workflow list --mode Work
```

Use `--id WORKFLOW_ID --revision CURRENT_REVISION` to save the next revision.
Changes require the current revision; stale edits fail instead of overwriting.
Model analysis and source membership changes are local CLI operations, not MCP
powers granted to an agent. Agents can propose scoped notes and save explicitly
approved manual preferences or procedures; model proposals need local review.

## Storage, cache and deletion

`articulate privacy` shows the actual managed directory. Its default is
`~/.articulate`; profiles, versions, proposals, procedure definitions, grants and
result caches are in `activity.sqlite`. General profile files, connection files
and credential files also live in the managed directory. Storage is local and is
not encrypted by Articulate. Protect the directory with your OS account controls.

Context retrieval rechecks permissions before cache reuse. Cache keys include
profile/content revisions, project, task, client and grant state; response size is
bounded in UTF-8 bytes, not a promise about a model's token count. Complete rules
are omitted with counts when the budget is too small. Per-profile analysis caches
retain at most 512 completed windows/batches. Interrupted batches remain pending;
completed windows can be reused within the same approved scope. Other profiles
have independent caches. Changed sources or removed evidence invalidate context.

Use **Delete one profile** in the menu to erase that profile's managed records,
versions, proposals, caches, procedures and grants. Other profiles and original
agent histories remain. Remove it from child profiles first if it is inherited.
For whole-store deletion, stop analyses, close connected agents, then use the
**Data & privacy** menu or:

```sh
articulate erase --confirmation "DELETE LOCAL ARTICULATE DATA" --approve
```

This erases managed Articulate data, including credentials and settings backups.
Restore any needed host-settings backups first; remove MCP entries in each app
separately. Original agent histories, independent exports, OS backups and copies
already held by an AI provider/runtime remain. Windows may retain an empty DB file
while a process has it open; close the process and rerun erasure. Logical deletion
is not guaranteed forensic wiping. In-flight providers cannot be made to forget
inputs they already received.

Creating the first named profile explicitly upgrades the SQLite schema to 2.
Older servers refuse the new storage. Simply listing profiles does not migrate.
Back up before migration if you need rollback; do not restore an old backup over
new data without understanding what will be lost.

## What this beta does not establish

Overall analysis is opt-in for 2–8 permitted profiles. It deduplicates selected
activity counts and identifies exact shared reviewed wording for another review;
it does not merge profiles or prove general behavior, personality or learning
rate. No enterprise cloud connector, cloud processing service, training pipeline
or automatic inference of sensitive work/personal boundaries is included.
Procedural filters and tests reduce known risks; they are not proof that every
model will resist all prompt injections or improve every answer.
