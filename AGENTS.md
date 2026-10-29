# Private release staging instructions

This repository is private staging. The authorized transition is exactly one
direct child commit of bootstrap root `55d70fa505bb51a400c8bb977a2334b825ec9f6d`
on `main`, containing the 130 approved source files listed in `release-policy.json`
plus these four retained controls: `AGENTS.md`, `release-policy.json`,
`scripts/check-release-boundary.mjs`, and `test/release-boundary.test.mjs`.
The complete tree must contain exactly 134 regular files. The approved source
bytes, including README.md, package.json and .gitignore, must remain unchanged.

The approved public path, byte size and SHA-256 list is pinned independently in
the guard. Policy edits are not human approval. This authorization covers this
exact sanitized import only; it does not authorize future exports or publication.
No private source paths, private provenance, user data, internal reports or
documents, credentials, personal files, or old Git history may enter this repo.
Do not clone, fetch, merge, mirror, copy wholesale, or add a remote for the separate
development repository. Do not inspect other chats or the development checkout,
contact people, or message other chats.

The only push destination is origin
`https://github.com/AshPlayer-1415/articulate.git`, GitHub numeric repository ID
`1436838545`, with private visibility. Verify origin, ID, visibility, staged tree,
source hashes and bootstrap ancestry immediately before pushing. Stop if the
checkout or remote changes unexpectedly. Keep the existing local pre-push hook
active; do not remove, overwrite, or bypass it. Other branches, tags, deletions,
new roots, merges, and later descendants are outside this transition.

Publication, package publication, container publication, release creation and MCP
registry publication remain prohibited. An explicit later human instruction is
required for visibility changes, any publication, another destination, broad file
discovery, additional source imports, or guard bypasses or relaxation. Future
exports require a new approved sanitized handoff with exact reviewed paths and
SHA-256 hashes. No globs or blanket directory approvals. No automatic telemetry
or activity upload is authorized.

Validate with a fresh `npm ci --ignore-scripts --offline --no-audit --no-fund` when
the existing cache permits; then `npm run check`, `npm test`, `npm run build`, and
`node --test test/release-boundary.test.mjs`. Do not upgrade dependencies silently.
Use disposable `ARTICULATE_DATA_DIR`, clear `ARTICULATE_EXTENSION_DATA_DIR`,
`ARTICULATE_CLIENT_ID`, and `ARTICULATE_CLIENT_TOKEN_FILE`, and use only synthetic
fixtures with loopback consent endpoints. No real profiles, activity imports or
hosted model requests. Preserve first failures. A failed check never authorizes
changing approved source bytes. Reverify all source hashes after checks. Keep
logs, dependency/build output and review receipts outside committed source or
ignored; do not add committed control or manifest files beyond the four above.

Describe Articulate as a local MCP for explicitly reviewed collaboration
preferences across coding agents. Historical inference is experimental. Do not
claim factual improvement, deep behavioral understanding, enterprise compliance,
learning gains, or marketplace approval.

Hooks are defense in depth: local scripts and Git configuration can be changed or
bypassed, content under an approved path still requires review, and visibility
can change after verification. Hooks do not enforce package or registry service
permissions. Separate chats provide workflow separation, not OS security
isolation. Stop after this exact private staging import and report actual checks,
failures, commit and visibility. Later release work needs human instruction.
