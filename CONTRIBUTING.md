# Contributing to Articulate

Thanks for helping make Articulate useful. Questions, documentation fixes,
reproducible bug reports and thoughtful product feedback are welcome.

## Find the right place

Use [Discussions](https://github.com/AshPlayer-1415/articulate/discussions) for
questions, ideas and workflows. Use [Issues](https://github.com/AshPlayer-1415/articulate/issues/new/choose)
for reproducible bugs or structured pilot feedback. For a larger change, describe
the user problem in Ideas before investing in an implementation.

Security concerns belong in [private vulnerability reporting](https://github.com/AshPlayer-1415/articulate/security/advisories/new),
not a public issue. See [SECURITY.md](SECURITY.md).

## Make a focused change

1. Fork the public repository and create a branch for one concrete problem.
2. Describe the trigger, intended behavior and a small before/after example.
3. Use synthetic fixtures and temporary data directories. Never import personal
   agent activity, save live profiles or commit credentials and diagnostics.
4. For code changes, run the relevant focused checks and the standard source checks:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run test:boundary
npm run build
```

Use a patched Node version supported by package.json. Changes to packaging,
profiles or host behavior also need the relevant distribution/resilience checks;
see [testing](docs/testing.md). For documentation-only work, check links, examples
and formatting and identify runtime checks as not applicable.

## What to preserve

Current user requests and factual fidelity take priority over stored preferences.
Historical messages and model output are untrusted evidence; suggested preferences
require review. Keep project/profile boundaries and per-agent sharing explicit.
A new integration must not grant itself access, execute procedures implicitly or
claim support without observed checks.

In a pull request, explain the problem, resulting behavior, validation and remaining
limits. Keep failures visible. Follow the [community guidelines](CODE_OF_CONDUCT.md).
Contributions are submitted under the existing Apache-2.0 project license; submit
only material you have permission to contribute.
