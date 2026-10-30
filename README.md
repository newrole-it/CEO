# Nowa Rola

Tech jobs at every level, from junior to CTO, straight from employers' career pages. Type a role in Polish or English. Nowa Rola expands it into related titles, reads public ATS boards, and ranks what is open. Every result links to the original posting. Search works without an account. Sign in to keep a profile, and the same page ranks offers against your salary, industry, and seniority.

## Start here

You need [Node 22 or newer](https://nodejs.org) and [Docker Desktop](https://www.docker.com/products/docker-desktop) running. It runs on macOS and Linux; on Windows, use WSL.

```bash
git clone https://github.com/newrole-it/CEO.git
cd nowarola.it
npm run go
```

That is the whole install. `npm run go` creates `.env` with fresh secrets, installs the packages, starts Postgres in Docker, runs the migrations, builds the Chrome extension, starts the site and the worker, and opens http://127.0.0.1:43123/setup. Use the same command every day: it skips what is already done. Ctrl+C stops everything.

`/setup` lists what to do next, in order, and shows what already works. The status updates by itself.

| Step | How it gets done |
|---|---|
| Database, worker, offer index | `npm run go` handles them. The first offers appear within minutes |
| Claude Code | Optional, recommended. One command to install, one to sign in. It is the AI engine, on your own subscription, with no API keys |
| Account | Enter an email. Your first email creates the account |
| Profile | Upload a CV as a PDF, or import your LinkedIn profile |
| Form details and CV | Fill in a short form, and create or import your CV |
| Chrome extension | Load one folder at chrome://extensions, then click Connect. The page gives you the path |
| Claude Code MCP | Copy one command |
| Google Sheet | Optional. Four steps in Settings, with no Google keys |

Until the database, worker, account and profile are ready, the home page sends you to `/setup`. "Skip for now" stops that in this browser, and the menu always has a link back. A public deployment (`APP_ORIGIN` not on localhost) has no `/setup`.

## What it does

The interface is Polish by default, with an English switch. The public name is Nowa Rola at nowarola.it. The landing count is active tech offers, rounded down to the thousand, and it stays hidden until roles have been classified. Seniority is a filter, not the default scope. A signed-in profile's seniority ranks matching levels a little higher. Privacy and terms are drafts pending legal review. Settings can export your data as JSON, delete the CV and profile, or delete the account. Deletion removes the profile, searches, decisions, audits, sessions, sign-in links, and the LinkedIn connection. Audit-log rows keep the action name only.

There is no billing and no email alerts. The first email you enter creates an account and signs you in on that device. Later sign-ins use a one-time link, or a password once you set one in Settings. LinkedIn sign-in uses OpenID Connect and only receives your name, email, and picture. The seeded owner stays the admin.

## Use it from Claude Code

Nowa Rola ships an MCP server. Claude Code uses it to search the local index, import your CV, learn what you like, and add offers it finds on company career pages. It runs on your machine against the same Postgres as the app. No API keys: when `claude` is installed, the app's own model calls (CV reading, query expansion, match reasons) go through `claude -p` on your Claude subscription.

Inside this repo, Claude Code offers the server from `.mcp.json`; approve `nowarola` once. From any other directory:

```bash
claude mcp add nowarola -s user -- npm --prefix /path/to/nowarola.it run --silent mcp
```

Add `-e NOWAROLA_USER_EMAIL=you@example.com` when the database has more than one account. Run the worker (`npm run worker`) so watched companies get indexed. The web app does not need to be running.

Things to ask:

- „Załóż mój profil z ~/Downloads/Profile.pdf” (or: „przeczytaj mój profil LinkedIn w Chrome”)
- „Pokaż nowe oferty dla mnie z tego tygodnia”
- „Szukaj senior backend, zdalnie, od 25 tys.”
- „Ta oferta z Allegro mi się podoba” (Claude asks what you like about it and records it)
- „Znajdź mi oferty spoza agregatorów, jak ta z Allegro” (or the `/mcp__nowarola__hunt` prompt)
- „Na jakim etapie jestem z Docplanner?”, „Odrzucili mnie w OLX po rozmowach”, „Mam rozmowę finałową w czwartek”
- „Pomóż mi zaaplikować na tę ofertę” (the `/mcp__nowarola__apply` prompt: CV, answers, tracking)
- „Przejrzyj moje aplikacje i zaktualizuj arkusz” (the `/mcp__nowarola__pipeline` prompt)

Tools: `profile_get`, `profile_import`, `jobs_search`, `jobs_for_me`, `job_get`, `job_feedback`, `jobs_similar`, `companies_watch`, `companies_watched`, `companies_unwatch`, `companies_similar_context`, `offer_ingest`, `discovery_brief`, `index_refresh`, `applications_list`, `application_get`, `application_add`, `application_update`, `applications_export`, `sheet_status`, `sheet_sync`, `cv_list`, `cv_get`, `cv_update`, `cv_export_pdf`, `answers_search`, `answer_save`, `answer_draft`. Prompts: `hunt`, `review`, `onboard`, `apply`, `pipeline`. The skill in `.claude/skills/nowarola` describes the same workflows.

## Applications, CV, answers and the Chrome extension

The plan and the contracts are in `docs/product/plan-aplikacje.md`.

- **Tracker** (`/applications`). Every application has a stage: Aplikowano → Rozmowa z rekruterem → Rozmowy → Zadanie → Rozmowa finałowa → Oferta, or a closing status: Przyjęta, Odrzucono, Wycofałem się, Brak odpowiedzi. A rejection or withdrawal records the stage it happened at. Each change goes onto the application's timeline. "Aplikowano" on an offer, the Chrome extension, and the MCP tools all add applications. Offers marked as applied before this change were moved into the tracker by the migration.
- **Google Sheet.** Settings → Arkusz Google gives you an Apps Script to paste into your own sheet (Extensions → Apps Script, deploy as a web app). After that the worker sends the whole table about 20 seconds after each change, and `sheet_sync` sends it at once. No Google keys are involved. Sync is one-way, app to sheet. The Google Drive connector in Claude can only create a new file, so `applications_export` plus `create_file` makes a snapshot, not an update.
- **CV** (`/cv`). Keep uploaded PDFs and editable CVs. The editor shows A4 pages and page breaks as you type. The PDF is printed by headless Chrome (`CHROME_PATH`) from the same HTML and the same page-break code, so it matches the editor. "Import HTML" reads a CV in the layout of `Rafal_Testowy_CV_PL.html`. CVs are stored in the database because you saved them. Settings → "Usuń CV i profil" does not delete them. Delete them on `/cv`, or delete the account.
- **Answer bank** (`/answers`). Answers to application questions, grouped by question with per-company variants. A new question shows the closest saved answers. "Napisz szkic z Claude" drafts from those answers, your profile, CV and the offer, with `CLAUDE_WRITING_MODEL` (default `sonnet`) on your subscription.
- **Form details** (Profil → Dane do formularzy). Contact details and terms the extension fills without a model.
- **Chrome extension** (`extension/`, built with [WXT](https://wxt.dev)). `npm run go` builds it into `extension/.output/chrome-mv3`; `npm run ext:build` rebuilds it and `npm run ext:dev` runs WXT's dev mode. Load that folder from chrome://extensions in developer mode and click Connect on `/setup`, or paste a token from Settings. On known ATS hosts it fills application forms. On any other page it works from the popup. Fields it fills: standard fields from your form details, the CV file, and open questions from the answer bank or a Claude draft. AI drafts are outlined in yellow for review. It never fills passwords, consents or EEO questions, and never submits for you. When you submit, it records the application, reading company and title from the index or with Claude, and saves your final answers to open questions. Contact details stay in the browser. See `extension/README.md`.
- **Password.** Settings → Hasło sets an optional password for any account. `/login` takes email and password next to the one-time link.

Claude never fetches LinkedIn or the Polish boards (justjoin.it, nofluffjobs, pracuj.pl, theprotocol.it, bulldogjob). To import a LinkedIn profile, Claude in Chrome reads your own profile page and passes the text to `profile_import`, or you give it the “Save to PDF” file. Offers Claude adds go through the same URL checks and source policy as the crawler.

## Run it

The normal way is `npm run go`, described under [Start here](#start-here). `npm run setup` does the same preparation without starting the app. To use a Postgres you already run instead of Docker, set `DATABASE_URL` in `.env`: `npm run go` uses it and leaves Docker alone. If port 5432 is taken on the first run, it picks another port and writes it to `.env`.

To run everything in containers instead, use Docker Compose (Postgres, the web app, and a separate worker that restarts on failure). Claude Code and headless Chrome are not in the image, so model calls and one-click CV PDFs need the local setup or API keys:

```bash
cp .env.example .env
# SESSION_SECRET_KEY, OWNER_PASSWORD, and POSTGRES_PASSWORD are required.
# Compose publishes the site and Postgres on 127.0.0.1 only.
docker compose up --build
```

Open http://127.0.0.1:43123. Search is public. The owner account is `rafal@jobscanner.local` / `jobscanner-local`, unless you changed `OWNER_EMAIL` and `OWNER_PASSWORD`. Everyone else uses email or LinkedIn.

`npm run dev:all` starts the site on 127.0.0.1:43123 and the Postgres-backed worker, without the preparation steps. A scan does nothing until the worker is running. The same worker indexes the full allowed catalog between searches: one request per 5 seconds per host, at most 200 detail pages per host per day, and a daily refresh. An unfinished career site stays next until that daily cap, so Allegro, EPAM, and Comarch backfill over several days. `npm start` serves the production build on the same port.

The app works with no API keys. With Claude Code installed, model calls use `claude -p` on your subscription. Without it, query expansion falls back to checked examples (or a minimal expander), and scans read the verified seed boards.

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
| `LLM_PROVIDER` | no | `openai`, `claude-cli`, or `none`. Unset: `openai` when `LLM_API_KEY` is set, else `claude-cli` when the `claude` binary is found, else `none` (rules only) |
| `CLAUDE_CLI_MODEL` | no | Model for `claude -p`. Default `haiku` |
| `CLAUDE_CLI_PATH` | no | Path to the `claude` binary when it is not on `PATH` (also checked: `~/.local/bin/claude`) |
| `NOWAROLA_USER_EMAIL` | no | Account the MCP server acts for. Unset: the only regular account, else the owner |
| `LLM_API_KEY` | no | OpenAI-compatible key. Empty uses `claude-cli` when available, otherwise the deterministic expander and rule-based reasons |
| `LLM_BASE_URL` / `LLM_MODEL` | with the key | Defaults to OpenAI `gpt-4o-mini`. An xAI base URL works the same way |
| `WEB_SEARCH_PROVIDER` | no | `claude` runs discovery web search through `claude -p` with only the WebSearch tool, when Brave and Serper keys are missing. `LLM_PROVIDER=claude-cli` turns it on too. `CLAUDE_SEARCH_DAILY_CAP` (default 40, `0` turns it off) limits it |
| `BRAVE_SEARCH_API_KEY` | no | Primary discovery. Finds boards and listings the crawl missed, and a salary stated on another listing of the same role |
| `SERPER_API_KEY` | no | Used only when Brave is missing or a Brave call fails |
| `SCAN_SEED_LIMIT` | no | Boards per scan. Default 40. `0` reads the full verified catalog |
| `CAREER_DETAIL_LIMIT` | no | Job pages per career host per scan. Default 40, hard cap 200 per host per day |
| `SMARTRECRUITERS_POSTING_API` | no | Default `on`. `off`, `false`, or `0` stops `api.smartrecruiters.com`. Compose forwards it |
| `DISCOVERY_QUERY_LIMIT` | no | `site:` queries per scan. Default 14. Polish boards and Workday are never queried |
| `RECRUITEE_CAREERS_TOKEN` | no | Employer token. Required for Recruitee after 10 February 2027 |
| `MATCH_SALARY_FLOOR_PLN` and `FX_*_PLN` | no | Neutral matching defaults and placeholder FX overrides |

`LLM_INPUT_USD_PER_MILLION` and `LLM_OUTPUT_USD_PER_MILLION` only affect the cost estimate. Token counts are stored either way.

With `claude-cli`, each model call is one `claude -p --output-format json` process: the prompt goes in on stdin, built-in tools and MCP servers are off, at most 2 run at once (`CLAUDE_CLI_MAX_CONCURRENT`), and each has 90 seconds (`CLAUDE_CLI_TIMEOUT_MS`). A JSON reply that fails validation is retried once. Replies use the same cache and the same rules for CV text as the API provider. Classifying every indexed job as tech or not stays on rules, so the crawl does not spend your subscription; `CLAUDE_CLI_SKIP_PURPOSES` lists the purposes that stay on rules (default `role-classify`, empty to allow all). Reading a CV takes about 3–4 seconds with `haiku`.

`RESEND_API_KEY` is used when `EMAIL_PROVIDER=resend`. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD` are used when `EMAIL_PROVIDER=smtp`.

## Accounts and profile

Search does not require an account. The first time an email is entered, Nowa Rola creates the user and signs that browser in. A later sign-in emails a link that works once and expires after 15 minutes. The token is stored as a hash. Requests are limited to 5 per email and 20 per IP each hour. With `EMAIL_PROVIDER=console`, the sign-in URL is printed in the web server log without the email address. That log line is the local delivery path, not a production mailbox.

### Profil z LinkedIn bez aplikacji LinkedIn

Getting your profile needs no LinkedIn app and no keys. `/start` → "Pobierz z LinkedIn" offers three ways:

1. **Claude in your browser** (local install only). The app runs `claude -p --chrome` on your Claude licence. Claude opens a new tab in your Chrome, where you are already signed in to LinkedIn, and reads `linkedin.com/in/me` plus its `/details/experience/`, `/details/skills/`, `/details/education/`, `/details/certifications/`, and `/details/languages/` pages, then closes the tab. The session has only five tools: list tabs, new tab, navigate, read page text, close tab. Nothing can be clicked, typed, or sent, and no other profile, feed, job, or message page is opened. It needs the [Claude in Chrome](https://claude.ai/chrome) extension signed in with the same account as Claude Code. It usually takes 1–3 minutes. Set `LINKEDIN_BROWSER_MODEL` to change the model (default `CLAUDE_CLI_MODEL`, then haiku) and `LINKEDIN_BROWSER_IMPORT=off` to hide it. It is offered only when `APP_ORIGIN` is a loopback address, because it drives the Chrome on the machine the app runs on.
2. **LinkedIn data export (ZIP).** LinkedIn → Settings → Data privacy → Get a copy of your data. LinkedIn emails the archive, usually within about 10 minutes. Only `Profile.csv`, `Positions.csv`, `Skills.csv`, `Education.csv`, `Certifications.csv`, and `Languages.csv` are read. From `Profile.csv` only the name, headline, summary, and location are used: address, birth date, and postcode are dropped. Messages, connections, and every other file in the archive are never opened. The ZIP is read in memory and not stored.
3. **Profile PDF.** Your profile → More → Save to PDF.

This reads only your own profile, in your own browser, when you start it. It is the same as you opening your profile and copying it, done at a human pace. Nowa Rola does not crawl LinkedIn. In Claude Code, the `onboard` MCP prompt follows the same rules, and `profile_import` takes `text`, `pdfPath`, or `zipPath`.

### Sign in with LinkedIn (optional)

Sign-in uses the official OpenID Connect flow, scopes `openid`, `profile`, and `email`. It only gives a name, email, and picture, so it is a sign-in method, not a profile source. It is mainly for the hosted version.

1. Create an app at [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps).
2. Add the product “Sign In with LinkedIn using OpenID Connect”.
3. Set the authorized redirect URL to `http://127.0.0.1:43123/api/auth/linkedin/callback` (or `${APP_ORIGIN}/api/auth/linkedin/callback`).
4. Put the client id and secret in `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.

LinkedIn does not share a CV. After a search, import a profile by uploading the PDF from LinkedIn (More → Save to PDF), any CV PDF, or pasted text. The PDF is written to a temporary file, read, and deleted before the request continues. It is not stored. The structured profile is stored, and so are the parsed sections (headline, about, experience, skills, education) so Profile audit can show a copy. Settings can delete that copy on its own, or delete the whole account. CV text is treated as untrusted: instruction-like lines are stripped, and skills or titles the model invents are kept only when they appear in the source. Model replies from the CV are cached under the user and removed with the profile.

Profile audit is for a signed-in user who imported that text. It marks exact phrases, with a copy-paste rewrite next to each mark. Categories are missing keywords, vague wording, seniority or scope, gaps, and formatting. Keyword notes use the latest successful search for each saved role. A phrase becomes a mark only when at least five matched offers contain it, that share is at least 15%, and the profile never says it. The percentage is the counted share. The model cannot supply a score or a percentage of its own. Run the audit again after a new PDF to see the score move.

Reject and Interested sit on each offer, with J or ← and K or →, and Z to undo several steps. On a narrow screen the same offers are a swipe stack: left rejects, right marks interested, and the buttons stay available. Decided offers leave the main list until you turn on Show decided. Interested and Rejected can move an offer the other way or back to undecided. A rejected offer lowers similar titles a little, at most 8 points, without changing the matcher. A guest's decisions are stored in this browser and merged into the account at sign-in.

When a profile exists, ranking stays on top of the query. The query relevance floor (40) still applies first. Salary is compared with the profile floor and target as monthly PLN (UoP gross × 1.25, B2B net of VAT as-is). Offers without a salary stay visible and are labeled “salary not disclosed”. Offers clearly below the floor drop in score and remain listed. Industry is extracted per posting (model, validated, cached, with a keyword fallback). Same and adjacent industries score higher. Unknown is neutral. A different industry is a mild penalty, stronger only when the posting requires that domain. The profile preference is stick, prefer (default), or any. None of those modes hide an offer. Results can filter by industry and a minimum monthly salary; the minimum hides undisclosed salaries.

This is not legal advice. Crawl limits are unchanged: one request per 5 seconds per host, 200 detail pages per host per day, daily refresh.

## What a scan does

The worker keeps a local index of every job on allowed and allowed-with-limits boards. A search scores that index first, so matches show up without waiting for a crawl, then tops up boards that have never been indexed. Offers at or above the relevance floor (40) are all listed, with filters and pages. A job missing from a complete crawl becomes possibly closed, then closed on the next miss.

1. Expand the phrase into related titles, seniority, synonyms, and exclusions. `site:` queries are built in code from those titles. The model never writes them.
2. Optionally ask Brave (then Serper) for pages. A search can recover an ATS slug, which is then read from that board's API. A separate worker pass, at most two queries every six hours, can add a listing the crawl does not have or copy an explicit salary onto the same role. Polish boards are not fetched. The raw search response is not stored.
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

The crawler sends `NowaRolaBot/0.1` with a contact URL on `APP_URL` (default `https://nowarola.it`), waits at least 5 seconds between requests to a host, fetches at most 200 job pages per host per day, refreshes sitemaps daily, and honors robots.txt. Stored text is a short excerpt plus the canonical link. Recruiter names, emails, and phone numbers are dropped. Pages that opt out of AI input or training, or reserve text-and-data mining, are scored with the rules and are not sent to the model. Logins and bot walls are not bypassed. The Coverage page lists each employer, platform, policy, reason, last fetch, and job count.

Greenhouse EU (`boards-api.eu.greenhouse.io`) was unreachable on the check date and is not called.

Watched companies (added in the app or by Claude through MCP) follow the same rules: source policy, robots.txt, 5 seconds per host, 200 detail pages per host per day, and no aggregators or LinkedIn. Resolving a new company reads at most 8 pages.

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
- `scripts/go.mjs` — `npm run go`: from a fresh clone to a running app
- `src/server/setup` — the `/setup` checklist: rules in `steps.ts`, machine checks in `status.ts`
- `extension/` — the Chrome extension (WXT): thin `entrypoints/`, logic in `lib/`
- `src/worker.ts` — claims `BackgroundTask` rows. No Redis
- `mcp/` — the MCP server for Claude Code (`npm run mcp`, stdio). Tests: `npx vitest run -c mcp/vitest.config.ts`
- `src/server/llm` — model providers: OpenAI-compatible API and `claude -p`
- `config/seed-companies.json` — the verified board list
- `matching/` — scoring and normalization
