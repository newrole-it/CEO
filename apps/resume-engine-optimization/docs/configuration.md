# Configuration

`npm run go` creates `.env` from `.env.example` with fresh secrets. You only need to touch it to turn on optional integrations. Every variable is documented inline in [.env.example](../../../.env.example); this page lists the ones an owner actually decides about.

## Running it

| Command                                 | What it does                                                                                                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run go`                            | From a fresh clone to a running app: `.env`, packages, Postgres in Docker, migrations, extension build, starts the apps switched on in `.env` (`APP_…`), opens `/setup`. Safe to run every day; it skips what is done |
| `npm run setup`                         | The same preparation without starting the app                                                                                                                                                                         |
| `npm run dev`                           | The app on 127.0.0.1:43123, no preparation steps. Its background work (the Google Sheet sync, the company names the extension matches offers by) runs inside it                                                       |
| `npm run build && npm start`            | Production build on the same port                                                                                                                                                                                     |
| `npm run mcp`                           | The MCP server over stdio (Claude Code starts it for you)                                                                                                                                                             |
| `npm run ext:build` / `npm run ext:dev` | Rebuild the Chrome extension into `apps/reo-extension/.output/chrome-mv3`, or run WXT's dev mode                                                                                                                      |

To use a Postgres you already run instead of Docker, set `DATABASE_URL` in `.env`: `npm run go` uses it and leaves Docker alone. If port 5432 is taken on the first run, it picks another port and writes it to `.env`.

### Docker Compose

Runs Postgres and the app, which restarts on failure. The app runs its background work itself, so there is no worker container. Claude Code and headless Chrome are not in the image, so model calls and one-click CV PDFs need the local setup or API keys.

```bash
cp .env.example .env
# SESSION_SECRET_KEY, OWNER_PASSWORD and POSTGRES_PASSWORD are required.
# Compose publishes the site and Postgres on 127.0.0.1 only.
docker compose up --build
```

Open http://127.0.0.1:43123. Search is public. The owner account is `OWNER_EMAIL` / `OWNER_PASSWORD`. Everyone else signs in with email or LinkedIn.

### Embedding the MCP server

`npm run mcp` is the supported way to run the server: stdio, on the person's own machine. To run it on another transport, import `createServer` from `mcp/create-server` (importing it starts nothing) and call `configureHost` from `mcp/host` first:

- `localInstall: false` for a server several people share. Only `SHARED_SERVER_TOOLS` in `mcp/create-server.ts` exist then: each person's profile, CV, applications and answers. No tool touches that machine's disk; offers come in by their link (`offer_add`).
- `currentUser` says who each call acts for. Without it, the server picks one account for the whole process, so a server used by several people must set it.
- `instructions` replaces the server instructions, which describe a local install.

`mcp/contract.test.ts` lists the tools and prompts each mode exposes.

## Variables

| Variable                         | Required             | What it does                                                                                                                                                                                                                                             |
| -------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | yes                  | Postgres connection string                                                                                                                                                                                                                               |
| `SESSION_SECRET_KEY`             | yes                  | Cookie signing key, at least 32 characters. Compose refuses to start without it. In production with a non-loopback `APP_ORIGIN` the app and the seed also refuse the sample values from `.env.example` (this key, `OWNER_PASSWORD`, `POSTGRES_PASSWORD`) |
| `OWNER_EMAIL` / `OWNER_PASSWORD` | for Compose and seed | Admin account. Password at least 10 characters. Password sign-in stays available for this account                                                                                                                                                        |
| `APP_ORIGIN`                     | no                   | Public origin for magic links and OAuth callbacks. Default `http://127.0.0.1:43123`. A non-loopback origin hides `/setup` and the Claude-in-Chrome LinkedIn import                                                                                       |
| `APP_URL`                        | no                   | Canonical public URL for metadata and the crawler contact page. Default `https://newrole.it`                                                                                                                                                             |
| `TRUST_PROXY`                    | no                   | `1` when a reverse proxy in front of the app sets `X-Forwarded-For`; sign-in limits then count per client address. Unset: the header is ignored and every request shares one per-address limit                                                           |
| `POSTGRES_PASSWORD`              | for Compose          | Database password. The port is published on 127.0.0.1 only                                                                                                                                                                                               |
| `NEWROLE_USER_EMAIL`             | no                   | Account the MCP server acts for. Unset: the only regular account, else the owner. The old name `NOWAROLA_USER_EMAIL` is still read when this one is unset                                                                                                |
| `CHROME_PATH`                    | no                   | Headless Chrome for CV PDFs. Empty checks the standard macOS and Linux paths; without Chrome the editor falls back to the browser's Print → Save as PDF                                                                                                  |

### Models

| Variable                                                   | Required     | What it does                                                                                                                                                                                         |
| ---------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_PROVIDER`                                             | no           | `claude-cli`, `openai`, or `none`. Unset: `claude-cli` when the `claude` binary is found, else `openai` when `LLM_API_KEY` is set, else `none` (rules only). `claude-cli` never falls back to an API |
| `CLAUDE_CLI_MODEL`                                         | no           | Model for `claude -p`. Default `haiku`                                                                                                                                                               |
| `CLAUDE_CLI_PATH`                                          | no           | Path to the `claude` binary when it is not on `PATH` (also checked: `~/.local/bin/claude`)                                                                                                           |
| `CLAUDE_CLI_MAX_CONCURRENT` / `CLAUDE_CLI_TIMEOUT_MS`      | no           | At most 2 processes at once, 90 seconds each                                                                                                                                                         |
| `CLAUDE_CLI_SKIP_PURPOSES`                                 | no           | Purposes that stay on rules. Default `role-classify`, so indexing does not spend your subscription                                                                                                   |
| `CLAUDE_WRITING_MODEL` / `CLAUDE_WRITING_TIMEOUT_MS`       | no           | Model for text you send to employers (answer drafts, application forms). Default `sonnet`, 150 seconds                                                                                               |
| `LLM_API_KEY`                                              | no           | OpenAI-compatible key. Used only without Claude Code, or with `LLM_PROVIDER=openai`. Mainly for Docker, whose image has no Claude Code                                                               |
| `LLM_BASE_URL` / `LLM_MODEL`                               | with the key | Defaults to OpenAI `gpt-4o-mini`. An xAI base URL works the same way                                                                                                                                 |
| `LLM_INPUT_USD_PER_MILLION` / `LLM_OUTPUT_USD_PER_MILLION` | no           | Only affect the cost estimate. Token counts are stored either way                                                                                                                                    |

With `claude-cli`, each model call is one `claude -p --output-format json` process: the prompt goes in on stdin, built-in tools and MCP servers are off. A JSON reply that fails validation is retried once. Replies use the same cache and the same rules for CV text as the API provider. Reading a CV takes about 3–4 seconds with `haiku`.

### Reading offers

| Variable                                                     | Required               | What it does                                                                                                                      |
| ------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `CAREER_DETAIL_LIMIT`                                        | no                     | Job pages per career host per scan. Default 40, hard cap 200 per host per day                                                     |
| `CRAWLER_NOTE`                                               | no                     | What the crawler's User-Agent says about who runs it and why. Set it on anything but your own job search                          |
| `OPERATOR_NAME` / `OPERATOR_CONTACT` / `OPERATOR_PROCESSORS` | on a server others use | Who answers for it. Once set, `/privacy` and `/terms` describe a service run by that operator                                     |
| `SMARTRECRUITERS_POSTING_API`                                | no                     | Default `off`, because robots.txt on `api.smartrecruiters.com` disallows other crawlers. `on` turns it on                         |
| `CRAWLER_OPT_OUT_HOSTS`                                      | no                     | Sites whose owner asked not to be read, comma separated. Subdomains count                                                         |
| `RECRUITEE_CAREERS_TOKEN`                                    | no                     | Employer token. Required for Recruitee after 10 February 2027                                                                     |
| `FETCH_TIMEOUT_MS` / `FETCH_MAX_BYTES`                       | no                     | Per-request timeout (15 s) and response cap (1.5 MB)                                                                              |
| `BLOCKED_COUNTRIES`                                          | no                     | Countries whose offers never enter the index, ISO codes. Unset means `RU,BY`; an empty value blocks nothing                       |
| `NBP_RATES`                                                  | no                     | `off` keeps the FX defaults in `packages/matching/config.ts`. Otherwise rates into PLN come from NBP table A, read every 12 hours |
| `FX_*_PLN`                                                   | no                     | FX overrides that win over NBP                                                                                                    |

### Sign-in, mail and integrations

| Variable                                             | Required | What it does                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_PROVIDER`                                     | no       | `console` (default, logs the magic link), `resend` (`RESEND_API_KEY`), or `smtp` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`)                                                                                                                                                                                                               |
| `EMAIL_FROM`                                         | no       | Sender of magic-link mail                                                                                                                                                                                                                                                                                                                               |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`      | no       | LinkedIn OpenID Connect sign-in. Empty hides the LinkedIn button's success path. See [accounts.md](accounts.md)                                                                                                                                                                                                                                         |
| `GMAIL_TOKEN_KEY`                                    | no       | Only to revoke a mailbox connected in an earlier version (Settings → Gmail → Disconnect): it opens that token, or `SESSION_SECRET_KEY` does when it is empty. Nothing connects a mailbox any more and `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` are no longer read; mail is picked in the extension. See [product/plan-gmail.md](product/plan-gmail.md) |
| `LINKEDIN_BROWSER_IMPORT` / `LINKEDIN_BROWSER_MODEL` | no       | The Claude-in-Chrome profile import: `on` forces it, `off` hides it. Model defaults to `CLAUDE_CLI_MODEL`                                                                                                                                                                                                                                               |

## Tests

```bash
npm test
```

That runs each workspace's own tests (`npm run test:workspaces`: newrole.it's vitest tests in `apps/resume-engine-optimization` (`src/server`, `src/shared`, `src/app`, `mcp`), every package in each app's `packages/`, the matching pack among them, and any other app's, jobs lab included), the extension's (`npm run test:extension`), and the node:test flow tests of newrole.it (`apps/resume-engine-optimization/test`: auth, offers, privacy, Gmail, CV tailoring, the sheet) and of the engine (`apps/jobs-lab/packages/job-index/test`: indexer, search flow, company suggestions, harvest import) against a test database next to the one in `.env`, which must exist and be migrated (`npm run test:db` for newrole.it's). `npm run lint` covers style; `npm run typecheck` compiles every package and app on its own, and `npm run check:boundaries` checks that none of them imports an app or anything it does not declare, and that newrole.it uses nothing of another app ([architecture.md](architecture.md)).
