# Sources, scanning and matching

Nowa Rola reads public, unauthenticated job APIs and employer career pages. It never fetches LinkedIn or the Polish aggregators (justjoin.it, nofluffjobs, pracuj.pl, theprotocol.it, bulldogjob); the results page links out to their own search instead. The `/sources` page in the app lists every platform with its policy and the reason.

## What a scan does

The worker keeps a local index of every job on allowed and allowed-with-limits boards. A search scores that index first, so matches show up without waiting for a crawl, then tops up boards that have never been indexed. Offers at or above the relevance floor (40) are all listed, with filters and pages. A job missing from a complete crawl becomes possibly closed, then closed on the next miss.

1. Expand the phrase into related titles, seniority, synonyms, and exclusions. `site:` queries are built in code from those titles. The model never writes them.
2. Optionally ask Brave (then Serper) for pages. A search can recover an ATS slug, which is then read from that board's API. A separate worker pass, at most two queries every six hours, can add a listing the crawl does not have or copy an explicit salary onto the same role. Polish boards are not fetched. The raw search response is not stored.
3. Read the public job APIs. Seed boards come from `config/seed-companies.json` plus `config/seed-companies-pl.json` (checked 2026-10-10). Allegro's SmartRecruiters board is turned off; Allegro jobs are read from careers.allegro.eu. Workday tenants are read from the sitemap and JSON-LD.
4. Normalize title, location, workplace, and salary text, dedupe, and score. The score is deterministic. A model may explain it and cannot change the number.
5. Save the run. Running the same search again marks offers that were not in the previous succeeded run.

Between searches the same worker indexes the full allowed catalog: one request per 5 seconds per host, at most 200 detail pages per host per day, and a daily refresh. An unfinished career site stays next until that daily cap, so large employers backfill over several days.

## Crawler rules

The crawler sends `NowaRolaBot/0.1` with a link to [`/bot`](../src/app/bot/page.tsx) on `APP_URL`, which says how a site opts out, waits at least 5 seconds between requests to a host, fetches at most 200 job pages per host per day, refreshes sitemaps daily, and honors robots.txt. Stored text is a short excerpt plus the canonical link. When a person tailors a CV to an offer, or `job_get` is called with `fullText`, the whole text of that one offer is read under the same rules, held in memory for 15 minutes, and not stored ([product/plan-p0.md](product/plan-p0.md)). Recruiter names, emails, and phone numbers are dropped. Pages that opt out of AI input or training, or reserve text-and-data mining, are scored with the rules and are not sent to the model. Logins and bot walls are not bypassed.

Watched companies (added in the app or by Claude through MCP) follow the same rules: source policy, robots.txt, 5 seconds per host, 200 detail pages per host per day, and no aggregators or LinkedIn. Resolving a new company reads at most 8 pages.

## Verified read APIs

All unauthenticated GETs:

- **Greenhouse** Job Board API, list without `content=true`, detail with `pay_transparency=true`. Greenhouse EU (`boards-api.eu.greenhouse.io`) was unreachable on the check date and is not called
- **Lever** Postings API (`mode=json`). Boards marked `eu:` try `api.eu.lever.co` first (XTB, OLX). A 404 on the preferred host tries the other host once
- **Ashby** public job posting API (`includeCompensation=true`, `workplaceType` over `isRemote`)
- **Workable** widget API on `apply.workable.com` (`details=true`). An empty `jobs` array is not a real board
- **SmartRecruiters** Posting API, filtered with `country=pl` and `locationType=REMOTE`, paginated. `totalFound: 0` is not a real company. Off by default, because robots.txt on `api.smartrecruiters.com` disallows other crawlers; `SMARTRECRUITERS_POSTING_API=on` turns it on
- **Teamtailor** public RSS (`/jobs.rss`, with `offset` and `per_page`). A slug that already contains a dot is a custom domain
- **Recruitee** `GET /api/offers/`. Open without a token until 10 February 2027. After that, or on HTTP 401, the board is skipped. Set `RECRUITEE_CAREERS_TOKEN` (`X-Careers-Sites-Token`)
- **Personio** public XML (`/xml?language=en`, `.jobs.personio.de` then `.com`)
- **Traffit** public API (`/public/job_posts/published`, page headers). Awarded posts are skipped
- **Pinpoint** `postings.json`. Every slug is identity-checked against `job.division.name` and the posting text. The hostname is not identity
- **Breezy** `/json` and **BambooHR** `/careers/list`, included so the verified Boldare and Miquido boards can be read. Both feeds are undocumented

A board is kept only when it has jobs and, where the payload includes one, a company name. Slugs that belonged to the wrong company on the check date are in `src/server/adapters/blocked.ts` and are never used.

## Employer career sites

Company career pages may be read for schema.org `JobPosting` JSON-LD. Enterprise career sites follow [`sources/enterprise-ats-legal.md`](../sources/enterprise-ats-legal.md) and [`sources/link-only-alternatives.md`](../sources/link-only-alternatives.md) (10 October 2026):

- **SuccessFactors** employer sites such as jobs.gft.com and careers.allegro.eu are read from the sitemap and job-page microdata. The legacy Allegro host career55.sapsf.eu stays link-only
- **Workday** tenants (Intive, Motorola Solutions, Mastercard, Visa, Samsung, Thomson Reuters) are read from the sitemap and JSON-LD, with a short Poland cxs query only when the sitemap is capped
- Phenom on employer domains, Avature RSS, eRecruiter employer pages, and Jobvite are allowed with the same limits. **iCIMS** is link-only: its terms ban robots
- Callstack is the Recruitee board `callstackpl`. Grupa Pracuj is the published `jobs.feed.json` feed. Sii, Żabka, Bolt, Comarch, EPAM, and Brand24 are employer-domain sitemaps or listings
- Wirtualna Polska and Packhelp are listing-only: titles and links are stored, detail pages are not fetched. Synerise job pages come from web search plus JSON-LD, because `/api/` is disallowed
- jobs.sap.com, Oracle Recruiting (including Nokia), Taleo, careers.phenom.com, Siemens job pages, HiBob, Dynatrace, Codility, Oviva, Revolut, Future Processing, Saleor, Billtech, and JPMorganChase stay link-only

Details and the probe scripts are in [`sources/`](../sources) (`source-pack.md`, `source-pack-pl.md`, `enterprise-ats-legal.md`, `link-only-alternatives.md`).

## Matching

The [`matching/`](../matching) package is the search-intelligence pack: query expansion, normalization, dedupe, explainable scoring, and match explanation. The app calls it from the worker.

Scoring weights, locked in by the fixture tests: title 30, seniority 15, location 25, salary 15, freshness 10, source 5. Salary is compared as monthly PLN on a B2B net-of-VAT basis (UoP gross × 1.25). FX rates in `matching/config.ts` are placeholders; set `FX_*_PLN` to override them without editing the defaults.

The neutral live profile is: salary floor 1 PLN, every contract type accepted, remote across PL/EU/EMEA/WORLD, home city Warsaw, and the main Polish cities for hybrid and on-site. Seniority is a window around the expanded role. On-site roles outside that city list still score low.

When a signed-in profile exists, ranking stays on top of the query. The relevance floor (40) still applies first. Salary is compared with the profile floor and target. Offers without a salary stay visible and are labeled "salary not disclosed". Offers clearly below the floor drop in score and remain listed. Industry is extracted per posting (model, validated, cached, with a keyword fallback). Same and adjacent industries score higher; unknown is neutral; a different industry is a mild penalty, stronger only when the posting requires that domain. The profile preference is stick, prefer (default), or any. None of those modes hide an offer. A rejected offer lowers similar titles a little, at most 8 points, without changing the matcher.

This is not legal advice.
