# Configuration

The jobs lab's commands and the variables only it and its engine (`@newrole/job-index`) read. Each variable is also in [.env.example](../.env.example). The lab reads its own `.env` files first, then the repository root's; the shell wins over both. Variables the shared packages read (`DATABASE_URL`, `LLM_*`, `CLAUDE_CLI_*`, `CRAWLER_NOTE`, `CAREER_DETAIL_LIMIT`, `BLOCKED_COUNTRIES`, `FETCH_*`, `NBP_RATES`, `FX_*_PLN`, …) are documented with newrole.it: the root `.env.example` and [newrole.it's configuration](../../resume-engine-optimization/docs/configuration.md).

## Running it

From the repository root, with `APP_JOBS_LAB="on"` in the root `.env`, `npm run go` prepares the lab and starts it next to newrole.it (the `go` field in [package.json](../package.json)). On its own:

| Command                                             | What it does                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run go:prepare -w @newrole/jobs-lab`           | The lab's database created if missing, its migrations, its Prisma client when the schema changed, the seed data. Safe to run again     |
| `npm run dev -w @newrole/jobs-lab`                  | The test bench on 127.0.0.1:43125                                                                                                      |
| `npm run worker -w @newrole/jobs-lab`               | The engine's worker on the lab's database: searches, watched companies, the seed catalog, the checked outside catalog, harvest imports |
| `npm run smoke -w @newrole/jobs-lab`                | A live read of real boards from the seed catalog, one per main platform ([README](../README.md))                                       |
| `npm run catalog -w @newrole/jobs-lab -- <command>` | The outside board catalog, on the lab's database: `import`, `discover`, `check`, `reconcile`, `guess "<company>"`, `status`. See below |
| `npm run harvest -w @newrole/jobs-lab`              | Reads the due board APIs and pushes them to a harvest branch, for a scheduled cloud agent. See below                                   |
| `npm run db:prepare -w @newrole/jobs-lab`           | Only creates the lab's database and applies its migrations                                                                             |
| `npm run test:db -w @newrole/jobs-lab`              | The same for the lab's test database, `<db>_lab_test`                                                                                  |

## Offers read in the cloud while this computer is off

The lab's worker reads boards only while it runs. A scheduled agent task in the cloud can read them in the meantime: it runs `npm run harvest -w @newrole/jobs-lab`, which reads the due board APIs with the worker's own adapters, schedule and 1-second pace per host, writes the offers to a branch ending in `newrole-harvest` (`harvest/manifest.json` plus one file per board, descriptions cut to the stored excerpt) and pushes it. It needs no database. Career sites, SuccessFactors and Workday are left to the local worker (`isCareerProvider` in `src/index/run.ts`), because their 200-pages-per-host daily cap lives in the local database.

While the worker runs, it checks the remote every 10 minutes (a `HARVEST_IMPORT` task, `HARVEST_CHECK_MS` in `src/queue.ts`) and writes each board's newest cloud read into the index through the same code as a local read, when it is newer than the local one and its file matches the hash in the manifest. Each look is a `HarvestImport` row; the newest 50 are kept.

```bash
npm run harvest -w @newrole/jobs-lab -- --agent claude --every 120   # what the agent's prompt runs
npm run harvest -w @newrole/jobs-lab -- --hosts                      # hosts to allow in the agent's network settings
npm run harvest -w @newrole/jobs-lab -- --dry-run --minutes 2        # read and report, commit nothing
```

Use it with a private repository only: the branch holds the offer index.

What the providers' docs said on 2 November 2026 (as recorded in newrole.it's configuration page then, not checked again here): Claude Code cloud scheduled tasks run with the laptop closed, at most hourly, and their default Trusted network blocks the ATS hosts until they are added under Custom ([scheduled tasks](https://code.claude.com/docs/en/routines), [cloud environments](https://code.claude.com/docs/en/cloud-environments)). Cursor Automations run in a cloud VM on a preset or cron schedule and can open pull requests; the page does not say whether they push to a branch directly ([automations](https://cursor.com/docs/cloud-agent/automations)). Codex scheduled tasks in the app need the computer on and the app running ([scheduled tasks](https://learn.chatgpt.com/docs/automations?surface=app)).

## The outside board catalog

`npm run catalog -w @newrole/jobs-lab -- import` reads freehire's MIT-licensed board list (company, ATS platform, board id; [sources/freehire-boards-NOTICE.md](../packages/job-index/sources/freehire-boards-NOTICE.md)) as candidates, Workday included. `npm run catalog -w @newrole/jobs-lab -- discover [--crawl CC-MAIN-2026-43]` adds the boards found in Common Crawl's URL index ([sources/commoncrawl-NOTICE.md](../packages/job-index/sources/commoncrawl-NOTICE.md)): it reads only archived addresses, from the index files on data.commoncrawl.org, a block at a time. Nothing is crawled at either step. `npm run catalog -w @newrole/jobs-lab -- check` then reads each candidate's board on its own platform and keeps it only when:

- the board exists and lists jobs;
- it is the company the list names, or the platform's own name fits the board id (Greenhouse, Workable, Recruitee, Teamtailor, Breezy and Pinpoint publish a name in their API; Ashby and Lever on the board page; Personio in `<subcompany>`; Workday as a posting's hiring organisation; BambooHR and Traffit publish none, so the name has to read as the board id);
- the name is a name and not an id echoed back ("12jlkfsk");
- at least one job is an IT role that says where it is, outside `BLOCKED_COUNTRIES`.

A board that passes is stored through the same gate as every other board and is read again on the daily crawl, which checks it again: a board that stops passing is turned off and its offers close. A board with no jobs, no IT jobs or no placed jobs is looked at weekly, and a check that ended in an error is tried again in six hours; one that is the wrong company, or not on the platform, is not read again (`nextCatalogCheck` in `src/catalog/run.ts`). SmartRecruiters is not imported: its posting API stays off while api.smartrecruiters.com's robots.txt disallows other crawlers.

`check` runs one lane for each platform on a shared API host or with a platform-wide limit (Greenhouse, Ashby, Lever, Workable, Recruitee) and `--lanes` lanes (default 6) for the other platforms, which host each company apart, all inside the 1-second-per-host pace. `reconcile` gives every open offer its countries and closes the ones the gate now refuses. `guess "<company>"` tries likely slugs on each platform and adds the ones that verify.

## Variables

| Variable                                 | Required | What it does                                                                                                                                                                                                                               |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JOBS_LAB_DATABASE_URL`                  | no       | The lab's database. Unset: `DATABASE_URL`'s database with `_lab` added. The lab refuses newrole.it's own database and its test database here                                                                                               |
| `JOBS_LAB_TEST_DATABASE_URL`             | no       | The lab's flow tests. Unset: `DATABASE_URL`'s database with `_lab_test` added                                                                                                                                                              |
| `JOBS_LAB_ORIGIN`                        | no       | A public origin the lab's routes accept besides loopback. Unset: 127.0.0.1 and localhost only                                                                                                                                              |
| `BRAVE_SEARCH_API_KEY`                   | no       | Primary discovery. Finds boards and listings the crawl missed, and a salary stated on another listing of the same role                                                                                                                     |
| `SERPER_API_KEY`                         | no       | Used only when Brave is missing or a Brave call fails                                                                                                                                                                                      |
| `WEB_SEARCH_PROVIDER`                    | no       | `claude` runs discovery web search through `claude -p` with only the WebSearch tool, when Brave and Serper keys are missing. `LLM_PROVIDER=claude-cli` turns it on too. `CLAUDE_SEARCH_DAILY_CAP` (default 40, `0` turns it off) limits it |
| `SCAN_SEED_LIMIT`                        | no       | Boards per scan. Default 40. `0` reads the full verified catalog                                                                                                                                                                           |
| `DISCOVERY_QUERY_LIMIT`                  | no       | `site:` queries per scan. Default 14. Polish boards and Workday are never queried                                                                                                                                                          |
| `OFFER_INDEX`                            | no       | `off` stops the engine crawling and writing. Gathering vacancies as a business for others is a regulated activity in Poland (Dz.U. 2025 poz. 620, art. 305 ust. 2 pkt 1 lit. c)                                                            |
| `MATCH_SALARY_FLOOR_PLN`                 | no       | Monthly floor of the neutral search profile, in PLN. Default 1, so an undisclosed salary stays neutral and any disclosed one clears it                                                                                                     |
| `MATCH_ACCEPTED_CONTRACTS`               | no       | Comma-separated `b2b`, `uop`, `uz`, `uod`, `employment_foreign`, `unknown`. Unset: all of them                                                                                                                                             |
| `MATCH_HOME_COUNTRY` / `MATCH_HOME_CITY` | no       | The country a search uses when it names none (default `PL`) and its home city (default Warsaw for PL)                                                                                                                                      |
| `MATCH_HYBRID_CITIES`                    | no       | Cities that count for hybrid and on-site in the home country. Default for PL: Warsaw, Kraków, Wrocław, Gdańsk, Poznań, Łódź, Katowice                                                                                                      |
| `MATCH_RELOCATION_OK`                    | no       | `false` turns relocation off in the neutral profile. Default on                                                                                                                                                                            |
| `HARVEST`                                | no       | `off` stops the worker from checking the harvest branches a cloud agent pushes. Default on                                                                                                                                                 |
| `HARVEST_REMOTE`                         | no       | The git remote the worker checks for harvest branches. Default `origin`                                                                                                                                                                    |
