# Configuration

`npm run go` creates `.env` from `.env.example` with fresh secrets. You only need to touch it to turn on optional integrations. Every variable is documented inline in [.env.example](../../../.env.example); this page lists the ones an owner actually decides about.

## Running it

| Command                                             | What it does                                                                                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run go`                                        | From a fresh clone to a running app: `.env`, packages, Postgres in Docker, migrations, extension build, web + worker, opens `/setup`. Safe to run every day; it skips what is done |
| `npm run setup`                                     | The same preparation without starting the app                                                                                                                                      |
| `npm run dev:all`                                   | Web on 127.0.0.1:43123 plus the worker, no preparation steps                                                                                                                       |
| `npm run dev` / `npm run worker`                    | Web and worker separately. A scan does nothing until the worker runs                                                                                                               |
| `npm run build && npm start`                        | Production build on the same port                                                                                                                                                  |
| `npm run mcp`                                       | The MCP server over stdio (Claude Code starts it for you)                                                                                                                          |
| `npm run catalog -w @newrole/jobs-lab -- <command>` | The offer engine's outside board catalog, on the lab's database: `import`, `check`, `reconcile`, `guess "<company>"`, `status`. See below                                          |
| `npm run harvest -w @newrole/jobs-lab`              | The offer engine: reads the due board APIs and pushes them to a harvest branch, for a scheduled cloud agent. See below                                                             |
| `npm run ext:build` / `npm run ext:dev`             | Rebuild the Chrome extension into `apps/reo-extension/.output/chrome-mv3`, or run WXT's dev mode                                                                                   |
| `npm run jobs-lab` / `npm run jobs-lab:smoke`       | The offer engine's test bench on 127.0.0.1:43125, and a live read of real boards ([apps/jobs-lab/README.md](../../jobs-lab/README.md))                                             |

To use a Postgres you already run instead of Docker, set `DATABASE_URL` in `.env`: `npm run go` uses it and leaves Docker alone. If port 5432 is taken on the first run, it picks another port and writes it to `.env`.

### Docker Compose

Runs Postgres, the web app, and a separate worker that restarts on failure. Claude Code and headless Chrome are not in the image, so model calls and one-click CV PDFs need the local setup or API keys.

```bash
cp .env.example .env
# SESSION_SECRET_KEY, OWNER_PASSWORD and POSTGRES_PASSWORD are required.
# Compose publishes the site and Postgres on 127.0.0.1 only.
docker compose up --build
```

Open http://127.0.0.1:43123. Search is public. The owner account is `OWNER_EMAIL` / `OWNER_PASSWORD`. Everyone else signs in with email or LinkedIn.

### Offers read in the cloud while this computer is off

The worker reads boards only while it runs. A scheduled agent task in the cloud can read them in the meantime: it runs `npm run harvest -w @newrole/jobs-lab` (the offer engine, `@newrole/job-index`; newrole.it itself no longer indexes offers), which reads the due board APIs with the worker's own adapters, schedule and 1-second pace per host, writes the offers to a branch ending in `newrole-harvest` (`harvest/manifest.json` plus one file per board, descriptions cut to the stored excerpt) and pushes it. It needs no database. Career sites, SuccessFactors and Workday are left to the local worker, because their 200-pages-per-host daily cap lives in the local database.

While the worker runs, it checks the remote every 10 minutes (a `HARVEST_IMPORT` task) and writes each board's newest cloud read into the index through the same code as a local read, when it is newer than the local one and its file matches the hash in the manifest. `/sync` shows what is read now, what waits, every board's last and next read, the queue, the cloud runs, and the prompt and network allowlist for Claude Code, Cursor or Codex.

```bash
npm run harvest -w @newrole/jobs-lab -- --agent claude --every 120   # what the agent's prompt runs
npm run harvest -w @newrole/jobs-lab -- --hosts                      # hosts to allow in the agent's network settings
npm run harvest -w @newrole/jobs-lab -- --dry-run --minutes 2        # read and report, commit nothing
```

Use it with a private repository only: the branch holds the offer index.

What the providers' docs said on 2 November 2026: Claude Code cloud scheduled tasks run with the laptop closed, at most hourly, and their default Trusted network blocks the ATS hosts until they are added under Custom ([scheduled tasks](https://code.claude.com/docs/en/routines), [cloud environments](https://code.claude.com/docs/en/cloud-environments)). Cursor Automations run in a cloud VM on a preset or cron schedule and can open pull requests; the page does not say whether they push to a branch directly ([automations](https://cursor.com/docs/cloud-agent/automations)). Codex scheduled tasks in the app need the computer on and the app running ([scheduled tasks](https://learn.chatgpt.com/docs/automations?surface=app)).

### The outside board catalog

`npm run catalog -w @newrole/jobs-lab -- import` reads freehire's MIT-licensed board list (company, ATS platform, board id; `apps/jobs-lab/packages/job-index/sources/freehire-boards-NOTICE.md`) as candidates, Workday included. `npm run catalog -w @newrole/jobs-lab -- discover [--crawl CC-MAIN-2026-43]` adds the boards found in Common Crawl's URL index (`apps/jobs-lab/packages/job-index/sources/commoncrawl-NOTICE.md`): it reads only archived addresses, from the index files on data.commoncrawl.org, a block at a time. Nothing is crawled at either step. `npm run catalog -w @newrole/jobs-lab -- check` then reads each candidate's board on its own platform and keeps it only when:

- the board exists and lists jobs;
- it is the company the list names, or the platform's own name fits the board id (Greenhouse, Workable, Recruitee, Teamtailor, Breezy and Pinpoint publish a name in their API; Ashby and Lever on the board page; Personio in `<subcompany>`; Workday as a posting's hiring organisation; BambooHR and Traffit publish none, so the name has to read as the board id);
- the name is a name and not an id echoed back ("12jlkfsk");
- at least one job is an IT role that says where it is, outside `BLOCKED_COUNTRIES`.

A board that passes is stored through the same gate as every other board, and the worker reads it again daily (after watched companies and the seed list), which checks it again: a board that stops passing is turned off and its offers close. A board with no IT offers or no placed offers is looked at weekly; one that is the wrong company, or not on the platform, is not read again. SmartRecruiters is not imported: its API stays off while api.smartrecruiters.com's robots.txt disallows other crawlers.

`check` runs one lane per shared API host (Greenhouse, Ashby, Lever, Workable) and `--lanes` lanes (default 6) for platforms with one host per company, all inside the 1-second-per-host pace. `reconcile` gives every open offer its countries and closes the ones the gate now refuses. `guess "<company>"` tries likely slugs on each platform and adds the ones that verify.

### Embedding the MCP server

`npm run mcp` is the supported way to run the server: stdio, on the person's own machine. To run it on another transport, import `createServer` from `mcp/create-server` (importing it starts nothing) and call `configureHost` from `mcp/host` first:

- `localInstall: false` for a server several people share. Only `SHARED_SERVER_TOOLS` in `mcp/create-server.ts` exist then: each person's profile, CV, applications and answers. No tool touches that machine's disk; offers come in by their link (`offer_add`).
- `currentUser` says who each call acts for. Without it, the server picks one account for the whole process, so a server used by several people must set it.
- `instructions` replaces the server instructions, which describe a local install.

`mcp/contract.test.ts` lists the tools and prompts each mode exposes.

## Variables

| Variable                         | Required             | What it does                                                                                                                                                                                                                                                 |
| -------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                   | yes                  | Postgres connection string                                                                                                                                                                                                                                   |
| `SESSION_SECRET_KEY`             | yes                  | Cookie signing key, at least 32 characters. Compose refuses to start without it. In production with a non-loopback `APP_ORIGIN` the app, worker and seed also refuse the sample values from `.env.example` (this key, `OWNER_PASSWORD`, `POSTGRES_PASSWORD`) |
| `OWNER_EMAIL` / `OWNER_PASSWORD` | for Compose and seed | Admin account. Password at least 10 characters. Password sign-in stays available for this account                                                                                                                                                            |
| `APP_ORIGIN`                     | no                   | Public origin for magic links and OAuth callbacks. Default `http://127.0.0.1:43123`. A non-loopback origin hides `/setup` and the Claude-in-Chrome LinkedIn import                                                                                           |
| `APP_URL`                        | no                   | Canonical public URL for metadata and the crawler contact page. Default `https://newrole.it`                                                                                                                                                                 |
| `TRUST_PROXY`                    | no                   | `1` when a reverse proxy in front of the app sets `X-Forwarded-For`; sign-in limits then count per client address. Unset: the header is ignored and every request shares one per-address limit                                                               |
| `POSTGRES_PASSWORD`              | for Compose          | Database password. The port is published on 127.0.0.1 only                                                                                                                                                                                                   |
| `NEWROLE_USER_EMAIL`             | no                   | Account the MCP server acts for. Unset: the only regular account, else the owner. The old name `NOWAROLA_USER_EMAIL` is still read when this one is unset                                                                                                    |
| `CHROME_PATH`                    | no                   | Headless Chrome for CV PDFs. Empty checks the standard macOS and Linux paths; without Chrome the editor falls back to the browser's Print → Save as PDF                                                                                                      |

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

### Discovery and crawl limits

| Variable                                                     | Required               | What it does                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRAVE_SEARCH_API_KEY`                                       | no                     | Primary discovery. Finds boards and listings the crawl missed, and a salary stated on another listing of the same role                                                                                                                                         |
| `SERPER_API_KEY`                                             | no                     | Used only when Brave is missing or a Brave call fails                                                                                                                                                                                                          |
| `WEB_SEARCH_PROVIDER`                                        | no                     | `claude` runs discovery web search through `claude -p` with only the WebSearch tool, when Brave and Serper keys are missing. `LLM_PROVIDER=claude-cli` turns it on too. `CLAUDE_SEARCH_DAILY_CAP` (default 40, `0` turns it off) limits it                     |
| `SCAN_SEED_LIMIT`                                            | no                     | Boards per scan. Default 40. `0` reads the full verified catalog                                                                                                                                                                                               |
| `CAREER_DETAIL_LIMIT`                                        | no                     | Job pages per career host per scan. Default 40, hard cap 200 per host per day                                                                                                                                                                                  |
| `DISCOVERY_QUERY_LIMIT`                                      | no                     | `site:` queries per scan. Default 14. Polish boards and Workday are never queried                                                                                                                                                                              |
| `CRAWLER_NOTE`                                               | no                     | What the crawler's User-Agent says about who runs it and why. Set it on anything but your own job search                                                                                                                                                       |
| `OFFER_INDEX`                                                | no                     | For the offer engine (`@newrole/job-index`, apps/jobs-lab): `off` stops it crawling and writing. newrole.it keeps no index. Gathering vacancies as a business for others is a regulated activity in Poland (Dz.U. 2025 poz. 620, art. 305 ust. 2 pkt 1 lit. c) |
| `OPERATOR_NAME` / `OPERATOR_CONTACT` / `OPERATOR_PROCESSORS` | on a server others use | Who answers for it. Once set, `/privacy` and `/terms` describe a service run by that operator                                                                                                                                                                  |
| `SMARTRECRUITERS_POSTING_API`                                | no                     | Default `off`, because robots.txt on `api.smartrecruiters.com` disallows other crawlers. `on` turns it on                                                                                                                                                      |
| `CRAWLER_OPT_OUT_HOSTS`                                      | no                     | Sites whose owner asked not to be read, comma separated. Subdomains count                                                                                                                                                                                      |
| `RECRUITEE_CAREERS_TOKEN`                                    | no                     | Employer token. Required for Recruitee after 10 February 2027                                                                                                                                                                                                  |
| `FETCH_TIMEOUT_MS` / `FETCH_MAX_BYTES`                       | no                     | Per-request timeout (15 s) and response cap (1.5 MB)                                                                                                                                                                                                           |
| `BLOCKED_COUNTRIES`                                          | no                     | Countries whose offers never enter the index, ISO codes. Unset means `RU,BY`; an empty value blocks nothing                                                                                                                                                    |
| `NBP_RATES`                                                  | no                     | `off` keeps the FX defaults in `packages/matching/config.ts`. Otherwise rates into PLN come from NBP table A, read every 12 hours                                                                                                                              |
| `MATCH_SALARY_FLOOR_PLN` and `FX_*_PLN`                      | no                     | Neutral matching defaults, and FX overrides that win over NBP                                                                                                                                                                                                  |

### Sign-in, mail and integrations

| Variable                                             | Required | What it does                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_PROVIDER`                                     | no       | `console` (default, logs the magic link), `resend` (`RESEND_API_KEY`), or `smtp` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`)                                                                                                                                                                                                               |
| `EMAIL_FROM`                                         | no       | Sender of magic-link mail                                                                                                                                                                                                                                                                                                                               |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`      | no       | LinkedIn OpenID Connect sign-in. Empty hides the LinkedIn button's success path. See [accounts.md](accounts.md)                                                                                                                                                                                                                                         |
| `GMAIL_TOKEN_KEY`                                    | no       | Only to revoke a mailbox connected in an earlier version (Settings → Gmail → Disconnect): it opens that token, or `SESSION_SECRET_KEY` does when it is empty. Nothing connects a mailbox any more and `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` are no longer read; mail is picked in the extension. See [product/plan-gmail.md](product/plan-gmail.md) |
| `LINKEDIN_BROWSER_IMPORT` / `LINKEDIN_BROWSER_MODEL` | no       | The Claude-in-Chrome profile import: `on` forces it, `off` hides it. Model defaults to `CLAUDE_CLI_MODEL`                                                                                                                                                                                                                                               |
| `HARVEST`                                            | no       | `off` stops the worker from checking the harvest branches a cloud agent pushes. Default on                                                                                                                                                                                                                                                              |
| `HARVEST_REMOTE`                                     | no       | The git remote the worker checks for harvest branches. Default `origin`                                                                                                                                                                                                                                                                                 |

## Tests

```bash
npm test
```

That runs each workspace's own tests (`npm run test:workspaces`: newrole.it's vitest tests in `apps/resume-engine-optimization` (`src/server`, `src/shared`, `src/app`, `mcp`), every package in `packages/`, the matching pack among them, and the jobs lab), the extension's (`npm run test:extension`), and the node:test flow tests of newrole.it (`apps/resume-engine-optimization/test`: auth, offers, privacy, Gmail, CV tailoring, the sheet) and of the engine (`apps/jobs-lab/packages/job-index/test`: indexer, search flow, company suggestions, harvest import) against the `_test` database, which must exist and be migrated (`npm run test:db`). `npm run lint` covers style; `npm run typecheck` compiles every package and app on its own, and `npm run check:boundaries` checks that none of them imports the app or anything it does not declare ([architecture.md](architecture.md)).
