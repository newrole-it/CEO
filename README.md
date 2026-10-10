# Jobscanner

Personal job-offer scanner. Type a role in Polish or English. Jobscanner expands it into related titles, reads public ATS boards, and ranks what is open. Every result links to the original posting. Search works without an account. Sign in to keep a profile, and the same page ranks offers against your salary and industry.

There is no billing and no email alerts. The first email you enter creates an account and signs you in on that device. Later sign-ins use a one-time link. LinkedIn sign-in uses OpenID Connect and only receives your name, email, and picture. The seeded owner stays the admin.

## Run it

Docker Compose (Postgres, the web app, and a separate worker that restarts on failure):

```bash
cp .env.example .env
# SESSION_SECRET_KEY, OWNER_PASSWORD, and POSTGRES_PASSWORD are required.
# Compose publishes the site and Postgres on 127.0.0.1 only.
docker compose up --build
```

Open http://127.0.0.1:43123. Search is public. The owner account is `rafal@jobscanner.local` / `jobscanner-local`, unless you changed `OWNER_EMAIL` and `OWNER_PASSWORD`. Everyone else uses email or LinkedIn.

Without Docker, the same process is Postgres plus two processes:

```bash
cp .env.example .env
# create the role and database, then:
npm install
npm install --prefix matching
npm run setup
npm run dev:all
```

`dev:all` starts the site on 127.0.0.1:43123 and the Postgres-backed worker. A scan does nothing until the worker is running. The same worker indexes the full allowed catalog between searches: one request per 5 seconds per host, at most 200 detail pages per host per day, and a daily refresh. An unfinished career site stays next until that daily cap, so Allegro, EPAM, and Comarch backfill over several days. `npm start` serves the production build on the same port.

The app works with no API keys. Query expansion falls back to checked examples (or a minimal expander), and scans read the verified seed boards.

## Environment

Copy `.env.example`. The values the owner actually has to provide:

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `SESSION_SECRET_KEY` | yes | Cookie signing key, at least 32 characters. Compose refuses to start without it |
| `OWNER_EMAIL` / `OWNER_PASSWORD` | yes for Compose and seed | Admin account. Password at least 10 characters. Password sign-in stays available for this account |
| `APP_ORIGIN` | no | Public origin for magic links and the LinkedIn callback. Default `http://127.0.0.1:43123` |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | no | LinkedIn OpenID Connect. Empty disables the LinkedIn button's success path |
| `EMAIL_PROVIDER` | no | `console` (default, logs the link), `resend`, or `smtp` |
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

`RESEND_API_KEY` is used when `EMAIL_PROVIDER=resend`. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD` are used when `EMAIL_PROVIDER=smtp`.

## Accounts and profile

Search does not require an account. The first time an email is entered, Jobscanner creates the user and signs that browser in. A later sign-in emails a link that works once and expires after 15 minutes. The token is stored as a hash. Requests are limited to 5 per email and 20 per IP each hour. With `EMAIL_PROVIDER=console`, the link is printed in the web server log.

LinkedIn uses the official OpenID Connect flow, scopes `openid`, `profile`, and `email`.

1. Create an app at [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps).
2. Add the product “Sign In with LinkedIn using OpenID Connect”.
3. Set the authorized redirect URL to `http://127.0.0.1:43123/api/auth/linkedin/callback` (or `${APP_ORIGIN}/api/auth/linkedin/callback`).
4. Put the client id and secret in `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.

LinkedIn does not share a CV. After a search, import a profile by uploading the PDF from LinkedIn (More → Save to PDF), any CV PDF, or pasted text. The file is deleted after text extraction. The structured profile is stored, and so are the parsed sections (headline, about, experience, skills, education) so Profile audit can show a copy. Settings deletes that copy along with the rest of the account data. CV text is treated as untrusted: instruction-like lines are stripped, and skills or titles the model invents are kept only when they appear in the source.

Profile audit is for a signed-in user who imported that text. It marks exact phrases, with a copy-paste rewrite next to each mark. Categories are missing keywords, vague wording, seniority or scope, gaps, and formatting. Keyword notes use the latest successful search for each saved role. A phrase becomes a mark only when at least five matched offers contain it, that share is at least 15%, and the profile never says it. The percentage is the counted share. The model cannot supply a score or a percentage of its own. Run the audit again after a new PDF to see the score move.

Reject and Interested sit on each offer, with J or ← and K or →, and Z to undo several steps. On a narrow screen the same offers are a swipe stack: left rejects, right marks interested, and the buttons stay available. Decided offers leave the main list until you turn on Show decided. Interested and Rejected can move an offer the other way or back to undecided. A rejected offer lowers similar titles a little, at most 8 points, without changing the matcher. A guest's decisions are stored in this browser and merged into the account at sign-in.

When a profile exists, ranking stays on top of the query. The query relevance floor (40) still applies first. Salary is compared with the profile floor and target as monthly PLN (UoP gross × 1.25, B2B net of VAT as-is). Offers without a salary stay visible and are labeled “salary not disclosed”. Offers clearly below the floor drop in score and remain listed. Industry is extracted per posting (model, validated, cached, with a keyword fallback). Same and adjacent industries score higher. Unknown is neutral. A different industry is a mild penalty, stronger only when the posting requires that domain. The profile preference is stick, prefer (default), or any. None of those modes hide an offer. Results can filter by industry and a minimum monthly salary; the minimum hides undisclosed salaries.

This is not legal advice. Crawl limits are unchanged: one request per 5 seconds per host, 200 detail pages per host per day, daily refresh.

## What a scan does

The worker keeps a local index of every job on allowed and allowed-with-limits boards. A search scores that index first, so matches show up without waiting for a crawl, then tops up boards that have never been indexed. Offers at or above the relevance floor (40) are all listed, with filters and pages. A job missing from a complete crawl becomes possibly closed, then closed on the next miss.

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
