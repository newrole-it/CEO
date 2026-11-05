# jobs lab

A test bench for the offer engine that left newrole.it ([@newrole/ats](../resume-engine-optimization/packages/ats/README.md) and [@newrole/job-index](packages/job-index/README.md)). It is not part of newrole.it's release: run it after a change to the engine to see that reading boards and offers still works, and to build an index of offers in a database of its own.

Everything the lab is made of lives in this folder: the app (`src/`, `scripts/`), the engine ([packages/job-index](packages/job-index/README.md)), its database schema and migrations ([packages/db](packages/db/README.md)), its docs (`docs/`) and its variables (`.env.example`). Deleting the folder leaves newrole.it working.

## What it takes from newrole.it

It uses newrole.it's packages (apps/resume-engine-optimization/packages) as ordinary dependencies: in this repository npm workspaces link them, in a repository of its own they would come from newrole.it's. Nothing is copied.

| Package | What for |
|---|---|
| `@newrole/ats` | Reading boards and offers: the platform adapters, career sites, board detection on a careers page, one offer from its link, identity and countries of an offer |
| `@newrole/offers` | The rules every read follows: SSRF-safe HTTP, robots.txt and the per-host pace, source policies; personal data and AI opt-outs out of offer text; the Polish job boards a search links out to |
| `@newrole/matching` | Normalizing and deduping postings, salaries into PLN with NBP rates; the engine's scorer builds on it |
| `@newrole/llm` | The model client and headless Claude (`claude -p`): query expansion, match explanations, role classification, similar companies, Claude search |
| `@newrole/profile` | Industry, salary and profile shapes the ranking reads |
| `@newrole/app-kit` | The origin guard on the lab's routes, the languages of a request |
| `@newrole/ui` | The lab's buttons and styles |

newrole.it never depends on the lab: `npm run check:boundaries` fails if it does.

## Screens and the smoke run

```bash
npm run dev -w @newrole/jobs-lab      # http://127.0.0.1:43125
npm run smoke -w @newrole/jobs-lab    # real boards from the seed catalog, one per platform
```

Everything on the screens reads live, politely, and nothing is stored:

- **Board**: pick a platform and a board id; the board is read through its adapter, as the index reads it. The count, whether the list is complete, timings, and any offer that breaks the contract (no title, a link that does not parse).
- **One offer from its link**: what newrole.it's Add offer does (`readOfferUrl`, then `readOfferSource` for the whole text).
- **Boards on a careers page**: the ATS boards a company's careers page links to or embeds.

**Smoke run.** `npm run smoke -w @newrole/jobs-lab` reads the highest-priority board of each main platform from the seed catalog (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, Teamtailor, Personio) and exits non-zero when a platform gives nothing. A board that emptied since the catalog was checked is skipped for the next one. `--providers LEVER,ASHBY`, `--per 2`, `--list` (every indexable board).

It reads with its own User-Agent (`NewRoleBot/0.1 (+…/bot; newrole.it engine test bench)`, `CRAWLER_NOTE` replaces the note), one request per second per host, and counts detail pages in memory. Bound to 127.0.0.1; its routes answer its own pages only (`createOriginGuard`, `JOBS_LAB_ORIGIN` adds a public origin).

## The database

The index goes into the lab's own Postgres database, never into newrole.it's: `JOBS_LAB_DATABASE_URL`, or the database in `DATABASE_URL` with `_lab` added (`jobscanner` → `jobscanner_lab`). Its schema and migrations are the lab's ([packages/db](packages/db/README.md)), and so is its Prisma client, generated into that package by `npm install`.

`go:prepare`, `db:prepare`, `seed`, `index`, `worker` and `catalog` refuse newrole.it's own database (`DATABASE_URL`) and newrole.it's test database (`DATABASE_URL`'s with `_test`, or `TEST_DATABASE_URL`), whatever host alias or user the URL uses. It also stops, before migrating, when a table of newrole.it that holds a person's records has rows.

A lab database migrated with newrole.it's migrations (as the lab did until November 2026) keeps its index: the next `go:prepare` or `db:prepare` applies only the lab's migration that drops newrole.it's other tables.

```bash
npm run go:prepare -w @newrole/jobs-lab   # all of it: database, migrations, client, seed data
npm run db:prepare -w @newrole/jobs-lab   # only create it and apply the lab's migrations
npm run seed -w @newrole/jobs-lab         # the platforms and the seed catalog's career pages
npm run index -w @newrole/jobs-lab -- GREENHOUSE <boardId>   # index one seed board, print what is stored
npm run worker -w @newrole/jobs-lab       # the engine's worker
npm run catalog -w @newrole/jobs-lab -- status       # the outside catalog
npm run harvest -w @newrole/jobs-lab -- --dry-run    # a cloud harvest run, without pushing
```

`go:prepare` is safe to run again and takes a second or two when nothing changed; it generates the client only when the schema changed. On failure it exits non-zero with one line saying why.

**Tests.** `npm test -w @newrole/jobs-lab` and `npm test -w @newrole/job-index` need no database. `npm run test:flow -w @newrole/job-index` creates and migrates the lab's test database first: `JOBS_LAB_TEST_DATABASE_URL`, or the database in `DATABASE_URL` with `_lab_test` added. It is apart from newrole.it's `<db>_test` because the two schemas differ.

## Variables

The lab reads its own `.env` files first (`apps/jobs-lab/.env.local`, `.env`, …, in the order Next reads them), then the repository root's, where `npm run go` writes them; a variable set in the shell wins over both. The same order holds for the Next app (`next.config.js`) and for the scripts (`scripts/root-env.js`).

[.env.example](.env.example) lists the variables only the lab and its engine read: the lab's databases, `JOBS_LAB_ORIGIN`, web search (`BRAVE_SEARCH_API_KEY`, `SERPER_API_KEY`, `WEB_SEARCH_PROVIDER`, `CLAUDE_SEARCH_DAILY_CAP`), the size of a scan (`SCAN_SEED_LIMIT`, `DISCOVERY_QUERY_LIMIT`), `OFFER_INDEX` and the neutral match profile (`MATCH_*`). What the shared packages read (`DATABASE_URL`, `LLM_*`, `CLAUDE_CLI_*`, `CRAWLER_NOTE`, `BLOCKED_COUNTRIES`, `FETCH_*`, `FX_*`, …) is in the root `.env.example`.

## Running it from the repository root

The `go` field in [package.json](package.json) tells the root's `npm run go` how to run the lab: it is off unless `APP_JOBS_LAB` is on in the root `.env`; then `go:prepare` runs first, and `dev` and `worker` start next to newrole.it as `lab` and `lab-worker`, with the lab at http://127.0.0.1:43125. Without the flag, or without this folder, `npm run go` starts newrole.it alone.

On its own, from the repository root:

```bash
npm run go:prepare -w @newrole/jobs-lab
npm run dev -w @newrole/jobs-lab & npm run worker -w @newrole/jobs-lab
```

In a repository of its own, the lab's `package.json` would list `packages/*` as its workspaces and take newrole.it's packages above from newrole.it's repository; `scripts/root-env.js` then finds the workspace root in the app's own folder and reads the app's `.env` files alone.
