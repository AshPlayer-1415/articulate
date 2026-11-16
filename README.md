# Articulate public website

Public browser frontend for Articulate. The marketing homepage and `/connect/`
account connection page use the same text-only branding and self-hosted fonts.
Canonical homepage: https://ashplayer-1415.github.io/articulate/.

The connection page supports managed Google/GitHub sign-in, first-use name/work/
role questions, returning-user welcome, and a temporary encrypted CLI handoff.
Its JavaScript and public Supabase configuration are necessarily visible in the
browser. They contain no provider client secret, administrative key, MCP runtime,
analysis engine, database migration, server-side implementation, user record or
private development history. Server authorization is enforced in Supabase.
Browser software notices are in `connect/THIRD-PARTY.txt`; font/mark credits are
in `ASSETS.md`. The homepage has no analytics or account-service calls; the
connection page makes the account requests described in `privacy.html`.

This website-only repository is the source of truth. The same reviewed static
snapshot is mirrored to the independent `gh-pages` branch of the public release
repository to serve `/articulate/`. Product branches are never merged into it.
The original `/articulate-website/` homepage remains for old links; native login
uses only the canonical `/articulate/connect/` OAuth callback.

No build step or dependency installation is needed to serve these reviewed
browser assets. Preview with `python3 -m http.server 4190 --bind 127.0.0.1`.
OAuth callbacks require the separately configured allowed URL; a local preview
alone does not prove real provider sign-in or native account activation.

Support: hello@i-ops.dev

The static `/how-it-works/` visual guide and `/docs/` explain local setup and
the account-connected preview separately. The six `assets/guide/` screenshots
use synthetic demo inputs; they contain no owner screenshots or live codes.
