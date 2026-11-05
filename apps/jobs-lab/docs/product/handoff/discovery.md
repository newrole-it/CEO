# Discovery: handoff notes

> Written before the engine left newrole.it: paths such as `src/server/…` and `db/schema.prisma` are newrole.it's of that time. The engine's code is now in [packages/job-index](../../../packages/job-index/README.md), its tables in [packages/db/schema.prisma](../../../packages/db/schema.prisma).

Changes the Discovery agent needs in files it does not own, plus operational notes. Path, what, why.

## Must do before the feature is live

1. **Restart the worker** (`npm run worker`). Watched companies add a new task type, `INDEX_WATCHED`. A worker started before this change does not know it: it fails each such task twice ("Unknown task type") and then marks it DEAD. The new worker also indexes watched companies before the seed queue and runs the hidden-offer hunt and the similar-company expansion.

## Schema (`db/schema.prisma`, owner)

2. **`SourceType` value for MCP-supplied offers**, e.g. `MCP`. `ingestOfferPayload` stores these as `WEB_SEARCH` for now and marks them with `sourceBoardId = "mcp:<host>:<company>"`. With the new value, change one line in `payloadToJob` (`src/server/discovery/ingest-offer.ts`). Also add the value to `APP_TO_SOURCE` in `src/server/index/store.ts` (→ `"company_site"`).
3. **"New since last visit"**: `listWatched(userId, { since })` counts offers with `firstSeenAt > since`, but nothing stores the visit yet. Suggest `User.companiesSeenAt DateTime?`, or `WatchedCompany.lastViewedAt DateTime?` for per-row badges. The UI can keep it in `localStorage` until then.

## `src/server/search/pipeline.ts` (owner/integration)

4. When `searchProvider().provider === "claude"`, cap discovery queries per search run at about 3 (`pickDiscoveryQueries(sites, Math.min(3, discoveryQueryLimit()))`). Each `claude -p` WebSearch call takes 15–60 s. The daily cap (`CLAUDE_SEARCH_DAILY_CAP`, default 40) protects the subscription but not the run's latency.
5. The log line "No Brave or Serper key is set" should now read "No web search provider (Brave, Serper, or Claude) is configured".

## `src/server/adapters/career-site.ts` (owner)

6. A generic `CAREER_SITE` target for any domain: robots → sitemap → job URLs → JSON-LD detail, with no `KNOWN` entry. Watched JSON-LD sites now use a small reader of their own (`refreshCareerSite` in `src/server/watchlist/index-watched.ts`, provider `GENERIC_HTML`, board id `site:<host>`). That reader reads the careers listing plus up to 25 job pages per run, inside the 200/day host cap. With a generic target, these pages could move to the shared sitemap path.
7. An HTML job-page fallback (title, location, and salary from the page, with no JSON-LD). Example: Momentum (themomentum.ai, formerly Applover) lists offers with salaries in plain HTML. Its Traffit feeds (`applover`, `momentum`) are empty, so it resolves to link-only today.

## `src/server/adapters/traffit.ts` (owner)

8. Salary is only in the title ("[110-130 PLN/h + VAT B2B]") and is not parsed. `locationText` is mostly empty. Seen on Deviniti during the smoke test.
9. `identityKey` comes out as `company_site:<id>` (for example `company_site:1537`). Check whether Traffit ids are global or per tenant. If per tenant, scope the key with the board id so two tenants cannot collide.

## `.env.example` / README (Claude/MCP agent)

10. Document `WEB_SEARCH_PROVIDER=claude` (forces Claude search without `LLM_PROVIDER=claude-cli`) and `CLAUDE_SEARCH_DAILY_CAP` (default 40; set it to 0 to turn Claude search off).
11. README "Sources": watched companies follow the same crawl rules (policy, robots.txt, 5 s per host, 200 detail pages per host per day, no aggregators or LinkedIn). The resolver reads at most 8 pages per company.

## MCP tools (Claude/MCP agent)

12. Suggested tool mapping:
    - `watch_company` → `watchCompany({ ..., source: "mcp" })`
    - `unwatch_company` → `unwatchCompany`
    - `list_watched` → `listWatched`
    - `add_offer_url` → `ingestOfferUrl({ channel: "mcp" })`
    - `add_offer` → `ingestOfferPayload`
    - `similar_companies` → `similarCompanyContext` (lets Claude propose employers, then call `watch_company`)
