# Security reporting

Please use [GitHub private vulnerability reporting](https://github.com/AshPlayer-1415/articulate/security/advisories/new)
for suspected vulnerabilities. Private reporting is enabled for this repository.
If that route is unavailable, email [hello@i-ops.dev](mailto:hello@i-ops.dev)
with a brief description and ask how to share sensitive details securely.

Do not post credentials, full login/consent URLs, private transcripts, user profiles,
activity databases or exploitable details in public issues or Discussions.
Use a synthetic reproduction and include the affected Articulate/Node/host versions,
expected boundary, observed result and impact. Do not access another person's data
to demonstrate an issue.

The public early-access package is `articulate-local@0.0.1` (`pilot` tag). Please
identify the exact version or source commit in your report. We do not promise a
response time, a bug bounty or independent security certification.

Local consent and adversarial checks cover specific invariants. They do not
establish universal injection resistance or constrain an AI host's other filesystem
and shell tools. Keep Node and hosts patched. Revoke an affected client's sharing
while investigating. Original host histories and provider copies have separate
retention and deletion controls.
