# Articulate website

Public presentation-only website for Articulate, a local-first coding-agent pilot.

This repository contains only the website's HTML, CSS and presentation JavaScript.
It does not contain the product runtime, MCP server, account application,
authentication SDK, backend, database schema, credentials, user data or private
development history. The profile examples are fictional presentation copy.

The canonical homepage is https://ashplayer-1415.github.io/articulate/.
This website-only repository is the source of truth. Its exact reviewed static
files are also published on the isolated `gh-pages` branch of the existing public
`AshPlayer-1415/articulate` repository, giving the shorter project-site path.
That branch has independent website-only history; product branches are not merged
into it. The `main` branch here also serves the original `/articulate-website/` URL. No build step, package install,
framework or external asset service is required. Fonts and agent icons are
self-hosted; provenance and font licenses are in `ASSETS.md` and `assets/fonts/`. Relative asset links let the
website move to a custom domain or another static host later. Account sign-in is
a separate application and is not implemented by this landing page.

To preview locally, run `python3 -m http.server 4190 --bind 127.0.0.1` in this
directory, then open `http://127.0.0.1:4190/`. The website does not collect analytics
or contact form submissions. GitHub Pages has its own security request logging;
see the public privacy notes.

Support: hello@i-ops.dev
