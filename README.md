# Articulate — release staging

This repository is **private release staging**. No installable release is published.
It currently contains release controls and documentation only; no product source
has been approved for export into this repository.

The intended product is a local Model Context Protocol (MCP) server for explicitly
reviewed collaboration preferences across coding agents. Historical inference is
experimental. This staging scaffold does not establish factual improvement, deep
behavioral understanding, enterprise compliance, learning gains, or marketplace
approval.

## Current release boundary

The only approved destination is the private GitHub repository
[`AshPlayer-1415/articulate`](https://github.com/AshPlayer-1415/articulate), numeric
repository ID `1436838545`, with origin
`https://github.com/AshPlayer-1415/articulate.git`. Publication, package publication,
container publication, and MCP registry publication are disabled. There are no
approved source exports or approved private source paths.

Only the seven scaffold files listed in `release-policy.json` may be committed at
bootstrap. The bootstrap guard permits one fresh root commit on `main` into an
empty remote. It rejects later pushes until a human explicitly authorizes the next
release step and the release controls are reviewed for that step.

Future source exports require a separately approved sanitized handoff containing
each exact destination path, its SHA-256 content hash, and explicit human approval.
Directories, globs, inferred approval, or access to a file do not authorize export.
Do not import user data, profiles, credentials, internal documents, or old Git
history. Do not clone, fetch, merge, mirror, copy wholesale, or add a remote for the
separate development repository.

Changing visibility; publishing packages, containers, releases, or MCP registry
listings; pushing to another repository; broad file discovery; importing external
source; or bypassing guards requires an explicit later human instruction.
No automatic telemetry or activity upload is authorized.

## Local checks

Node.js 22 or later and the authenticated GitHub CLI are required. There are no
package dependencies to install. Run `npm test` for offline guard tests. The guard
script is invoked by a locally installed Git `pre-push` hook; Git supplies the
remote name, destination URL, and reference updates. The hook is local to this
checkout and is not installed automatically by a clone or by `npm test`.

The guard validates the fixed target, live GitHub ID and private visibility,
release policy, exact committed file list, regular file modes, clean tracked
files, a single root commit, an empty remote, and creation of `main` only. API,
authentication, network, parsing, and Git failures reject the push. Its only online
operations are GitHub repository verification and Git transport checks; it does
not upload activity or scan other repositories.

Guards are defense in depth. Local hooks can be removed or bypassed, Git settings
can change, and remote visibility can change after a check. This is not an OS
security boundary, a content-sanitization guarantee, or a replacement for human
review. A different chat provides workflow separation, not an OS security
guarantee. Local release-control logs belong outside committed files.

## Inputs still required

Further work needs an explicitly approved sanitized source handoff, exact reviewed
paths and hashes, a human-approved license and ownership decision, reviewed
product documentation and claims, and explicit instructions for any publication
step. None of those inputs or permissions is supplied by this bootstrap.
