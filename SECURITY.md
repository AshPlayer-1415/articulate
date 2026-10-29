# Security reporting

Do not put credentials, consent links, private transcripts, device-specific
configuration or exploitable details into a public issue. Once this repository
is public and private vulnerability reporting is enabled, use its Security tab's
private reporting flow. A reporting channel and response owner must be verified
before the public pilot opens; this draft promises no response-time guarantee.

The current alpha has local permission checks and adversarial regression tests.
These do not establish immunity to prompt injection, correctness of every model
response, or protection against a process that can read your local files.
Keep your OS, Node runtime and AI hosts patched. Revoke an affected client and
avoid sharing its files while investigating a suspected disclosure.
