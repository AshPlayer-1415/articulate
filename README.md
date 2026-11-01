# Articulate

> **Testing beta — not ready for general public or production use.**
> This repository is public so volunteers can inspect and test the work in progress.
> Expect bugs and incomplete coverage. Historical inference is experimental;
> review every proposed preference and keep backups. Public source availability
> does not mean a stable release or verified support for every agent/platform.

One reviewed understanding of how you work, shared with your coding agents.

Articulate is a local CLI and MCP server for reviewed collaboration preferences.
It detects available Codex, Claude Code and Cursor activity for one repository or
across projects. You review suggestions, then choose which clients may use them.
Claude Desktop can consume the profile; its chat history is not an import source.

**Testing beta:** historical inference is experimental. It does not measure intelligence,
personality or learning rate, and does not establish improved factual accuracy.
Current task instructions override stored presentation preferences.

## Install from this repository

Use a supported, patched Node.js 22, 24 or 26 release and Git. Run these commands in Terminal
(macOS/Linux) or PowerShell (Windows):

```sh
git clone https://github.com/AshPlayer-1415/articulate.git
cd articulate
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm install --global ./dist/local --ignore-scripts --no-audit --no-fund
articulate
```

The same `articulate` command is installed on Mac and Windows. If PowerShell
blocks a `.ps1` shim, use `npm.cmd` and `articulate.cmd` explicitly; no execution
policy change is required. Dependency download
needs network access. The built CLI has no runtime npm dependencies and needs no
Docker, account or API key. Use a user-managed Node install if the global prefix
is not writable; do not solve a permission error by blindly using sudo.

## One project or all your work

```sh
articulate project /absolute/path/to/repository
articulate all
```

On Windows, for example: `articulate project "C:\work\my-project"`.
Run one of these commands, read the scope, and review suggestions before approving
them. No useful history is a valid result; choose your own preferences instead.
Cloud-only/deleted records and unsupported stores may be absent. Quick extraction
finds literal requests; richer local-model analysis is optional and experimental.

## Connect Claude, Codex, Cursor—or all of them

```sh
articulate connect
```

Review the settings-change prompt, then select the clients you want to approve.
Settings are backed up locally. Configuration preparation covers four hosts;
sharing is a separate grant for each. Claude Desktop can require installing the
prepared device-specific extension. Keep that package on your machine.
Reload the connection and open a new agent chat. Try:

> Use Articulate for this repository. Check articulate_status, then retrieve my
> analysis and debugging policy for the repository's actual absolute projectPath.
> Apply only reviewed preferences. Do not import history or save new preferences.

See [agent connections](docs/agents.md), [testing](docs/testing.md),
[privacy](docs/privacy.md), [troubleshooting](docs/troubleshooting.md) and
[compatibility/scope](docs/compatibility-and-scope.md).
A green connection proves neither compliance by every model nor factual quality.

## Profiles and shortcuts (source candidate)

Run `articulate modes` for the interactive profile and shortcut menu. Create Work,
Personal or project-specific profiles, approve them independently for each agent,
and retrieve only the chosen context. Save procedures such as `SR4@1` with required
inputs and completion checks. Procedures retrieve instructions; they execute nothing.

Read [profiles and shortcuts](docs/work-modes.md) before creating the first profile.
Update every connected server first: profile creation explicitly upgrades local
storage to schema 2, which older Articulate binaries refuse. Your General profile
stays separate; new profiles are not automatically shared or merged into it.

## npm distribution

**Published:** [articulate-local 2.2.0-alpha.7](https://www.npmjs.com/package/articulate-local).
The source is public for beta testing. Installing the npm runtime does not need
GitHub access or an npm account. The npm README is self-contained. Source candidate
2.3.0-beta.1 adds named profiles and versioned shortcuts; it is not yet on npm.
Installing @alpha currently installs alpha.7.

```sh
npm install --global articulate-local@alpha
articulate
```

Then run `articulate connect` to install host settings and approve selected
clients. Use a supported, patched Node LTS release. The package named `articulate`
is unrelated; our package is `articulate-local` and its command is `articulate`.

Use `@alpha` explicitly: no stable release is available, even if npm displays a
`latest` tag for this prerelease. Read the CI results for the exact source commit
before treating a candidate as verified. Testing a source checkout and installing
the current npm package may exercise different versions.

See the [maintainer checklist](docs/PUBLIC-RELEASE-CHECKLIST.md) for exact scope and
evidence. No workflow publishes packages or changes repository visibility.

## Development and feedback

```sh
npm run check
npm test
npm run test:boundary
npm run build
npm run test:distribution
npm run test:resilience
npm run test:work-modes
```

The CI matrix exercises macOS, Windows and Linux on three maintained Node lines.
Read actual CI results; a configured workflow alone is not a passing test. Real
agent UI installation/approval still needs users on each OS. File ordinary bugs
with versions, expected/actual behavior and redacted synthetic reproduction.
Never attach chats, credentials, profiles, activity databases or consent links.
Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

Apache-2.0: [LICENSE](LICENSE). Bundles include third-party license/notice texts.
