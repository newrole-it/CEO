# Jobscanner source pack: Polish coverage add-on

Checked 2026-10-10 (times in Europe/Warsaw). This file extends `source-pack.md` (§1–§5); `source-pack.md` §6 points here.
Seed list: `seed-companies-pl.json`. Scripts: `scripts/ats_pl.py` (fetchers), `scripts/detect_ats.py` + `detect_ats2.py` (find the ATS from careers-page HTML), `scripts/candidates_pl.py` + `verify_pl.py` (probe slugs), `scripts/build_seed_pl.py` (re-fetch and build the seed).
Rule: **UNVERIFIED** = I couldn't confirm it from official docs or a live call.

## 1. ATS feeds: summary

| ATS | Public list endpoint (live-tested) | Key needed? | Official doc? | Terms / limits red flags |
|---|---|---|---|---|
| Teamtailor | `https://{slug}.teamtailor.com/jobs.rss` (+ `jobs.json` JSON Feed), also on custom domains | **No** for RSS/JSON feed. The REST API (`api.teamtailor.com/v1`) **needs a key** | RSS: yes. API: yes | API: 50 req / 10 s. robots.txt sets `Content-Signal: search=yes, ai-train=no, ai-input=yes` |
| Recruitee | `https://{slug}.recruitee.com/api/offers/` (also on custom domains) | No today. **Token required from 10 Feb 2027** | Yes | **Red flag:** after 2027-02-10, calls without `X-Careers-Sites-Token` get 401, and only the employer can issue that token |
| Personio | `https://{slug}.jobs.personio.de/xml?language=en` (`.com` works too) | No ("you don't need credentials") | Yes | Must be enabled by the employer; Personio suggests syncing hourly |
| Traffit (PL) | `https://{slug}.traffit.com/public/job_posts/published` + `X-Request-Page-Size`/`X-Request-Current-Page` headers | No | Yes | "Public API… free and available in every plan". robots.txt not served (returns HTML) |
| Breezy HR | `https://{slug}.breezy.hr/json` | No | **UNVERIFIED** (Breezy only documents the authenticated `api.breezy.hr/v3`) | Undocumented endpoint. No description in the list |
| BambooHR | `https://{slug}.bamboohr.com/careers/list` (+ `/careers/{id}/detail`) | No | **UNVERIFIED** (undocumented; the official API needs a key) | Undocumented. List has no date or description |
| Pinpoint | `https://{slug}.pinpointhq.com/postings.json` | No | Yes ("can be fetched client side with no CORS issues") | Unknown subdomains sometimes return other or demo boards, so check identity |
| Workday | `POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` with `{"limit":20,"offset":0,"appliedFacets":{},"searchText":""}` | No | **No** (undocumented internal endpoint) | **Corrected 2026-10-10:** workday.com's own terms ban scraping of Workday's sites. Tenant career sites do not reference those terms. robots.txt allows public job pages and declares a sitemap (`Allow: /Intive/`, `Disallow: /refreshFacet/`). Use the sitemap and JSON-LD. Use cxs only when the sitemap is capped. See sources/enterprise-ats-legal.md. |
| Lever EU | `https://api.eu.lever.co/v0/postings/{slug}?mode=json` | No | Same as Lever (§1 of source-pack.md) | Same as Lever. **Some boards answer only on the EU host** (XTB, OLX) |
| Greenhouse EU | `https://boards-api.eu.greenhouse.io/v1/boards/{token}/jobs` | No (per third-party docs) | **UNVERIFIED**: unreachable from the box (TLS hang), and WebFetch got 500 | Boards on `job-boards.eu.greenhouse.io` (e.g. Ramp Network) can't be checked through the US host |
| eRecruiter (Grupa Pracuj, PL) | none public. XML feed is "in your Account Settings… The Account Administrator has access" | Employer-only | Yes (help centre) | No public feed. Offers sit on the employer's site or `skk.erecruiter.pl` (robots.txt 404). Use JSON-LD or search |
| HRlink (Grupa Pracuj, PL) | none public. "W ramach indywidualnych wdrożeń… dostosowujemy posiadane API" | Per-customer | Marketing page only | No public API. Footer says "HRlink Sp. z o. o. **w likwidacji**" (company in liquidation) |
| Jobvite | `api.jobvite.com/v1/jobFeed?api=KEY&sc=SECRET&companyId=…` (search result, not live-tested) | **Yes** (employer credentials) | Yes (help centre) | Not usable without the employer's key |
| HiBob, PeopleForce, SAP SuccessFactors, Oracle Recruiting | none found (HiBob `/api/job-ad` → 401. PeopleForce = HTML only) | n/a | n/a | Unsupported. Use search + JSON-LD |

Note: `api.erecruiter.net` (GET `Api/PublishedJobs`) belongs to the **Austrian** eRecruiter GmbH product, not Polish eRecruiter.pl, and is authenticated. Don't mix them up.

## 2. Per-ATS details and field mapping

Normalized schema: title, location, remote, department, employment_type, posted_at, apply_url, description.

### 2.1 Teamtailor
- Docs: https://support.teamtailor.com/en/articles/11171756-rss-feed-how-to-guide (RSS: "add '.rss'"; first 100 jobs by default; `offset` and `per_page` params). API: https://docs.teamtailor.com / https://support.teamtailor.com/en/articles/5963369-use-our-teamtailor-api (key from Settings → Integrations → API keys, Company Admin only; `Authorization: Token token=…`; regional hosts api / api.na / api.au; 50 requests per 10 s).
- Live: `silenteight.teamtailor.com/jobs.rss` → 200 `application/rss+xml`. `jobs.json` → 200 `application/feed+json` (JSON Feed 1.1 with an embedded schema.org `_jobposting`). Custom domains work too: `careers.spacelift.io/jobs.rss`, `careers.spyro-soft.com/jobs.rss` (121 jobs). Unknown slug → 404.
- Mapping (RSS item): title=`title`; location=`tt:locations/tt:location/{tt:city,tt:country}`; remote=`remoteStatus` (`fully` / `hybrid` / `none`, seen live); department=`tt:department`; employment_type = not in RSS (JSON Feed `_jobposting` may include `employmentType`); posted_at=`pubDate`; apply_url=`link` (apply flow is on the page); description=`description` (HTML). Also `tt:role`, `guid`.

### 2.2 Recruitee (Tellent)
- Docs: https://docs.recruitee.com/reference/offers ("Returns a collection of published company jobs"; filters `department`, `tag`). https://docs.recruitee.com/reference/authentication-1.md: "**Deadline for introducing the token to calls is 10 February 2027**. Calls without the authorization header will return the 401 Unauthorized error". Header `X-Careers-Sites-Token`. "The XML offer feed and jobs widget are not covered by the Careers API token" (XML feed is for job-board partners: https://docs.recruitee.com/docs/feed.md, not tested).
- Live: `huuuge.recruitee.com/api/offers/` → 200 JSON `{"offers":[…]}` with no auth. Custom domains (`career.tensquaregames.com/api/offers/`, `jobs.appunite.com/api/offers/`) work. Unknown slug → 404 `{"error":"Not Found"}`.
- Mapping: title=`title`; location=`location` (+ `city`, `country`, `locations[]`); remote=`remote` (also `hybrid`, `on_site` booleans); department=`department`; employment_type=`employment_type_code` (e.g. `fulltime_permanent`); posted_at=`published_at`; apply_url=`careers_apply_url` (page = `careers_url`); description=`description` + `requirements` (HTML). Also `salary{min,max,currency,period}`, `experience_code`, `company_name`.

### 2.3 Personio
- Docs: https://developer.personio.de/v1.0/reference/get_xml (`https://{YOUR_COMPANY}.jobs.personio.de/xml`, `?language=de|en|fr|es|nl|it|pt`). https://developer.personio.de/docs/retrieving-open-job-positions (element list). FAQ: https://support.personio.de/hc/en-us/articles/29375445597725 ("No, you don't need credentials"; "We recommend syncing… at least once every hour"; the employer must enable it under Settings > Recruiting > Career Page).
- Live: `vodeno.jobs.personio.de/xml` and `.jobs.personio.com/xml` → 200 `text/xml`, root `<workzag-jobs>`. Unknown slug → 404. robots.txt `Allow: /`.
- Mapping: title=`name`; location=`office` (+ `additionalOffices/office`); remote = not a field (infer from office text, e.g. "Poland (remote)"); department=`department`; employment_type=`employmentType` (permanent / intern / trainee / freelance) + `schedule` (full-time / part-time); posted_at=`createdAt`; apply_url=`https://{slug}.jobs.personio.de/job/{id}` (pattern **UNVERIFIED**, not opened); description=`jobDescriptions/jobDescription/{name,value}` (HTML CDATA). Also `seniority`, `yearsOfExperience`, `recruitingCategory`.

### 2.4 Traffit
- Docs: https://api.traffit.com/ ("GET https://<your_traffit_name>.traffit.com/public/job_posts/published"; headers `X-Request-Page-Size` (default max 10), `X-Request-Current-Page`, `X-Request-Filter`, `X-Request-Sort`). https://knowledge.traffit.com/en/articles/9538662-public-integration-api-in-traffit ("Public API allows you to download advertisements published on the Career Page… free and available in every plan").
- Live: survicate, vercom, stxnext and 14 more → 200 JSON array. Response headers `x-result-total-count`, `x-result-total-pages`. Unknown slug → 503 HTML.
- Mapping: title=`advert.name`; location=`advert.locations[].locality` (or JSON in `advert.values[field_id=geolocation]`; some tenants leave it empty and put the location in the text); remote = not a field (infer from text); department = not standard (tenant custom `field_id` hashes); employment_type = not standard (often only in title or text, e.g. "B2B"); posted_at=`valid_start`; apply_url=`application_form` (page=`url`); description=`advert.values[field_id in description, requirements, responsibilities, benefits]` (HTML). Skip `awarded=true`.

### 2.5 Breezy HR
- Docs: the official API is authenticated (https://developer.breezy.hr/reference/listpositions, `api.breezy.hr/v3/company/{id}/positions`). `/json` isn't in Breezy docs (**UNVERIFIED** officially).
- Live: `boldare.breezy.hr/json` → 200 JSON array. Unknown slug → 404 (a third-party note says it's sometimes 403).
- Mapping: title=`name`; location=`location.name` (+ `city`, `country`, `locations[]`); remote=`location.is_remote`; department=`department`; employment_type=`type.name`; posted_at=`published_date`; apply_url=`url`; description = **not in list** (fetch the position page or its JSON-LD); salary=`salary`.

### 2.6 BambooHR
- Docs: **UNVERIFIED** (no official doc for `/careers/list`; official API needs a key).
- Live: `miquido.bamboohr.com/careers/list` → 200 `{"result":[…]}`. `/careers/{id}/detail` → `result.jobOpening` incl. `datePosted`, `description`. Unknown slug → 302.
- Mapping: title=`jobOpeningName`; location=`location.{city,state}` / `atsLocation`; remote=`isRemote` / `locationType`; department=`departmentLabel`; employment_type=`employmentStatusLabel`; posted_at = detail `datePosted`; apply_url=`https://{slug}.bamboohr.com/careers/{id}` (= detail `jobOpeningShareUrl`); description = detail `description`.

### 2.7 Pinpoint
- Docs: https://developers.pinpointhq.com/docs/jobs-json-endpoint (`postings.json` replaces `jobs.json`; filters `department_id`, `location_id`, `division_id`, `location_city_state_name`; locale prefix e.g. `/fr/postings.json`).
- Live: `workwithus.pinpointhq.com/postings.json` → 200 `{"data":[…]}`. **Caution:** guessed slugs (`callstack`, `swmansion`, `silenteight`, `kiwi`, `samsung`, `codility`) all answered with unrelated or demo boards (same "Head of DEI" jobs), so **never trust a Pinpoint slug without an identity check**.
- Mapping: title=`title`; location=`location.name`; remote=`workplace_type` (`remote` / …) or `workplace_type_text`; department=`job.department.name` (older shape: `department.name`); employment_type=`employment_type`; posted_at = not in feed (**UNVERIFIED**); apply_url=`url`; description=`description` + `key_responsibilities` + `skills_knowledge_expertise` (HTML); pay=`compensation_*` when `compensation_visible`.

### 2.8 Workday (cxs)
- Docs: none official. Terms: https://www.workday.com/en-us/legal/site-terms.html (Last Updated 08/13/2026), quoted in the table above.
- Live: intive (13), motorolasolutions/Careers (903), mastercard/CorporateCareers (1110), visa/Visa (816), sec/Samsung_Careers (675), thomsonreuters/External_Career_Site (451) → 200 JSON `{total, jobPostings[], facets[]}`. `searchText:"Poland"` narrows on the server (Motorola 75, Mastercard 19, Visa 13).
- Mapping (list): title=`title`; location=`locationsText`; remote = infer from `locationsText` (e.g. "Remote: Poland"); department = facet `jobFamilies` only; employment_type = facet `timeType`; posted_at=`postedOn` (relative text, "Posted 2 Days Ago"); apply_url=`https://{tenant}.wd{N}.myworkdayjobs.com/{site}{externalPath}`; description = detail `GET …/wday/cxs/{tenant}/{site}{externalPath}` → `jobPostingInfo.jobDescription` (**UNVERIFIED**, not called).
- Recommendation: low-frequency use only, for a handful of big PL-hub employers, respecting robots.txt. Or rely on search plus the tenant sitemap (`/{site}/siteMap.xml` is listed in robots.txt).

### 2.9 eRecruiter / HRlink / Jobvite / HiBob / PeopleForce / SuccessFactors
- eRecruiter: https://pomoc.erecruiter.pl/en/articles/9357550 lists 4 integration types (Career Sites Builder, Career Site PRO, JS widget, XML file copied by the account admin). No public feed. Synerise job pages carry schema.org JobPosting JSON-LD, so the JSON-LD fallback applies.
- HRlink: https://www.hrlink.pl/funkcje/api-hrlinkpl/ (custom per-client API). No HRlink tenants found among the 100+ PL companies scanned.
- Jobvite: key + secret + companyId needed. No PL tenant found.
- HiBob (Codility), PeopleForce (Packhelp), SAP SuccessFactors (Allegro, `career55.sapsf.eu`), Oracle Recruiting (Nokia): no public feed verified. Treat them as search + JSON-LD sources.

**Corrected 2026-10-10 (link-only-alternatives.md).** PeopleForce tenants (`*.peopleforce.io`) send `User-agent: *` / `Disallow: /`. They are link-only. Use the employer's own listing page. Allegro's jobs are on `careers.allegro.eu` (Career Site Builder, 288 jobs, allowed with limits). `career55.sapsf.eu` stays link-only. Nokia's Oracle sitemap exists at `/sitemaps/sitemapIndex` and stays link-only because of the Oracle terms. Callstack is Recruitee `callstackpl`. Grupa Pracuj publishes `https://www.pracujwgp.pl/jobs.feed.json`.

## 3. Seed list (`seed-companies-pl.json`)
- 52 verified boards (HTTP 200, parseable, ≥1 open job, identity checked), 13 feed types. By `ats`: traffit 17, recruitee 7, teamtailor 6, workday 6, lever 3, lever_eu 2, smartrecruiters 3, ashby 2, greenhouse 2, breezy 1, personio 1, workable 1, bamboohr 1.
- Measured: 560 Poland-located jobs across the 52. PL engineering-leadership title hits at check (7 companies): Boldare, STX Next, Spyrosoft, InPost, Billennium, ICEYE, Visa. 0 EU-remote leadership hits.
- `flagged_not_used`: Ramp Network (GH EU, 0 openings), Livespace (0), Software Mansion (0), 10Clouds (0), Sunscrapers (Workable 404), Omnisend (0 PL jobs).
- `already_in_seed_companies_json`: 56 main-seed companies with ≥1 PL-located job (e.g. Netguru, Docplanner, CD PROJEKT RED, Booksy, ElevenLabs, Zowie, Text, Monterail, Tooploox). Not duplicated.
- `corrections_to_seed_companies_json`: **Allegro** SmartRecruiters entry set to `verified=false`. Its only posting says "We have switched to SAP Harmony - SmartRecruiters will be decommissioned till the end of the year", and jobs.allegro.eu links SAP SuccessFactors. Brainly's Ashby board holds only a placeholder posting.
- `unsupported_or_unresolved`: Allegro, Revolut, Synerise, Codility, Packhelp, WP, Grupa Pracuj, Żabka, Sii, Comarch, Brand24, Future Processing, Dynatrace, Nokia, EPAM, Bolt, Grid Dynamics, Callstack, Saleor, Billtech, and others (details in the JSON).
- Caveats: Traffit and Workday PL counts depend on location text quality. The leadership regex now includes "Delivery Manager" / "Engineering Lead", which is looser than the main seed. Workday leadership scan covers only the first 20 Poland-search results.

## 4. Discovery templates for the new hosts (NOT yet tested with a search API, UNVERIFIED hit quality)
- `site:teamtailor.com "Engineering Manager" (Poland OR Warszawa OR Kraków OR Wrocław)` (misses custom domains like careers.spyro-soft.com)
- `site:recruitee.com ("Head of Engineering" OR "Engineering Manager") Poland`
- `site:jobs.personio.de OR site:jobs.personio.com "Engineering Manager" Polen OR Poland`
- `site:traffit.com ("Engineering Manager" OR "Kierownik" OR "Head of")`
- `site:breezy.hr "Engineering Manager" Poland`, `site:jobs.eu.lever.co "Engineering Manager"`, `site:job-boards.eu.greenhouse.io "Poland"`
- `site:myworkdayjobs.com "Engineering Manager" Poland` (then call cxs sparingly or just link out)

## 5. Channel check, 2026-10-10

See `link-only-alternatives.md`. Seeded channels: Allegro `careers.allegro.eu` (allowed with limits, 288 jobs), Callstack Recruitee `callstackpl` (allowed), Grupa Pracuj `jobs.feed.json` (allowed), Sii, Żabka, Bolt, Comarch, EPAM, Brand24 (allowed with limits), Wirtualna Polska and Packhelp (listing only, details link out), Synerise (search plus JSON-LD; `/api/` disallowed). EPAM `openJobsAtCheck` is 225, not the sitemap's 4,298. Nokia, Dynatrace, Codility, Oviva, Revolut, Future Processing, Saleor, Billtech, and JPMorganChase stay link-only. SmartRecruiters Posting API stays on via `SMARTRECRUITERS_POSTING_API` (default on) until that robots decision is made.
