# @newrole/job-index

The engine that finds new job offers on its own and keeps them: an index of offers read from employers' ATS boards and career sites through [@newrole/ats](../../../resume-engine-optimization/packages/ats/README.md). It used to run inside newrole.it; it is a package now so newrole.it can ship as a CV app, and the job search can be deployed on its own. [apps/jobs-lab](../../README.md) runs it for testing.

| Area | Modules |
|---|---|
| Index | `index/run` (read the next due board, `indexBoard`), `index/store` (save, identity, closing cycle), `index/schedule`, `index/reconcile`, `index/progress`, `index/status`, `index/query` |
| Watched companies | `watchlist/watch`, `watchlist/resolve` (a name or a URL to a board), `watchlist/index-watched` |
| Discovery | `discovery/*`: offers by URL or payload into the index, web search, Claude search, hidden-offer hunts, similar companies, offer-search sync |
| Catalog | `catalog/*`: outside board catalogs (Common Crawl, freehire), checked on their own platform first; `config/seed-boards` and `config/seed-companies*.json`, the seed catalog; `sources/`, where it came from and the legal notes behind it |
| Harvest | `harvest/*`: what a cloud agent reads while the computer is off, imported later |
| Search and ranking | `search/pipeline` (a live search a person starts), `matching/*`, `profile/*` (rank against a profile), `classify/*`, `jobs/*` (gate, intermediaries, offer facts) |
| Worker | `worker.ts`: claims only `RUN_SEARCH`, `INDEX_WATCHED` and `HARVEST_IMPORT` tasks (`queue.ts`), so it can share `BackgroundTask` with an app's own worker |
| Maintenance | `maintenance/identity-keys`, `seed` (`seedIndex`: the platforms and the seed catalog's career pages) |

**Storage.** The index lives in Postgres, in newrole.it's schema (`apps/resume-engine-optimization/db/schema.prisma`: `Company`, `CareerPage`, `Job`, `JobObservation`, `SearchRun`, `CatalogBoard`, `CrawlBudget`, `BackgroundTask`, …). The app that runs the engine binds a Prisma client once:

```ts
import { PrismaClient } from "@prisma/client"
import { configureAts } from "@newrole/ats/host"
import { configureJobIndex } from "@newrole/job-index/host"

configureAts({ http: myHttpClient }) // User-Agent, pace, the daily cap (see @newrole/ats)
configureJobIndex({ db: new PrismaClient(), llm: () => myLlmClient, heartbeat: async () => {} })
```

`llm` and `runClaudePrompt` default to `@newrole/llm` without a cache; `heartbeat` to nothing.

**Flags.** `OFFER_INDEX=off` stops crawling and writing (`offer-index.ts`): gathering vacancies as a business for others is a regulated activity in Poland (Dz.U. 2025 poz. 620, art. 305 ust. 2 pkt 1 lit. c).

Tests: `npm test -w @newrole/job-index` (unit), `npm run test:flow -w @newrole/job-index` (Postgres, the `_test` database).
