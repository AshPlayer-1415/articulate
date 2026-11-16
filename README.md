# Articulate website

Public presentation-only website for Articulate, a local-first coding-agent pilot.

This repository contains only the website's HTML, CSS and presentation JavaScript.
It does not contain the product runtime, MCP server, account application,
authentication SDK, backend, database schema, credentials, user data or private
development history. The profile examples are fictional presentation copy.

GitHub Pages serves the root of the `main` branch. No build step, package install,
framework or external asset service is required. Relative asset links let the
website move to a custom domain or another static host later. Account sign-in is
a separate application and is not implemented by this landing page.

To preview locally, run `python3 -m http.server 4190 --bind 127.0.0.1` in this
directory, then open `http://127.0.0.1:4190/`. The website does not collect analytics
or contact form submissions. GitHub Pages has its own security request logging;
see the public privacy notes.

Support: hello@i-ops.dev
