# Jobscanner

Personal job-offer scanner for one owner. Type a role in Polish or English. Jobscanner expands it into related titles, reads public ATS boards, and ranks what is open. Every result links to the original posting.

There is no billing, no multi-tenant workspace, and no email alerts. Signup is closed. One account is created by the seed.

## Run it

Docker Compose (Postgres, the web app, and a separate worker that restarts on failure):

```bash
cp .env.example .env
# SESSION_SECRET_KEY, OWNER_PASSWORD, and POSTGRES_PASSWORD are required.
# Compose publishes the site and Postgres on 127.0.0.1 only.
docker compose up --build
```

Open http://127.0.0.1:43123 and sign in with the owner account (`rafal@jobscanner.local` / `jobscanner-local`, unless you changed `OWNER_EMAIL` and `OWNER_PASSWORD`).

Without Docker, the same process is Postgres plus two processes:

```bash
cp .env.example .env
# create the role and database, then:
npm install
npm install --prefix matching
npm run setup
npm run dev:all
```

`dev:all` starts the site on 127.0.0.1:43123 and the Postgres-backed worker. A scan does nothing until the worker is running. `npm start` serves the production build on the same port.

The app works with no API keys. Query expansion falls back to checked examples (or a minimal expander), and scans read the verified seed boards.

## Environment

Copy `.env.example`. The values the owner actually has to provide:

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `SESSION_SECRET_KEY` | yes | Cookie signing key, at least 32 characters. Compose refuses to start without it |
| `OWNER_EMAIL` / `OWNER_PASSWORD` | yes for Compose and seed | The single account. Password at least 10 characters |
| `POSTGRES_PASSWORD` | yes for Compose | Database password. The port is published on 127.0.0.1 only |
| `LLM_API_KEY` | no | OpenAI-compatible key. Empty uses the deterministic expander and rule-based reasons |
| `LLM_BASE_URL` / `LLM_MODEL` | with the key | Defaults to OpenAI `gpt-4o-mini`. An xAI base URL works the same way |
| `BRAVE_SEARCH_API_KEY` | no | Primary discovery. Finds new ATS slugs |
| `SERPER_API_KEY` | no | Used only when Brave is missing or a Brave call fails |
| `SCAN_SEED_LIMIT` | no | Boards per scan. Default 40. `0` reads the full verified catalog |
| `CAREER_DETAIL_LIMIT` | no | Job pages per career host per scan. Default 40, hard cap 200 per host per day |
| `SMARTRECRUITERS_POSTING_API` | no | Default `on`. `off`, `false`, or `0` stops `api.smartrecruiters.com`. Compose forwards it |
| `DISCOVERY_QUERY_LIMIT` | no | `site:` queries per scan. Default 14. Polish boards and Workday are never queried |
| `RECRUITEE_CAREERS_TOKEN` | no | Employer token. Required for Recruitee after 10 February 2027 |
| `MATCH_SALARY_FLOOR_PLN` and `FX_*_PLN` | no | Neutral matching defaults and placeholder FX overrides |

`LLM_INPUT_USD_PER_MILLION` and `LLM_OUTPUT_USD_PER_MILLION` only affect the cost estimate. Token counts are stored either way.

## What a scan does

1. Expand the phrase into related titles, seniority, synonyms, and exclusions. `site:` queries are built in code from those titles. The model never writes them.
2. Optionally ask Brave (then Serper) for ATS pages. Hits are used only to recover a board slug or a job URL, then the original ATS API is fetched. Raw search results are not written to the database.
3. Read the public, unauthenticated job APIs. Seed boards come from `config/seed-companies.json` plus `config/seed-companies-pl.json` (checked 2026-10-10). Allegro's SmartRecruiters board is turned off. Allegro jobs are read from careers.allegro.eu. Workday tenants are read from the sitemap and JSON-LD.
4. Normalize title, location, workplace, and salary text, dedupe, and score. The score is deterministic. A model may explain it and cannot change the number.
5. Save the run. Running the same search again marks offers that were not in the previous succeeded run.

## Sources

Verified read APIs, all unauthenticated GETs:

- Greenhouse Job Board API, list without `content=true`, detail with `pay_transparency=true`
- Lever Postings API (`mode=json`). Boards marked `eu:` try `api.eu.lever.co` first (XTB, OLX). A 404 on the preferred host tries the other host once
- Ashby public job posting API (`includeCompensation=true`, `workplaceType` over `isRemote`)
- Workable widget API on `apply.workable.com` (`details=true`). An empty `jobs` array is not a real board
- SmartRecruiters Posting API, filtered with `country=pl` and `locationType=REMOTE`, paginated. `totalFound: 0` is not a real company: the API returns 200 for invented identifiers. The API stays on. Set `SMARTRECRUITERS_POSTING_API=off` to stop it while the robots.txt decision is open
- Teamtailor public RSS (`/jobs.rss`, with `offset` and `per_page`). A slug that already contains a dot is a custom domain
- Recruitee `GET /api/offers/`. Open without a token until 10 February 2027. After that, or on HTTP 401, the board is skipped. Set `RECRUITEE_CAREERS_TOKEN` (`X-Careers-Sites-Token`)
- Personio public XML (`/xml?language=en`, `.jobs.personio.de` then `.com`)
- Traffit public API (`/public/job_posts/published`, page headers). Awarded posts are skipped
- Pinpoint `postings.json`. Every slug is identity-checked against `job.division.name` and the posting text. A demo board (`ACME`, "Head of DEI") is rejected. The hostname is not identity

Breezy `/json` and BambooHR `/careers/list` are included so the verified Boldare and Miquido boards can be read. Both feeds are undocumented. BambooHR descriptions come from `/careers/{id}/detail`.

A board is kept only when it has jobs and, where the payload includes one, a company name. Slugs that belonged to the wrong company on the check date are in `src/server/adapters/blocked.ts` and are never used.

Company career pages may be read for schema.org `JobPosting` JSON-LD. Polish boards are not fetched: justjoin.it, nofluffjobs, pracuj.pl, theprotocol.it, and bulldogjob. The results page links out to their own search.

Enterprise career sites follow `sources/enterprise-ats-legal.md` and `sources/link-only-alternatives.md` (10 October 2026). SuccessFactors employer sites such as jobs.gft.com and careers.allegro.eu are read from the sitemap and job-page microdata. The legacy Allegro host career55.sapsf.eu stays link-only. Workday tenants (Intive, Motorola Solutions, Mastercard, Visa, Samsung, Thomson Reuters) are read from the sitemap and JSON-LD, with a short Poland cxs query only when the sitemap is capped. iCIMS, Phenom on employer domains, Avature RSS, eRecruiter employer pages, and Jobvite are allowed with the same limits. Callstack is the Recruitee board `callstackpl`. Grupa Pracuj is the published `jobs.feed.json` feed. Sii, Żabka, Bolt, Comarch, EPAM, and Brand24 are employer-domain sitemaps or listings. Wirtualna Polska and Packhelp are listing-only: titles and links are stored, and skk or PeopleForce detail pages are not fetched. Synerise job pages come from web search plus JSON-LD, because `/api/` is disallowed. EPAM's sitemap count is not the live total (the public listing showed about 225). jobs.sap.com, Oracle Recruiting (including Nokia, whose sitemap exists), Taleo, careers.phenom.com, Siemens job pages, HiBob, Dynatrace, Codility, Oviva, Revolut, Future Processing, Saleor, Billtech, and JPMorganChase stay link-only.

The crawler sends `JobscannerBot/0.1` with a contact URL, waits at least 5 seconds between requests to a host, fetches at most 200 job pages per host per day, refreshes sitemaps daily, and honors robots.txt. Stored text is a short excerpt plus the canonical link. Recruiter names, emails, and phone numbers are dropped. Pages that opt out of AI input or training, or reserve text-and-data mining, are scored with the rules and are not sent to the model. Logins and bot walls are not bypassed. The Coverage page lists each employer, platform, policy, reason, last fetch, and job count.

Greenhouse EU (`boards-api.eu.greenhouse.io`) was unreachable on the check date and is not called.

Details and the probe scripts are in `sources/` (`source-pack.md`, `source-pack-pl.md`, `enterprise-ats-legal.md`, and `link-only-alternatives.md`).

## Matching

The `matching/` package is the search-intelligence pack, kept on its own Zod 4 install so its 46 tests stay intact. The app calls it from the worker for expansion, normalization, dedupe, scoring, and explanation.

Scoring weights from that pack, which the fixture tests lock in: title 30, seniority 15, location 25, salary 15, freshness 10, source 5. Salary is compared as monthly PLN on a B2B net-of-VAT basis. FX rates in `matching/config.ts` are placeholders; set `FX_*_PLN` to override them without editing the defaults.

`matching/fixtures/profile.json` is example data (a 30k PLN floor and a Warsaw-only location). The live profile is neutral: salary floor 1 PLN, every contract type accepted, remote across PL/EU/EMEA/WORLD, home city Warsaw, and the main Polish cities for hybrid and on-site. Seniority is a window around the expanded role. On-site roles outside that city list still score low. That is the pack's scorer, and it is unchanged.

## Tests

```bash
npm test
```

That runs URL-safety, adapter, and discovery unit tests, the matching pack, and one search-flow test with a mocked model and a mocked search API. The flow test needs the `jobscanner_test` database migrated.

## Layout

- `src/app` — the one-page UI, Blitz auth, and RPCs
- `src/server/search/pipeline.ts` — one scan
- `src/server/adapters` — live ATS adapters, plus the unverified Greenhouse EU slot
- `config/seed-companies-pl.json` — verified Polish-market boards
- `src/server/security` — URL checks and the fetch client (timeouts, size cap, per-host spacing, redirects re-checked)
- `src/worker.ts` — claims `BackgroundTask` rows. No Redis
- `config/seed-companies.json` — the verified board list
- `matching/` — scoring and normalization
