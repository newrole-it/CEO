# Security

## Supported versions

newrole.it has no tagged releases yet. Only the `main` branch is supported, and security fixes go there.

## Reporting a vulnerability

Do not report a vulnerability in a public issue, pull request or comment.

- If the repository offers **Report a vulnerability** on its Security → Advisories page, use it. That is GitHub's private vulnerability reporting.
- If it does not, open an issue that asks for a private contact. Name only the part that is affected (the web app, the Chrome extension, the MCP server, `npm run go` or Docker Compose) and leave out every detail of the problem until you have a private channel.

> **TODO for the maintainer:** add a private contact for security reports that is meant to be public, or turn on private vulnerability reporting for the repository. Then remove the issue route above.

A good report says:

- which part is affected, and the commit you ran (`git rev-parse --short HEAD`);
- how you ran it: `npm run go`, `npm run dev`, Docker Compose, or something else;
- the steps that show the problem, and what someone gains from it.

Use made-up data. Do not send real CV contents, tokens, passwords or anything from your `.env`.

## Scope

This repository holds:

- newrole.it, the web app, and its MCP server (`apps/resume-engine-optimization`);
- the Chrome extension (`apps/reo-extension`);
- the install script (`scripts/go.mjs`, run by `npm run go`) and Docker Compose (`docker-compose.yml`, `apps/resume-engine-optimization/Dockerfile`).

How it is meant to run:

- `npm run dev` and `npm start` bind the web app to 127.0.0.1, port 43123 (`apps/resume-engine-optimization/package.json`).
- Docker Compose publishes the web app and Postgres on 127.0.0.1 only. The image runs as the unprivileged `node` user.
- The MCP server runs over stdio on the person's own machine (`npm run mcp`). Running it for several people is described in [configuration.md](apps/resume-engine-optimization/docs/configuration.md#embedding-the-mcp-server).
- The Chrome extension talks only to the web app, at 127.0.0.1:43123 by default. Its token is kept in `chrome.storage.local`, only the extension's service worker sees it, and the extension never passes it to a page. You revoke the token in the app's Settings ([apps/reo-extension/README.md](apps/reo-extension/README.md)).
- The database can hold more than one account.

So we want to hear, for example, about:

- a web page, or another extension, getting the extension's token;
- one account reading or changing another account's data;
- the web app or the database being reachable from another machine when it runs as described above;
- the extension filling or sending what its README says it never does: passwords, hidden fields, card numbers, consents and the like.
