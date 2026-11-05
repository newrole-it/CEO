# @newrole/ats

Reading job offers from ATS boards and career sites, with no storage. newrole.it uses it to read one offer from its link; [@newrole/job-index](../job-index/README.md) uses it to crawl whole boards.

| Module | What it does |
|---|---|
| `adapters/registry` | `adapterFor(provider).list(boardId, http)` for every supported platform (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Teamtailor, Recruitee, Personio, Traffit, Pinpoint, BambooHR, Breezy, eRecruiter, Jobvite, Phenom, Avature, Workday, SuccessFactors, career sites and more), `hydrate` for a detail page |
| `adapters/career-site`, `crawler/*` | Career sites: sitemaps, listings, job feeds, language variants, the daily cap of detail pages |
| `read` | `readOfferUrl(url)`: one offer from its link (the ATS's API, else the page's JSON-LD JobPosting, else the page back to the caller); `readOfferSource(source)`: the whole text of a known offer; `pageText(html)` |
| `payload` | `payloadToJob`: an offer someone read themselves, validated and cleaned |
| `identity` | `identityFor`, `placeOf`, `countryFields`: the rules that make one posting one row in any store |
| `boards`, `careers-detect`, `company-pages` | Which ATS a link belongs to, the boards a careers page links to or embeds |
| `schemas`, `normalize`, `dedupe`, `countries`, `sources` | `ListedJob` and the source types, names, canonical URLs, an offer's countries |
| `host` | The port: `configureAts({ http, takeDetailSlot, detailFetchesRemaining, cachedCareerListing })` |

**Ports.** The package keeps no data. An app calls `configureAts` once: its HTTP client (User-Agent and per-host pace; `@newrole/offers/http` builds one), where the daily cap of 200 detail pages per host is counted, and, for an index, a career site's offers it read in full within a day. Left out, the HTTP client gets a generic NewRoleBot User-Agent and the cap is counted in memory. newrole.it's wiring: `apps/newrole/src/server/fetch/ats.ts`.

**Rules that travel with it.** Source policies and robots.txt come from `@newrole/offers`; LinkedIn and social sites are refused; Polish job boards and Workday links are link-only; a page that opts out of AI use is marked `llmOptOut`; personal data is stripped from offer text.

Tests: `npm test -w @newrole/ats` (fixtures, no network). Live: `npm run smoke -w @newrole/jobs-lab`.
