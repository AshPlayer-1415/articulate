# Articulate

One reviewed set of collaboration preferences for your coding agents.

This is a proposed source snapshot for a local alpha. It has not been published.
Articulate finds supported local Codex, Claude Code and Cursor activity, proposes
working preferences for your review, and lets approved MCP clients retrieve your
reviewed profile. Claude Desktop can consume that profile; its historical chats
are not an activity source. Collection and sharing require separate choices.

History interpretation is experimental. Articulate does not establish personality,
intelligence, learning rate or improved factual accuracy. Current task instructions
take precedence over stored presentation preferences. Check the answer's facts.

## Build locally

Use a maintained Node.js 22 release, at least 22.16.0, and npm 10 or later. This candidate
has been exercised on macOS with Node 22.21.0 and npm 11.13.0. Other platforms need validation.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run build
node dist/local/bin/articulate.mjs help
```

Dependency installation can contact the npm registry. None of these commands
imports personal activity. The build writes code and third-party notices to
`dist/local`; keep that directory in a stable location for MCP connections.
Do not install the TypeScript source tree globally. The bundled local package
avoids runtime TypeScript loading from `node_modules`.

## Start with one project or all projects

```sh
node dist/local/bin/articulate.mjs project /absolute/path/to/your/repository
node dist/local/bin/articulate.mjs all
```

Choose one command. Follow the interactive choices, review the proposed wording
and scope, then choose which agents may use it. A source can be missing, excluded
or only partly processed; read the coverage summary. No reliable history is a
valid result, and you can choose preferences yourself.

```sh
node dist/local/bin/articulate.mjs connect
```

Review configuration changes and each agent's local sharing page. Reload its MCP
connection and start a new chat. See [setup and connection testing](docs/setup.md).
Each client needs its own grant. A green connection does not prove that a model
followed the preferences or preserved every fact.

## Privacy and feedback

There is no Articulate account or operated cloud service. Activity is stored
locally. MCP exposes permitted summaries and reviewed preferences, not imported
raw transcripts. The receiving AI provider may process MCP results. An explicitly
configured remote analysis endpoint is a separate opt-in data transfer; local-only
use requires no such endpoint. See [privacy](docs/privacy.md).

For a bug report, start with the app/OS/Node versions, command, expected result and
actual error. Share only excerpts you have inspected and redacted yourself. Never
attach profiles, histories, credential files, device-bound bundles or consent URLs.
See [contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md).

The proposed local client license is [Apache-2.0](LICENSE). This draft does not
authorize publication. Package, registry and container publication remain disabled.
