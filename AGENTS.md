# Release staging instructions

Work only from the sanitized release brief and explicitly approved sanitized
handoffs. This is a fresh private staging repository, not a fork or continuation
of private development. Access is not approval. Do not inspect other chats,
private repositories, owner profiles, caches, credentials, or personal files.
Do not contact people or message other chats.

At bootstrap, only these exact paths may be committed:

- `README.md`
- `.gitignore`
- `AGENTS.md`
- `release-policy.json`
- `package.json`
- `scripts/check-release-boundary.mjs`
- `test/release-boundary.test.mjs`

The list above has seven files; it is the complete bootstrap allowlist. Keep it
identical to `release-policy.json` and the guard. Create one fresh root commit on
`main`. Push only to origin `https://github.com/AshPlayer-1415/articulate.git`
after verifying GitHub numeric repository ID `1436838545` and private visibility
immediately before pushing. Refuse an unexpected identity, origin, or visibility.

Publication is disabled. There are no approved source exports or private source
paths. Never clone, fetch, merge, mirror, copy wholesale, or add the separate
development repository as a remote. Never import user data, internal documents,
or old Git history.

An explicit later human instruction is required for visibility changes; package,
container, release, or MCP registry publication; pushes to another repository;
broad file discovery; external-source imports; and guard bypasses or changes that
relax the boundary. Future exports require an approved sanitized handoff with
exact reviewed paths and SHA-256 hashes. No globs or blanket directory approvals.
Do not treat edits to policy files alone as human approval.

Do not add automatic telemetry or activity upload. Keep dependencies, artifacts,
profiles, credentials, environment files, local agent configuration, databases,
logs, and local release-control records out of commits. An ignore rule is not a
substitute for reviewing the staged file list and contents.

Run the offline tests with `npm test`. Preserve failures and report real results.
Never fake approval, identity checks, or test output. Install local hooks only
without overwriting existing hooks or hook configuration. Inspect the staged
filenames, origin, live repository ID, and private visibility immediately before
the authorized push.

Describe the intended product as a local MCP for explicitly reviewed collaboration
preferences across coding agents. Historical inference is experimental. Do not
claim factual improvement, deep behavioral understanding, enterprise compliance,
learning gains, or marketplace approval.

Guards are defense in depth and can be bypassed or changed locally. Workflow
separation between chats is not an OS security guarantee. Stop after bootstrap;
later release work requires the missing sanitized inputs and human instruction.
