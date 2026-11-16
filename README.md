# articulate.

**Context for the way you understand and work.**

[Website](https://ashplayer-1415.github.io/articulate/) ·
[How it works](https://ashplayer-1415.github.io/articulate/how-it-works/) ·
[Docs](https://ashplayer-1415.github.io/articulate/docs/) ·
[Discussions](https://github.com/AshPlayer-1415/articulate/discussions) ·
[npm](https://www.npmjs.com/package/articulate-local)

Articulate helps you build reviewed working profiles and carry useful preferences
between coding agents. Keep the way you want to collaborate alongside the context
of your work, and choose which agents may receive it.

**Public early access.** You’re welcome to try the local pilot, ask questions,
share feedback and contribute. The current npm pilot is **0.0.1**. Features are
still evolving; review suggested preferences before using them. See the
[release scope](docs/public-beta-scope.md) for current capabilities and limits.

## Why Articulate?

Two people can read the same explanation and need different ways into it: an
example, clear steps or the reasoning behind a decision. That can change with
the task and what they already know.

Articulate makes those working preferences explicit and portable. A profile can
help an agent know how to approach the work with you; project context supplies
what the work is about. You stay in control of what is saved and shared.

It runs as a local CLI and MCP server. It can use available Codex, Claude Code
and Cursor activity for one repository or across projects. You review suggestions,
then grant access separately to each client. Claude Desktop can consume reviewed
context; its cloud chat history is not an import source.

Preferences guide presentation and collaboration. They do not measure intelligence
or establish improved factual accuracy. Your current request always takes priority.

## Install from npm

**Testing with Claude, Cursor or Codex?** Give your agent the copy-paste prompt.
[Agent-led pilot guide](docs/agent-pilot.md)

Use a supported patched Node.js release. The minimum patches are 22.23.4,
24.22.2 and 26.13.0 for their respective Node lines.

```sh
npm i -g articulate-local@pilot
articulate
```

Run `articulate` from your test project folder. Choose **One project** to review
preferences and follow the prompts to connect an agent. Install from npm
without an account. On Windows, `npm.cmd` and `articulate.cmd` work when
PowerShell's script policy blocks the shims.

For a one-time launch, run `npx articulate-local@pilot`. Use the global install
to keep agent connection paths stable. The npm name `articulate` belongs to a
document preparation package. [npm listing for articulate](https://www.npmjs.com/package/articulate)

The `pilot` tag selects 0.0.1. You can pin it with `npm i -g articulate-local@0.0.1`.
[Package on npm](https://www.npmjs.com/package/articulate-local/v/0.0.1) ·
[Tester steps](docs/releases/0.0.1.md) ·
[Verification receipt](docs/releases/0.0.1-verification.json)

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

## Profiles and shortcuts

Run `articulate modes` for the interactive profile and shortcut menu. Create Work,
Personal or project-specific profiles, approve them independently for each agent,
and retrieve only the chosen context. Save procedures such as `SR4@1` with required
inputs and completion checks. Procedures retrieve instructions; they execute nothing.

Read [profiles and shortcuts](docs/work-modes.md) before creating the first profile.
Update every connected server first: profile creation explicitly upgrades local
storage to schema 2, which older Articulate binaries refuse. Your General profile
stays separate; new profiles are not automatically shared or merged into it.

## Join the community

- **Questions and setup:** [Q&A](https://github.com/AshPlayer-1415/articulate/discussions/categories/q-a).
- **Product ideas:** [Ideas](https://github.com/AshPlayer-1415/articulate/discussions/categories/ideas).
- **What worked for you:** [Show and tell](https://github.com/AshPlayer-1415/articulate/discussions/categories/show-and-tell).
- **Reproducible bugs:** [open a bug report](https://github.com/AshPlayer-1415/articulate/issues/new/choose).
- **Vulnerabilities:** [report privately](https://github.com/AshPlayer-1415/articulate/security/advisories/new).

Share a small, anonymized example of the workflow. Keep chats, profile files,
credentials and login links out of public reports. [Community guidelines](CODE_OF_CONDUCT.md).

## What’s next

We’re improving profile creation, named styles and portable context for agents.
The public website includes previews of newer account and onboarding work; those
screens do not mean every preview feature is included in npm pilot 0.0.1.
Optional cloud services are planned. Follow [Announcements](https://github.com/AshPlayer-1415/articulate/discussions/categories/announcements)
and [the roadmap](docs/roadmap.md) for the distinction between available and planned work.

## Development

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

A product from [i-ops ↗](https://i-ops.dev/).
