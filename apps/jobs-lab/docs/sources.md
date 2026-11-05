# Sources, scanning and matching

The offer engine ([@newrole/job-index](../packages/job-index/README.md) over [@newrole/ats](../../resume-engine-optimization/packages/ats/README.md), tested in apps/jobs-lab; newrole.it itself no longer runs it) reads public, unauthenticated job APIs and the career pages of employers worldwide into one index. A search shows the offers from the country you search in plus remote roles you can do from there; your profile's country is the default. It never fetches LinkedIn or the Polish aggregators (justjoin.it, nofluffjobs, pracuj.pl, theprotocol.it, bulldogjob), which the source policy blocks by name; the results page links out to their own search instead. newrole.it reads one offer at a time, for the person who adds it or tailors a CV or a letter to it, on any site, job boards included (`reader: "person"` in `@newrole/offers`). From a company's ATS or page the text is kept as that person's copy of the offer; from a job board or LinkedIn it stays in memory for 15 minutes and is never stored. robots.txt, a site owner's opt-out (`CRAWLER_OPT_OUT_HOSTS`), an AI opt-out on the page and login or bot walls still apply, and LinkedIn's robots.txt disallows every page. The `/sources` page in the app lists every platform with its policy and the reason.

## What enters the index

newrole.it is for IT work, at any level and in any IT function: software, QA, DevOps, data and AI, security, product, design, IT project and program management, business analysis, IT support and IT leadership. Every board read passes each offer through one gate (`src/server/jobs/gate.ts`) before it is stored:

- **An IT role.** Title rules decide first (`src/server/classify/role.ts`), in English, Polish and the common forms of other languages ("Entwickler", "Développeur", "Zahnarzt", "Monteur"). A title they cannot decide is kept only when at least half of all the board's titles are plainly IT and the title names a role such a board fills with IT work: project, program, delivery, implementation, deployment, solutions, technology, product, research, the company's own leadership. So "Project Manager" at a software company is in, and "Associate" or "Shipping Associate" there is not. "Engineer" without an IT field ("Senior Engineer", "Project Engineer") is decided the same way: on a board less than half IT it named bridges, wastewater, HVAC and factory quality far more often than software. Engineering outside IT (mechanical, civil, process, field service, solar, battery), electrical and hardware engineering (electrical, electronics, RF, FPGA, ASIC, avionics, controls; firmware and embedded software stay in) and business functions (sales, finance, HR, legal, marketing) are out. Design is IT when the title names the web, UI/UX, apps, 3D or games ("Web Designer", "3D Artist", "Level Designer"); graphic, brand, industrial and other design is out, and "Product Designer" counts only on a board that is at least half IT.
- **A real posting.** Test posts and candidate pools ("General Application", "Talent Pool") are left out.
- **A place.** Countries come from the ATS's own fields where it has them (Lever, Ashby, Workable, Recruitee, Breezy, SmartRecruiters), then the location text, including a GeoNames list of cities of 100,000+ people (`scripts/gen-cities.mjs`, CC BY 4.0, `sources/geonames-NOTICE.md`) and region words such as EMEA. A board whose placed offers are all in one country lends it to the ones that name none. An offer still without a country or a remote region is left out. Every stored offer keeps its countries, remote regions and where they came from (`countries`, `remoteRegions`, `countrySource`).
- **Not a blocked country.** `BLOCKED_COUNTRIES` (Russia and Belarus by default) are removed from every offer; an offer that names only those is left out, and they never show in a country filter.

**Intermediaries.** An offer a recruiter or job platform lists for an employer it does not name is kept and marked (`viaIntermediary`, `src/server/jobs/intermediary.ts`): the card says the company is unknown and names the intermediary, and Claude's tools return it as `intermediary`. An offer is marked when its text says it is listed for someone else ("listed on behalf of a partner company", "this role is for one of our clients"), and every offer of a board is marked when the company's name says it places people ("Recruitment", "Staffing", "Executive Search") or when at least two and at least half of the board's offers with text name a client ("Our client is a bank"). Platforms that list no offer text (Greenhouse, BambooHR, Breezy) are marked by the name only.

An offer the gate refuses on a later read closes at once. `npm run catalog -- reconcile` applies the gate to what is already stored.

## What a scan does

The worker keeps a local index of every job on allowed and allowed-with-limits boards. A search scores that index first, so matches show up without waiting for a crawl, then tops up boards that have never been indexed. Offers at or above the relevance floor (40) are all listed, with filters and pages. A job missing from a complete crawl becomes possibly closed, then closed on the next miss.

1. Expand the phrase into related titles, seniority, synonyms, and exclusions. `site:` queries are built in code from those titles. The model never writes them.
2. Optionally ask Brave (then Serper) for pages. A search can recover an ATS slug, which is then read from that board's API. A separate worker pass, at most two queries every six hours, can add a listing the crawl does not have or copy an explicit salary onto the same role. Polish boards are not fetched. The raw search response is not stored.
3. Read the public job APIs. Seed boards come from `config/seed-companies.json` plus `config/seed-companies-pl.json` (checked 2026-10-10). Allegro's SmartRecruiters board is turned off; Allegro jobs are read from careers.allegro.eu. Workday tenants are read from their career site's own job search (`/wday/cxs/`), the sitemap being the fallback.
4. Normalize title, location, workplace, and salary text, dedupe, and score. The score is deterministic. A model may explain it and cannot change the number.
5. Save the run. Running the same search again marks offers that were not in the previous succeeded run.

Between searches the same worker indexes the full allowed catalog: one request per second per host, at most 200 detail pages per host per day, and a daily refresh. An unfinished career site stays next until that daily cap, so large employers backfill over several days.

## Crawler rules

The crawler sends `NewRoleBot/0.1` (robots.txt rules for its earlier names, `NowaRolaBot` and `JobscannerBot`, still apply) with a link to [`/bot`](../../resume-engine-optimization/src/app/bot/page.tsx) on `APP_URL`, which says how a site opts out, waits at least 1 second between requests to a host (longer when robots.txt sets a Crawl-delay), fetches at most 200 job pages per host per day, refreshes sitemaps daily, and honors robots.txt. Stored text is a short excerpt plus the canonical link. When a person tailors a CV to an offer, or `job_get` is called with `fullText`, the whole text of that one offer is read under the same rules, held in memory for 15 minutes, and not stored ([product/plan-p0.md](../../resume-engine-optimization/docs/product/plan-p0.md)). Recruiter names, emails, and phone numbers are dropped. Pages that opt out of AI input or training, or reserve text-and-data mining, are scored with the rules and are not sent to the model. Logins and bot walls are not bypassed.

Watched companies (added in the app or by Claude through MCP) follow the same rules: source policy, robots.txt, 1 second per host, 200 detail pages per host per day, and no aggregators or LinkedIn. Resolving a new company reads at most 8 pages.

## Verified read APIs

All unauthenticated GETs:

- **Greenhouse** Job Board API, list without `content=true`, detail with `pay_transparency=true`. Greenhouse EU (`boards-api.eu.greenhouse.io`) was unreachable on the check date and is not called
- **Lever** Postings API (`mode=json`). Boards marked `eu:` try `api.eu.lever.co` first (XTB, OLX). A 404 on the preferred host tries the other host once
- **Ashby** public job posting API (`includeCompensation=true`, `workplaceType` over `isRemote`)
- **Workable** widget API on `apply.workable.com` (`details=true`). An empty `jobs` array is not a real board
- **SmartRecruiters** Posting API, filtered with `country=pl` and `locationType=REMOTE`, paginated. `totalFound: 0` is not a real company. Off by default, because robots.txt on `api.smartrecruiters.com` disallows other crawlers; `SMARTRECRUITERS_POSTING_API=on` turns it on
- **Teamtailor** public RSS (`/jobs.rss`, with `offset` and `per_page`). A slug that already contains a dot is a custom domain
- **Recruitee** `GET /api/offers/`. Open without a token until 10 February 2027. After that, or on HTTP 401, the board is skipped. Set `RECRUITEE_CAREERS_TOKEN` (`X-Careers-Sites-Token`)
- **Personio** public XML (`/xml?language=en`, `.jobs.personio.de` then `.com`). A tenant that turned the XML feed off is read from its career page's own `search.json` where robots.txt allows it (Live Nation, equipme and Probonio answered 404 on `/xml` and 200 on `/search.json`, 2026-11-03); it gives offices by city and no description
- **Traffit** public API (`/public/job_posts/published`, page headers). Awarded posts are skipped
- **Pinpoint** `postings.json`. Every slug is identity-checked against `job.division.name` and the posting text. The hostname is not identity
- **Breezy** `/json` and **BambooHR** `/careers/list`, included so the verified Boldare and Miquido boards can be read. Both feeds are undocumented

A board is kept only when it has jobs and, where the payload includes one, a company name. Slugs that belonged to the wrong company on the check date are in `src/server/adapters/blocked.ts` and are never used.

## Employer career sites

Company career pages may be read for schema.org `JobPosting` JSON-LD. Enterprise career sites follow [`sources/enterprise-ats-legal.md`](../packages/job-index/sources/enterprise-ats-legal.md) and [`sources/link-only-alternatives.md`](../packages/job-index/sources/link-only-alternatives.md) (10 October 2026):

- **SuccessFactors** employer sites such as jobs.gft.com and careers.allegro.eu are read from the sitemap and job-page microdata. The legacy Allegro host career55.sapsf.eu stays link-only
- **Workday** tenants are read from the career site's own job search, `/wday/cxs/`, which robots.txt on Workday hosts allows (they disallow only `/refreshFacet/`; intive, motorolasolutions, accenture checked 2026-11-03). The search gives 20 postings a page and stops at 2,000 results, so a larger tenant is read in slices by its country facet (then area of work or city), which also places postings listed as "2 Locations". The sitemap, which stops at 100 URLs, is the fallback. `WORKDAY_CXS_MAX_REQUESTS` (default 5,000) caps one read; a read that does not reach every posting closes nothing
- Phenom on employer domains, Avature RSS, eRecruiter employer pages, and Jobvite are allowed with the same limits. **iCIMS** is link-only: its terms ban robots
- Callstack is the Recruitee board `callstackpl`. Grupa Pracuj is the published `jobs.feed.json` feed. Sii, Żabka, Bolt, Comarch, EPAM, and Brand24 are employer-domain sitemaps or listings
- Wirtualna Polska and Packhelp are listing-only: titles and links are stored, detail pages are not fetched. Synerise job pages come from web search plus JSON-LD, because `/api/` is disallowed
- jobs.sap.com, Oracle Recruiting (including Nokia), Taleo, careers.phenom.com, Siemens job pages, HiBob, Dynatrace, Codility, Oviva, Revolut, Future Processing, Saleor, Billtech, and JPMorganChase stay link-only

Details and the probe scripts are in [`sources/`](../packages/job-index/sources) (`source-pack.md`, `source-pack-pl.md`, `enterprise-ats-legal.md`, `link-only-alternatives.md`).

## Matching

The [`@newrole/matching`](../../resume-engine-optimization/packages/matching) package is the search-intelligence pack: query expansion, normalization, dedupe, explainable scoring, and match explanation. The app calls it from the worker.

Scoring weights, locked in by the fixture tests: title 30, seniority 15, location 25, salary 15, freshness 10, source 5. Salary is compared as monthly PLN on a B2B net-of-VAT basis (UoP gross × 1.25). Exchange rates come from NBP table A (mid rates, read every 12 hours per process, `src/server/fx/nbp.ts`); before the first read, or with `NBP_RATES=off`, the defaults in `apps/resume-engine-optimization/packages/matching/config.ts` apply, and `FX_*_PLN` wins over both. An offer posted more than a year ago, by the source's own date, loses 10 points in both the search score and the For you feed.

The neutral live profile is: salary floor 1 PLN, every contract type accepted, and the country the search names (else `MATCH_HOME_COUNTRY`, PL). Remote counts in the regions that cover that country plus WORLD (for Poland: PL, EU, EMEA, WORLD). In the home country, home city Warsaw and the main Polish cities count for hybrid and on-site; in another country the country itself is what counts. Seniority is a window around the expanded role.

When a signed-in profile exists, ranking stays on top of the query. The relevance floor (40) still applies first. Salary is compared with the profile floor and target. Offers without a salary stay visible and are labeled "salary not disclosed". Offers clearly below the floor drop in score and remain listed. Industry is extracted per posting (model, validated, cached, with a keyword fallback). Same and adjacent industries score higher; unknown is neutral; a different industry is a mild penalty, stronger only when the posting requires that domain. The profile preference is stick, prefer (default), or any. None of those modes hide an offer. A rejected offer lowers similar titles a little, at most 8 points, without changing the matcher.

This is not legal advice.
