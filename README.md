# Jobscanner

Personal job-offer scanner for one owner. Type a role in Polish or English. Jobscanner expands it into related titles, reads public ATS boards, and ranks what is open. Every result links to the original posting.

There is no billing, no multi-tenant workspace, and no email alerts. Signup is closed. One account is created by the seed.

## Run it

Docker Compose (Postgres, the web app, and the worker):

```bash
docker compose up --build
```

Open http://127.0.0.1:43123 and sign in with the owner account (`rafal@jobscanner.local` / `jobscanner-local`, unless you changed `OWNER_EMAIL` and `OWNER_PASSWORD`).

Without Docker, the same process is Postgres plus two processes:

```bash
cp .env.example .env
# create the role and database, then:
npm install
npm install --prefix matching
npx prisma migrate deploy
npm run db:seed
npm run dev:all
```

`dev:all` starts the site on port 43123 and the Postgres-backed worker. A scan does nothing until the worker is running.

The app works with no API keys. Query expansion falls back to checked examples (or a minimal expander), and scans read the verified seed boards.

## Environment

Copy `.env.example`. The values the owner actually has to provide:

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `SESSION_SECRET_KEY` | yes in production | Cookie signing key, at least 32 characters |
| `OWNER_EMAIL` / `OWNER_PASSWORD` | for seed | The single account. Password at least 10 characters |
| `LLM_API_KEY` | no | OpenAI-compatible key. Empty uses the deterministic expander and rule-based reasons |
| `LLM_BASE_URL` / `LLM_MODEL` | with the key | Defaults to OpenAI `gpt-4o-mini`. An xAI base URL works the same way |
| `BRAVE_SEARCH_API_KEY` | no | Primary discovery. Finds new ATS slugs |
| `SERPER_API_KEY` | no | Used only when Brave is missing or a Brave call fails |
| `SCAN_SEED_LIMIT` | no | Boards per scan. Default 40. `0` reads the full verified catalog |
| `DISCOVERY_QUERY_LIMIT` | no | `site:` queries per scan. Default 14. Polish boards and Workday are never queried |
| `RECRUITEE_CAREERS_TOKEN` | no | Employer token. Required for Recruitee after 10 February 2027 |
| `MATCH_SALARY_FLOOR_PLN` and `FX_*_PLN` | no | Neutral matching defaults and placeholder FX overrides |

`LLM_INPUT_USD_PER_MILLION` and `LLM_OUTPUT_USD_PER_MILLION` only affect the cost estimate. Token counts are stored either way.

## What a scan does

1. Expand the phrase into related titles, seniority, synonyms, and exclusions. `site:` queries are built in code from those titles. The model never writes them.
2. Optionally ask Brave (then Serper) for ATS pages. Hits are used only to recover a board slug or a job URL, then the original ATS API is fetched. Raw search results are not written to the database.
3. Read the public, unauthenticated job APIs. Seed boards come from `config/seed-companies.json` plus `config/seed-companies-pl.json` (checked 2026-10-10). Allegro's SmartRecruiters board is turned off. Workday boards are links, not fetches.
4. Normalize title, location, workplace, and salary text, dedupe, and score. The score is deterministic. A model may explain it and cannot change the number.
5. Save the run. Running the same search again marks offers that were not in the previous succeeded run.

## Sources

Verified read APIs, all unauthenticated GETs:

- Greenhouse Job Board API, list without `content=true`, detail with `pay_transparency=true`
- Lever Postings API (`mode=json`). Boards marked `eu:` try `api.eu.lever.co` first (XTB, OLX). A 404 on the preferred host tries the other host once
- Ashby public job posting API (`includeCompensation=true`, `workplaceType` over `isRemote`)
- Workable widget API on `apply.workable.com` (`details=true`). An empty `jobs` array is not a real board
- SmartRecruiters Posting API, filtered with `country=pl` and `locationType=REMOTE`, paginated. `totalFound: 0` is not a real company: the API returns 200 for invented identifiers
- Teamtailor public RSS (`/jobs.rss`, with `offset` and `per_page`). A slug that already contains a dot is a custom domain
- Recruitee `GET /api/offers/`. Open without a token until 10 February 2027. After that, or on HTTP 401, the board is skipped. Set `RECRUITEE_CAREERS_TOKEN` (`X-Careers-Sites-Token`)
- Personio public XML (`/xml?language=en`, `.jobs.personio.de` then `.com`)
- Traffit public API (`/public/job_posts/published`, page headers). Awarded posts are skipped
- Pinpoint `postings.json`. Every slug is identity-checked against `job.division.name` and the posting text. A demo board (`ACME`, "Head of DEI") is rejected. The hostname is not identity

Breezy `/json` and BambooHR `/careers/list` are included so the verified Boldare and Miquido boards can be read. Both feeds are undocumented. BambooHR descriptions come from `/careers/{id}/detail`.

A board is kept only when it has jobs and, where the payload includes one, a company name. Slugs that belonged to the wrong company on the check date are in `src/server/adapters/blocked.ts` and are never used.

Company career pages may be read for schema.org `JobPosting` JSON-LD. Polish boards are not fetched: justjoin.it, nofluffjobs, pracuj.pl, theprotocol.it, and bulldogjob. The results page links out to their own search.

Workday career sites are not fetched. Workday's site terms ban data mining and robots. The six Polish-hub boards (Intive, Motorola Solutions, Mastercard, Visa, Samsung, Thomson Reuters) are outbound links on the results page.

Greenhouse EU (`boards-api.eu.greenhouse.io`) was unreachable on the check date and is not called.

Details, rate-limit notes, and the probe scripts are in `sources/` (`source-pack.md` and `source-pack-pl.md`).

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
