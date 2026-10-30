# Articulate

One reviewed understanding of how you work, shared with your coding agents.

Articulate is a local CLI and MCP server for reviewed collaboration preferences.
It detects available Codex, Claude Code and Cursor activity for one repository or
across projects. You review suggestions, then choose which clients may use them.
Claude Desktop can consume the profile; its chat history is not an import source.

**Alpha:** historical inference is experimental. It does not measure intelligence,
personality or learning rate, and does not establish improved factual accuracy.
Current task instructions override stored presentation preferences.

## Install from this repository

Use an updated Node.js 22, 24 or 26 LTS and Git. Run these commands in Terminal
(macOS/Linux) or PowerShell (Windows):

```sh
git clone https://github.com/AshPlayer-1415/articulate.git
cd articulate
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm install --global ./dist/local --ignore-scripts --no-audit --no-fund
articulate
```

The same `articulate` command is installed on Mac and Windows. Dependency download
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
[privacy](docs/privacy.md) and [troubleshooting](docs/troubleshooting.md).
A green connection proves neither compliance by every model nor factual quality.

## npm distribution

The package prepared for later publication is **articulate-local**, with the CLI
name **articulate**. The npm name `articulate` belongs to an existing package;
do not install it expecting this project. This repository/build does not publish
anything automatically. Until the maintainer actually publishes this alpha, use
the repository installation above. After publication the command will be:

```sh
npm install --global articulate-local@alpha
```

See the [maintainer launch checklist](docs/PUBLIC-RELEASE-CHECKLIST.md) for the
actual visibility, CI, package inspection and npm publication steps.

## Development and feedback

```sh
npm run check
npm test
npm run test:boundary
npm run build
npm run test:distribution
```

The CI matrix exercises macOS, Windows and Linux on three maintained Node lines.
Read actual CI results; a configured workflow alone is not a passing test. Real
agent UI installation/approval still needs users on each OS. File ordinary bugs
with versions, expected/actual behavior and redacted synthetic reproduction.
Never attach chats, credentials, profiles, activity databases or consent links.
Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

Apache-2.0: [LICENSE](LICENSE). Bundles include third-party license/notice texts.
