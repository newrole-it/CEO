# Jobscanner – Verified Source Pack (v1)

- **For:** one person's own job search
- **Checked:** 2026-10-10 (Europe/Warsaw). Every endpoint below was called live from the box with curl/python on that date; docs were fetched the same day.
- **Convention:** **UNVERIFIED** = could not confirm from an official source or a live call; the reason is given.
- **Companion files:** `seed-companies.json` (seed boards) · `scripts/candidates.py` (input list) · `scripts/verify_slugs.py` (probe) · `scripts/build_seed.py` (pick + identity check) · `scripts/add_region_stats.py` (PL/remote counts) · `scripts/raw_probe.json` (raw probe output)

---

## 1. ATS public job-board endpoints

All five are **read-only, unauthenticated GETs** for published jobs. That makes the "seed list + ATS API" core of the MVP straightforward, and it avoids scraping.

### 1.1 Greenhouse – Job Board API
- **Docs:** https://developers.greenhouse.io/job-board.html (checked 2026-10-10)
- **Auth:** none for GET. Quote: *"Job Board data is publicly available, so authentication is not required for any GET endpoints."* Only the application POST needs Basic Auth.
- **Endpoints**
  - `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs`, with optional `?content=true` (adds description HTML, departments, offices)
  - `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}`, with optional `?questions=true` and `?pay_transparency=true` (adds `pay_input_ranges`)
  - `GET .../boards/{board_token}` (board name; we use it for the identity check), `.../offices`, `.../departments` (`render_as=list|tree`), `.../sections`
  - JSONP: `?callback=`
- **Live test:** `boards/gitlab/jobs` → 200, `meta.total=221`. Job keys: `id, internal_job_id, title, location.name, absolute_url, updated_at, first_published, requisition_id, language, metadata, company_name` (with content=true, also `content, departments, offices, data_compliance`). `absolute_url` now points to `job-boards.greenhouse.io/{token}/jobs/{id}`.
- **Pagination:** none. The whole board comes back in one response (Databricks = 892 jobs in one call).
- **Rate limits:** **UNVERIFIED.** The Job Board API docs give no limit. Use polite pacing (≤ 2–4 req/s, cache by `updated_at`).
- **Terms:** **UNVERIFIED.** The doc page has no third-party-use clause. The API is public and meant for building job boards. Keep usage personal and non-redistributive.
- **Gotcha:** an unknown token returns 404 `{"status":404,"error":"Job not found"}`. A valid token can still belong to a *different* company (examples: `remote` = "General Assembly Remote Jobs", `wise` = "Wise Worksite Field Sales", `relativity` = Relativity Space). Always check `GET /v1/boards/{token}` → `name`.

### 1.2 Lever – Postings API
- **Docs:** https://github.com/lever/postings-api (README fetched 2026-10-10)
- **Auth:** none for GET. Apply POST needs `?key=`.
- **Endpoints:** `GET https://api.lever.co/v0/postings/{site}?mode=json` (EU instance: `https://api.eu.lever.co/v0/postings/{site}`), and `GET .../postings/{site}/{posting_id}`
  - Params: `mode=json|html|iframe`, `skip`, `limit`, `location`, `commitment`, `team`, `department`, `level` (repeatable, OR'ed, case-sensitive when repeated), `group=location|commitment|team`
- **Live test:** `postings/palantir?mode=json` → 200 (≈6 MB, full list). Keys: `id, text (title), categories{location, allLocations, team, commitment, department}, workplaceType, country, hostedUrl, applyUrl, createdAt (epoch ms), descriptionPlain, lists, additionalPlain, opening`. `salaryRange{currency,interval,min,max}` is documented as optional.
- **Rate limits:** documented only for application POSTs: *"more than 2 application POST requests per second"* → 429. GET limits are **UNVERIFIED**.
- **Terms note (from the docs):** *"Note that all job postings in the `published` state are publicly viewable. These jobs may be scraped by third parties."* Also: *"The API does not … Let you do full-text searches over open jobs"* and *"Support cross-origin HTTP requests from sites outside of your company's domains"*, so call it server-side.
- **Gotcha:** an unknown site returns 404 `{"ok":false,"error":"Document not found"}`. Our probes also hit the EU host, but none of our seed companies live only on EU.

### 1.3 Ashby – Public Job Posting API
- **Docs:** https://developers.ashbyhq.com/docs/public-job-posting-api (checked 2026-10-10)
- **Auth:** none.
- **Endpoint:** `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation=true`
- **Live test:** `job-board/ramp?includeCompensation=true` → 200. Top level `{apiVersion:"1", jobs:[…]}`. Job keys: `id, title, location, secondaryLocations[], department, team, isListed, isRemote, workplaceType (OnSite|Remote|Hybrid), employmentType, publishedAt, jobUrl, applyUrl, address.postalAddress, descriptionHtml, descriptionPlain, compensation{compensationTierSummary, scrapeableCompensationSalarySummary, compensationTiers[], summaryComponents[]}, shouldDisplayCompensationOnJobPostings`.
- **Pagination:** none (full board).
- **Rate limits / terms:** **UNVERIFIED.** Neither is stated on the doc page. The doc frames the API as "If you host your own careers page, you can use this data…".
- **Gotchas:** (a) the response has no company name, so identity has to be inferred from descriptions; (b) `isRemote` is often `true` on hybrid roles, so use `workplaceType` instead; (c) generic slugs often belong to unrelated companies (`ramp` = Ramp US fintech, not Ramp Network; `kiwi` = LatAm company; `lunar` = stealth health-tech; `neon` = game-payments company).

### 1.4 Workable – public account / widget endpoint
- **Official doc:** Workable Help, "Using the Workable API to create a careers page", https://help.workable.com/hc/en-us/articles/115012771647. It lists these "public endpoints":
  - `GET https://www.workable.com/api/accounts/{subdomain}?details=true`
  - `GET https://www.workable.com/api/accounts/{subdomain}/locations`
  - `GET https://www.workable.com/api/accounts/{subdomain}/departments`
- **Live behaviour (2026-10-10):** `www.workable.com/api/accounts/{sub}?details=true` → **302 → `https://apply.workable.com/api/v1/widget/accounts/{sub}?details=true`** → 200. Use the apply.workable.com URL directly.
- **Auth:** none. (The SPI v3 API at `{sub}.workable.com/spi/v3/...` needs a token and is meant for account owners.)
- **Live test:** `widget/accounts/netguru?details=true` → 200, `{name:"Netguru", description, jobs:[33]}`. Job keys: `title, shortcode, code, url, shortlink, application_url, city, state, country, locations[{country,countryCode,city,region,hidden}], telecommuting, department, function, industry, experience, education, employment_type, published_on, created_at, description` (description only with `details=true`).
- **Rate limits:** **UNVERIFIED.** Not in the official doc. A third-party aggregator (jobspipe.dev) says it is "rate-limited per IP". Pace ≤ 1 req/s.
- **Terms:** **UNVERIFIED.** No clause found for third-party use.
- **Gotcha (big):** non-existent accounts return 404, but **many dormant or squatted accounts return 200 with `jobs: []`**. 84 of our Workable probes were like this, plus some with mismatched names ("Workable", "James Reynolds", "The Scalable Company"). Treat `jobs:[]` as unproven.

### 1.5 SmartRecruiters – Posting API
- **Docs:** https://developers.smartrecruiters.com/docs/posting-api and OpenAPI https://developers.smartrecruiters.com/reference/v1listpostings.md (checked 2026-10-10)
- **Auth:** the OpenAPI security list includes `{}` (none), so public postings need no auth. A key or OAuth (`internal_postings_read`) is *"only required when the destination query parameter is INTERNAL or INTERNAL_OR_PUBLIC"*.
- **Endpoints:** `GET https://api.smartrecruiters.com/v1/companies/{companyIdentifier}/postings` and `.../postings/{postingId}` (plus `/departments`)
  - Params: `q` (full-text on title/location), `limit` (max 100), `offset`, `destination`, `locationType=REMOTE|ONSITE…`, `country` (ISO-2, e.g. `pl`), `region`, `city`, `department`, `jobAdId`, `language`, `releasedAfter`, `customField`, header `accept-language`
- **Live test:** `companies/CDPROJEKTRED/postings?country=pl&limit=1` → 200, `totalFound=36`. Item keys: `id, uuid, name (title), refNumber, company{identifier,name}, releasedDate, location{city,region,country,remote,hybrid,fullLocation}, department, function, experienceLevel, typeOfEmployment, industry, customField[], ref (detail URL), visibility`.
- **Rate limits:** the general SmartAPI page (https://developers.smartrecruiters.com/docs/rate-limiting) says *"For most endpoints, SmartAPIs allow up to 10 requests per second"* and 8 concurrent, counted per credential. Whether that applies to *unauthenticated* posting calls is **UNVERIFIED**; the public responses we saw carried no `X-RateLimit-*` headers.
- **Gotcha (big):** **any identifier returns 200** `{"totalFound":0,"content":[]}`, even made-up ones (Visa, Equinix, Ocado tested). Only `totalFound>0` plus a matching `company.name` proves the slug.
- **Bonus:** it is the only ATS here with **server-side `country=pl` and `locationType=REMOTE` filters**. Use them.

### 1.6 JSON-LD (schema.org/JobPosting) fallback – what we observed
- `jobs.lever.co/{site}/{id}` → contains `<script type="application/ld+json">` with `"@type":"JobPosting"` (verified on a Spotify posting).
- `jobs.smartrecruiters.com/{company}/{id}` → the page contains `JobPosting` markup.
- `job-boards.greenhouse.io` job page → no `ld+json` script block in the raw HTML (a "JobPosting" string does appear elsewhere in the page).
- `jobs.ashbyhq.com` and `apply.workable.com` job pages are client-rendered: the raw HTML has no JSON-LD.
- **Implication:** use the APIs for all five ATS. Keep the JSON-LD parser for **company career pages** (custom/Workday/Teamtailor/Recruitee etc.) found through discovery, and respect each site's robots.txt and terms.

### 1.7 Normalisation map (for the MVP)

| field | Greenhouse | Lever | Ashby | Workable | SmartRecruiters |
|---|---|---|---|---|---|
| id | `id` | `id` | `id` | `shortcode` | `id` |
| title | `title` | `text` | `title` | `title` | `name` |
| location | `location.name` (+`offices[]`) | `categories.allLocations[]` | `location` + `secondaryLocations[].location` | `locations[]`, `city/country` | `location.fullLocation` |
| remote | text in location | `workplaceType` | `workplaceType` (prefer over `isRemote`) | `telecommuting` | `location.remote/hybrid` |
| url | `absolute_url` | `hostedUrl` | `jobUrl` | `url` | `https://jobs.smartrecruiters.com/{co}/{id}` (UNVERIFIED pattern; `ref` gives the API URL) |
| posted | `first_published` / `updated_at` | `createdAt` (ms) | `publishedAt` | `published_on` | `releasedDate` |
| pay | detail `?pay_transparency=true` | `salaryRange` (optional) | `compensation` (`includeCompensation=true`) | – | – |

Dedupe key suggestion: `normalize(company) + normalize(title) + primary_city`, then cross-ATS dedupe via URL canonicalisation.

---

## 2. Discovery search APIs (prices checked 2026-10-10)

| API | Price / 1k queries | Free tier | `site:` operator | Freshness filter | Storing results (ToS) | Status |
|---|---|---|---|---|---|---|
| **Brave Search API** (own index) | **$5 / 1k** (Search plan, 50 rps) | **$5 free credits every month** (≈1,000 queries); card required (anti-fraud) | **Yes**, documented incl. subdomains | **Yes**, `freshness=pd/pw/pm/py` or a date range | **Restricted:** ToS says the customer shall not *"store, cache, or create a database of Search Results … other than transient storage required for operation"*. Storage rights need a special plan (FAQ) | Active |
| **Serper** (Google SERP) | $1.00 (50k for $50) → $0.75 (500k/$375) → $0.50 (2.5M/$1,250) → $0.30 (12.5M/$3,750); credits valid 6 months | **2,500 free queries** | Yes (it is Google; passes through the query) | UNVERIFIED (Google `tbs=qdr:*` passthrough not confirmed in docs) | UNVERIFIED (https://serper.dev/terms had no extractable text) | Active |
| **Tavily** | $0.008/credit PAYG (= **$8/1k basic**, $16/1k advanced); plans $30/4k … $500/100k ($5/1k) | **1,000 credits/month**, no card | Has `include_domains` / `exclude_domains` params (better than `site:`) | `time_range`, `start_date`/`end_date` | UNVERIFIED (no explicit storage clause found) | Active |
| **Exa** | Search `instant` **$4/1k**, `fast/auto` $7/1k (≤10 results), +$1/1k extra results | **$10 credits/month** (up to 2,500 instant searches), no card | `includeDomains` param | `startPublishedDate`, `startCrawlDate`; `category` enum includes `company` | UNVERIFIED | Active |
| **SerpAPI** (Google etc.) | Starter $25/1k-mo (= $25/1k) … Searcher $725/100k ($7.25/1k) … Cloud 1M $3.75/1k | **250 searches/month** | Yes (Google passthrough) | Yes (Google `tbs`), UNVERIFIED in docs | UNVERIFIED; "ZeroTrace" mode only on Cloud plans | Active |
| **Google Custom Search JSON API** | $5/1k (existing customers only), 100/day free | – | Yes | Yes | – | **Closed to new customers.** *"Existing Custom Search JSON API customers have until January 1, 2027 to transition"* (developers.google.com/custom-search/v1/overview). **Not usable.** |
| **Bing Search APIs** | – | – | – | – | – | **Retired 2025-08-11.** *"Any existing instances of Bing Search APIs will be decommissioned completely"* (learn.microsoft.com lifecycle). Replacement is "Grounding with Bing Search" in Azure AI Agents only. **Not usable.** |

Sources: brave.com/search/api · api-dashboard.search.brave.com/documentation/pricing · …/resources/search-operators · …/services/web-search · …/resources/terms-of-service · serper.dev · docs.tavily.com/documentation/api-credits · docs.tavily.com/documentation/api-reference/endpoint/search · exa.ai/pricing · exa.ai/docs/exa-spec.yaml · serpapi.com/pricing · developers.google.com/custom-search/v1/overview · learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement

**Not tested live:** we have no API keys for Brave, Serper, Tavily, Exa or SerpAPI, so their result quality is **UNVERIFIED** here. Template quality (§5) was tested with the agent's built-in web search.

### Recommendation for the MVP
1. **Primary: Brave Search API.** It has an independent index, documented `site:` and `freshness`, costs $5/1k, and the $5 monthly credit covers about 1,000 discovery queries. At about 30 queries per run, that is roughly a daily personal run for free.
2. **Fallback / recall booster: Serper.** Google coverage is better for long-tail ATS pages, at $0.30–$1.00 per 1k. The 2,500 free queries are a one-off grant.
3. **ToS-driven design:** use search results only transiently to **extract ATS slugs and URLs**. Store the derived *board slug* and fetch the job data from the ATS API (the data of record). Do not persist SERP payloads (Brave ToS).
4. Skip Google CSE (closed) and Bing (retired). Tavily and Exa are optional semantic layers, useful for "companies like X hiring EMs in Warsaw" style queries, but cost more per call.

---

## 3. Polish job boards – permitted interfaces

**Verdict: none of the five offers a documented public API for job seekers or third parties. Every board whose terms we could read forbids automated or systematic downloading of its listings (justjoin.it, nofluffjobs, pracuj.pl and theprotocol.it). Bulldogjob's terms could not be retrieved (UNVERIFIED). Robots.txt allows crawling of listing pages on most of them, but robots.txt is not a licence: the ToS clauses govern. Recommendation: do NOT crawl them or call their internal APIs. Use them only via (a) web-search results that link out (we see title and snippet from the search provider, then the user opens the link), and (b) manual browsing and email alerts. Most companies posting there also publish on their own ATS, which we cover via APIs.**

| Board | Public API? | robots.txt (fetched 2026-10-10) | Sitemaps | ToS on automated access | Verdict |
|---|---|---|---|---|---|
| **justjoin.it** | None documented. `/api/` is disallowed. (A former public `/api/offers` existed historically; current status UNVERIFIED) | `Disallow: /api/`, `Disallow: /oferty-pracy/*,*`, `/devs`, `/admin/` … | `Sitemap: https://justjoin.it/sitemaps/active-jobs.xml` (+ categories, locations, top-companies) | Users ToS (PDF dated 14.07.2026, https://s3.eu-west-1.amazonaws.com/public.justjoin.com/regulations/jjit-users-terms-of-service/jjit__regulamin_uzytkownika_justjoinit_14072026): **§11.2** *"Osoby trzecie nie są uprawnione do kopiowania, modyfikowania, reprodukcji, dystrybucji lub pobierania w całości lub części Serwisu."* **§11.3** *"…Zakazane jest w szczególności automatyczne pobieranie przez kogokolwiek bez wyraźnej pisemnej zgody Usługodawcy danych zawartych w Serwisie."* §1.2: content is a protected database (Act of 27 July 2001) | **Not permitted** without written consent |
| **nofluffjobs.com** | None public. `/api/` disallowed | `Disallow: /api/`, `/posting/`, `/pl/posting/` (and other locales), `*/job/job/*` | none listed in robots | T&C "Version of 15.09.2025" (https://nofluffjobs.com/static/No_Fluff_Jobs_Terms_and_Conditions.pdf): **§1.7** content is *"a database of job advertisements … subject to protection under the Act of 27 July 2001 on database protection."* **§2.8** *"…it is prohibited to download or re-use any part of the database provided by the Job Board for any purpose."* **§2.9** *"Repeated or systematic downloading or re-publishing … of data … in particular individual job advertisements, is prohibited."* | **Not permitted** |
| **pracuj.pl** (Grupa Pracuj) | None public | Only static and account paths disallowed (`/konto/`, `/_scripts/` …); listings allowed for crawlers | `SiteMaps/CurrentOffers/SiteMapIndexJobOffers.xml` + SearchedOffers indexes | ToS PDF linked from grupapracuj.pl ("obowiązuje od dnia 28 lutego 2023 r.", https://grupapracuj.pl/file/03f63032-f19b-4db7-9aca-2fbba0c5ff8e) **§ users must refrain from:** *"d. kopiowania, modyfikowania, rozpowszechniania, transmitowania lub wykorzystywania w inny sposób jakichkolwiek utworów i baz danych udostępnianych w Serwisach, za wyjątkiem korzystania z nich w ramach dozwolonego użytku"*; *"e. podejmowania jakichkolwiek działań, które mogą utrudnić lub zakłócić funkcjonowanie Serwisów…"*. Whether this is the latest version is **UNVERIFIED** (the HTML ToS page is JS-rendered) | **Not permitted** beyond "dozwolony użytek" (fair use) |
| **theprotocol.it** (Grupa Pracuj) | None public | `Disallow: /_next/` only | `sitemap_index.xml`, `sitemaps/CurrentOffers/sitemap_index.xml` | ToS "wchodzi w życie z dniem 30 marca 2026" (https://static.theprotocol.it/statics/_files/Regulamin_swiadczenia_uslug_marzec_2026.pdf): database rights belong to the provider; prohibited: *"d) kopiowanie, modyfikowanie, rozpowszechnianie, transmitowanie lub wykorzystywanie w inny sposób jakichkolwiek utworów i baz danych udostępnianych w Serwisie, za wyjątkiem korzystania z nich w ramach dozwolonego użytku"*; account termination for *"kopiowania, rozpowszechniania lub powielania w jakikolwiek sposób Serwisu"* | **Not permitted** |
| **bulldogjob.pl** | None found | `Disallow: /feeds` (a feeds path exists; `/feeds` itself returned 404), `/auth`, `/account`, `/withSalary,true`, `/salaryBrackets` … | `sitemap.xml.gz` | **UNVERIFIED.** https://bulldogjob.pl/terms is client-rendered and no text could be extracted (no PDF link found) | Treat as **not permitted** until the ToS is read manually |

Legal context: the Polish *Ustawa o ochronie baz danych*, Art. 8 ust. 2 (consolidated text Dz.U. 2024 poz. 1769), prohibits *"powtarzające się i systematyczne pobieranie lub wtórne wykorzystanie sprzeczne z normalnym korzystaniem"*. Art. 8a allows TDM *"chyba że uprawniony zastrzegł inaczej"*, and these ToS clauses read as such a reservation. This is not legal advice.

---

## 4. Seed list summary (`seed-companies.json`)

**Method:** 300+ candidate companies and ~340 slug guesses were probed against all five ATS APIs (Lever global and EU) on 2026-10-10. For each company we kept the board with the most open jobs. `verified:true` means HTTP 200 + valid JSON + ≥1 open job. Identity was checked by board name (Greenhouse, Workable, SmartRecruiters) or by the company name appearing in the job descriptions (Ashby, Lever), with manual review of ambiguous ones.

| ATS | verified (in `companies`) | flagged / not used (`flagged_not_used`) | companies with PL-located jobs | with PL or EU-remote eng-leadership role now |
|---|---|---|---|---|
| Greenhouse | **85** | 7 (5 wrong company, 2 empty) | 24 | 12 |
| Ashby | **69** | 9 (5 wrong company, 4 empty) | 18 | 16 |
| Lever | **18** | 4 (1 wrong company, 3 empty) | 4 | 3 |
| SmartRecruiters | **9** | 0 (zero-result identifiers are never listed; SR returns 200 for anything) | 4 | 1 |
| Workable | **8** | 84 (mostly 200 + `jobs:[]` dormant/squatted accounts; 5 wrong names) | 6 | 4 |
| **Total** | **189 verified** (≈22.7k open jobs) | **104 flagged** | **56** | **36** (16 with a Poland-located leadership role, 24 with an EU-remote one; some have both) |

- `hq_or_relevant_locations` is a hand-written hint (UNVERIFIED); use `pl_located_jobs_at_check` as evidence.
- 188/189 have `identity_confirmed:true`. The remaining one (Jobandtalent on Lever) is marked for review.
- **Poland-located leadership roles found at check:** Addepar (Warsaw), Asana (Warsaw), Auctane (Wrocław), Box (Wrocław), GitLab (Remote, Poland), HelloFresh (Warsaw), Moniepoint (Remote, Poland), Keyrock, Kraken, Moss (Berlin/Warsaw/Munich), Redpanda Data (Warsaw), CD PROJEKT RED (Warsaw), Booksy, Flosum, Netguru (Fractional CTO), XTM (Poznań).
- **Companies with the most Poland-located jobs:** Bosch (47), Kraken (38), CD PROJEKT RED (36), Netguru (33), HelloFresh (27), ElevenLabs (26), Box (25), Elastic (21), Hostinger (20), Moniepoint (19), Flosum (17), Docplanner (17), Delivery Hero (17), Asana (16).
- **Wrong-company slugs, kept as warnings:** greenhouse `wise`, `remote`, `relativity`, `cleo`, `traderepublic`; ashby `ramp`, `kiwi`, `flink`, `lunar`, `neon`; lever `neon`; workable `1password`, `scalable`, `11bitstudios`, `1komma5`, `1komma5grad`.
- **Polish companies not found on these five ATS** (they likely use their own pages or other ATS such as Teamtailor/Recruitee/eRecruiter/Traffit; not probed): Allegro (SR shows only 1 job), Brainly (Ashby, 1 job), Revolut, Spacelift, Synerise, Packhelp, Infermedica, UXPin, STX Next, 10Clouds, Software Mansion, Miquido, Spyrosoft, Tidio, Nomagic, Nethone, Ramp Network, Survicate, Saleor, Alokai, Techland, Huuuge, Ten Square Games. **Next step:** add Teamtailor (`{co}.teamtailor.com/jobs.json`?), Recruitee (`{co}.recruitee.com/api/offers/`), Personio (`{co}.jobs.personio.de/xml`) and Workday probes. Those endpoints are **UNVERIFIED** and were not tested in this pack.
- **Heuristic caveats:** leadership regex = EM / Manager, Engineering / Head of (Eng|Software|Platform|Data|Infra|Tech) / Director…Engineering / VP Eng / CTO / Kierownik / Dyrektor. "EU-remote" requires a remote marker plus a European country/city/"EMEA/Europe/Global" in the location string. Ashby's `isRemote` is loose (e.g. "Milan remote"). SmartRecruiters counts use server-side `country=pl` and `locationType=REMOTE`. Re-run before relying on the flags: `cd scripts && python3 verify_slugs.py && python3 build_seed.py && python3 add_region_stats.py`.

---

## 5. Search-query templates (tested 2026-10-10 with the agent's web search, not Brave or Serper)

Host notes: Greenhouse job pages now live on **`job-boards.greenhouse.io`** (older `boards.greenhouse.io` URLs redirect), so query both. Ashby uses `jobs.ashbyhq.com`. Lever uses `jobs.lever.co` and `jobs.eu.lever.co`. Workable uses `apply.workable.com`. SmartRecruiters uses `jobs.smartrecruiters.com`.

| # | Template | Hit quality at test |
|---|---|---|
| T1 | `site:job-boards.greenhouse.io "Engineering Manager" (Poland OR Warsaw OR Remote)` | **High.** 5/5 relevant EM roles: GitLab (Remote, Poland), Affirm, Testlio EMEA ×2, Addepar (Warsaw). 4 new slugs found, all API-verified afterwards |
| T2 | `site:jobs.ashbyhq.com "Head of Engineering" (Poland OR Warsaw OR Kraków OR "Remote Europe")` | **High.** Redpanda (Warsaw), Abusix (Remote EU/UK), Keyrock (Warsaw/Kraków eligible), WunderGraph; 1 recruiter-agency board (noise) |
| T3 | `site:jobs.lever.co "Director of Engineering" (Poland OR EMEA OR Europe remote)` | **Medium.** Spotify EMEA / Stockholm-London, Zopa (London), some US/remote-unspecified; none PL-specific |
| T4 | `site:apply.workable.com "Engineering Manager" Poland` | **High.** Flosum (Poland), XTM (Poznań), CloudLinux (remote/Warsaw), Booksy. Note Workable often returns `apply.workable.com/j/{shortcode}` URLs without a slug, so resolve the slug by fetching the page |
| T5 | `"Kierownik zespołu" programistów OR "Engineering Manager" Kraków oferta pracy` | **Low for ATS discovery.** Returns justjoin.it and LinkedIn listings and profiles. Good for awareness, but those sources are not machine-ingestable (see §3) |

Recommended template set (untested ones are marked):
```
# ATS discovery (role × geo × host)
site:job-boards.greenhouse.io OR site:boards.greenhouse.io "{ROLE}" ({GEO})
site:jobs.ashbyhq.com "{ROLE}" ({GEO})
site:jobs.lever.co OR site:jobs.eu.lever.co "{ROLE}" ({GEO})
site:apply.workable.com "{ROLE}" ({GEO})
site:jobs.smartrecruiters.com "{ROLE}" ({GEO})                      # UNVERIFIED (not tested)
# ROLE expansions (LLM step): "Engineering Manager" | "Senior Engineering Manager" | "Head of Engineering" |
#   "Director of Engineering" | "VP Engineering" | "VP of Engineering" | "CTO" | "Head of Platform" |
#   "Engineering Lead" | "Kierownik zespołu" | "Kierownik działu IT" | "Dyrektor ds. technologii" | "Szef zespołu"
# GEO: Poland OR Polska OR Warsaw OR Warszawa OR Kraków OR Krakow OR Wrocław OR Wroclaw OR Gdańsk OR Poznań OR "Remote Europe" OR EMEA OR "Remote - EU"
# Company-career-page discovery (JSON-LD fallback)                   # UNVERIFIED (not tested)
"{ROLE}" Warszawa "praca zdalna" -site:linkedin.com -site:justjoin.it -site:nofluffjobs.com -site:pracuj.pl
"{ROLE}" (Poland OR Remote) inurl:careers OR inurl:jobs -site:linkedin.com
```
Pipeline tip: from each hit, extract `{ats, slug}` with regexes (`job-boards\.greenhouse\.io/([^/]+)`, `jobs\.ashbyhq\.com/([^/]+)`, `jobs\.(eu\.)?lever\.co/([^/]+)`, `apply\.workable\.com/([^/j][^/]*)`, `jobs\.smartrecruiters\.com/([^/]+)`). Verify through the API (rules in §1), then add new slugs to the seed list. On 2026-10-10 this loop turned 11 search hits into **11 verified new boards** (Testlio, Affirm, Addepar, Redpanda Data, Abusix, Keyrock, WunderGraph, Flosum, XTM, CloudLinux, Auctane).

---

## 6. Anything else the builder should know
- Full-board responses can be large (Palantir on Lever ≈ 6 MB, Ramp on Ashby ≈ 3 MB). Fetch without `content=true` / `details=true` first, filter titles, then fetch details only for matches.
- SmartRecruiters `limit` max is 100, so paginate with `offset` (Bosch alone has 4,933 postings). Always pass `country=pl` and/or `locationType=REMOTE`.
- Identify the client honestly with a User-Agent. Some Lever responses returned 403 to a bare `Python-urllib` UA; setting a UA fixed it.
- Polish-market feeds (Traffit, Recruitee, Teamtailor, Personio, Pinpoint, Lever EU, and the Workday link-out list) are in `source-pack-pl.md` and `config/seed-companies-pl.json`.
