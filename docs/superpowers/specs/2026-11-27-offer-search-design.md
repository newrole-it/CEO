# Find offers: a web search for offers that fit the person

Date: 2026-11-27. Status: waiting for the owner's approval. Owner's choices: results as a list to review (A), full
evaluation of every result (1), score readings that came only partly (1a), weigh against the
search's filters (2a).

Paths below are relative to `apps/resume-engine-optimization/` unless they start with `packages/`
(then `apps/resume-engine-optimization/packages/`).

## Intent

Today an offer gets into newrole.it only when the person brings its link (Add offer, the Chrome
extension, an application). The owner wants newrole.it to go and find offers for them: build a
picture of who they are and what they want from their profile, show it as search filters they can
correct, and on "Szukaj" have the local Claude Code search the web and come back with about 15
offers. The list must be genuinely good: every offer on it checked against the person's CV and
their requirements (pay, work mode, level), not just "something the model found".

## Goals

- One page where the person sees filters proposed from their profile, edits them and clicks
  "Szukaj" (Search). Nothing goes to the web before that click.
- About 15 offers per search, each a real, open posting that newrole.it read itself, sorted by how
  well it fits.
- Fit is the existing "Is it worth applying" evaluation (`src/server/evaluation/service.ts`,
  `packages/cv-core/src/evaluation.ts`), weighed against the filters the person accepted for this
  search (owner's choice 2a). Its dimensions, score, decision and reasons are those the offer's
  page shows; only the person's side (level, pay floor, work mode, places) comes from the filters.
- The person reviews the list: "Add" puts an offer into Offers (it arrives already evaluated);
  "Dismiss" hides it, and later searches do not bring it back.

## Non-goals

- No automatic adding to Offers. Owner's choice: results are a list to review (option A).
- No scheduled or recurring searches, no alerts. One search runs when the person clicks.
- No MCP tool for it in this change.
- No crawling of job boards: the web search finds links; newrole.it reads each found link once,
  as it reads a link the person pastes.
- Not available without Claude Code (`llmProvider() !== "claude-cli"`): the page says so. The
  OpenAI-compatible client has no tools (`src/server/research/service.ts`, `defaultWebRun`).

## Anti-goals (it would fail even if it technically works)

- An offer, company, link, salary or reason on the list that comes from the model's say-so rather
  than from the posting newrole.it read or from the evaluation's code. The web step's model
  proposes links and nothing else it says is shown. Company, title and place read from an employer
  page by `extractJobByModel` come from that page's text, and carry a "read by the model" mark.
- The person's CV, name or profile text in the run that can search and open the web. The existing
  rule (`packages/cv-engine/src/research.ts`): "a run that can open addresses must hold nothing
  worth sending to one". Only the accepted filters go there.
- A list padded to 15 with offers that do not fit. Fewer good offers beat 15 mixed ones; the page
  says how many were found, how many were dropped and why.
- A made-up score for an offer that could not be read: such an offer has no score and says why.

## Constraints (checked in the code for this design)

- Headless Claude with web tools exists: `runClaudePrompt` (`packages/llm/src/claude-cli.ts`) with
  `allowedTools`, `maxTurns`, `timeoutMs`, `purpose` (logged to the AI usage tab, which already
  counts `webSearches`). The company brief uses it with a cap of 5 searches
  (`WEB_SEARCH_CAP`, `packages/cv-engine/src/research.ts`) and 150 s a step. Concurrency is limited
  by `CLAUDE_CLI_MAX_CONCURRENT`, default 2.
- The profile holds what filters need: `CandidateProfile` (`db/schema.prisma`): `currentTitle`,
  `pastTitles`, `seniority`, `yearsExperience`, `skills`, `industries`, `industryMode`,
  `locations`, `homeCity`, `relocation`, `remotePreference`, `languages`, `salaryFloor`,
  `salaryTarget`, `salaryCurrency`, `salaryPeriod`, `salaryContract`, `contracts`.
- Reading a link: `readOffer` (`src/server/applications/read-offer.ts`) reads a posting (the ATS's
  API, JobPosting, or the page's text), ingests it into the shared `Job` index and returns facts
  read from the page. Job boards and LinkedIn are read for the person only, kept in memory and
  never stored (`readOnlyWhenTailoring`, `src/server/offers/service.ts`).
- `evaluateOffer(userId, jobId, { locale, onStep })` needs the offer in the `Job` index, reads its
  text live (`loadTailorJob`), runs two model steps (reading the offer, checking the CV) and keeps
  one `OfferEvaluation` per person and offer. Without the offer's text the requirements, and so
  the overall score, are unknown (`RequirementsReason`).
- `keepOffer(userId, jobId)` is what puts an offer into the person's Offers list.
- Background work: `BackgroundTask` rows claimed by the in-server loop
  (`src/server/queue/worker.ts`), which runs only the types in `APP_TASKS`
  (`src/server/queue/enqueue.ts`) and one task at a time (`workOnce`), so a long task there would
  hold up the Google Sheet mirror. The offer index (`@newrole/job-index`) may run on the same
  database with its own task types.
- `readOffer` gives a `jobId` only on the ATS API / JobPosting path. An employer page without
  JobPosting is read by `extractJobByModel` (a model call, purpose `job-extract`) and a job board
  or LinkedIn page by `readBoard` (company, title, place; no pay; a daily detail-page cap per host,
  `takeDetailSlot`); both return `jobId: null`. Today such a reading becomes a `Job` only when the
  person confirms the draft (`confirmOffer` → `ingestOfferPayload`, a `WEB_SEARCH` offer).
- `evaluateOffer` takes the person's side from `CandidateProfile` (`personOf`), and always reads
  the offer's text live through `loadTailorJob`.
- `OfferOutcome` (`src/server/applications/types.ts`) is `read | partial | link-only |
unreadable`: there is no "closed" outcome. Only a `Job` already in the index can say `CLOSED`.
- `LlmCall` holds counts only, with no user and no link to what a run was for.
- The schema already has `SavedSearch`, `SearchRun`, `JobMatch`. They belong to the offer index;
  this app only deletes them on erase. Not reused here (see Approaches).
- Database rules (AGENTS.md): the migration only adds; it is applied with `npm run db:deploy`
  after a `pg_dump` and row counts.
- Interface text: a new `src/app/i18n/copy-search.ts`, Polish first, every key in every language;
  the model prompt in English, naming the output language. The privacy page's LLM paragraph
  (`src/app/i18n/copy-privacy.ts`) must say what this feature sends.

## Approaches considered

How fit is judged (owner picked 1):

1. **Full evaluation of every result.** Read each link, drop clear misfits by rules, run the
   existing evaluation on the rest, sort by its score. Best list, same numbers as the offer page;
   costs two model steps per offer, so a search takes longer and results arrive one by one.
2. Rules only (level, pay, work mode, freshness, skill words). Fast, but the requirements, 45 % of
   the evaluation, become weak keyword overlap.
3. Rules on the list, full evaluation on click. Cheap, but the list is not good until clicked.

What happens with results (owner picked A):

- **A. A list to review**, Add / Dismiss per offer. Offers holds only what the person chose.
- B. Everything straight into Offers. Floods the list with things they did not pick.

Where searches and results are stored (my call):

- **New tables of our own** (`OfferSearch`, `OfferSearchResult`). Chosen.
- Reusing `SavedSearch`/`SearchRun`/`JobMatch`: they belong to the offer index, which may run on
  the same database and act on active `SavedSearch` rows (crawling); their columns describe board
  crawling (`discoveredBoards`, `fetchedJobs`) and lack pay and contract filters. Rejected.

## The design

### 1. Where it lives

A page `/offers/search` ("Znajdź oferty" / "Find offers"), reached by a button on the Offers page
next to Add offer. My call: it is a way of getting offers, so it belongs under Offers, not as a new
top-level tab.

### 2. The proposed filters (no model)

Built by code from `CandidateProfile` when the page opens; nothing is sent anywhere:

| Filter            | From the profile                                                  | Editable as                                            |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| Roles             | `currentTitle`, then `pastTitles` (at most 3)                     | list of titles                                         |
| Level             | `seniority`                                                       | one of the matching package's seniority values, or any |
| Key skills        | `skills`, first 8                                                 | list (must-have words for the search)                  |
| Excluded words    | empty                                                             | list                                                   |
| Places            | `homeCity`, `locations`; `relocation`                             | list of cities/countries                               |
| Work mode         | `remotePreference`                                                | remote / hybrid / on-site / any                        |
| Minimum pay       | `salaryFloor`, `salaryCurrency`, `salaryPeriod`, `salaryContract` | number, currency, period, contract                     |
| Contracts         | `contracts`                                                       | list                                                   |
| Industries        | `industries`, `industryMode`                                      | list, prefer/only                                      |
| Posting languages | `languages`                                                       | list                                                   |
| Freshness         | 30 days                                                           | 7 / 14 / 30 days                                       |

A field the profile does not have stays empty and is shown as "not set". If the profile is empty
the page points to /profile and the person can still fill the filters by hand. The person's last
accepted filters are kept (on `OfferSearch`) and offered next time instead of the profile's, with
a "from my profile again" link.

### 3. "Szukaj" starts a search in the background

The click stores an `OfferSearch` (the filters as accepted, status `queued`) and starts the search
in the server process, not in the `BackgroundTask` loop (my call: that loop runs one task at a time
and a search of several minutes would hold up the Sheet mirror). Its status and results are in the
database; the page polls them and shows results as they become ready, so closing the page does
not stop it. A search still `queued` or running when the server starts again is marked `failed`
with code `interrupted`. One search per person at a time; a second click while one runs shows the
running one.

When the accepted filters differ from the profile in level, pay, work mode or places, the page
offers "Also save to my profile" next to "Szukaj" (owner's choice 2a). It is off by default.

### 4. The web step: find candidates

One `runClaudePrompt` run, `purpose: "offer-search"`, on the writing model,
`allowedTools: ["WebSearch"]`. The prompt holds only the accepted filters and today's date. It
asks for up to 25 candidate postings as JSON: `url` and the filters it believes the posting meets,
and prefers employers' own career pages and ATS pages (Greenhouse, Lever, Workable, Teamtailor,
etc.) over aggregators. It holds no name, CV or profile text. Search cap: 12 searches (my call;
a constant next to `WEB_SEARCH_CAP`). Its reply is checked with zod; anything but URLs is ignored
for display.

Code then: normalizes and dedupes URLs (`urlKey`); drops URLs already in the person's offers or
applications, and those they dismissed in earlier searches.

### 5. Read every candidate

Each remaining URL goes through `readOffer` as the person's read (robots.txt, the site's opt-out,
one request a second per host, as when they paste a link). Company, title, place and pay shown on
the list come from this read, never from the web step.

Every reading with a company and a title gets a `Job` row, so it can be evaluated (owner's choice
1a): the ATS / JobPosting path has one already; an employer page read by `extractJobByModel` and
a job board or LinkedIn reading are stored through `ingestOfferPayload` as `WEB_SEARCH` offers,
as `confirmOffer` stores them, but without `keepOffer`: nothing enters the person's Offers until
they click Add. A job board's or LinkedIn's text is not stored (`readOnlyWhenTailoring`); the
evaluation reads it live. Facts that came from `extractJobByModel` carry a mark on the list:
"read by the model from the page" (stored as a code on the result). The employer-page reading is a
model call; it is logged as `job-extract` as it is today.

Outcomes:

- read: goes on;
- the `Job` is known to be `CLOSED`: dropped (counted). My call: no new "closed" codes in
  `packages/ats` or `packages/offers` in this change, so a 404 or any other failure counts as
  unreadable;
- unreadable (login or bot wall, robots.txt, opt-out, the daily cap, any failure), or no company
  and title: kept, at the bottom, marked "could not be checked", no score, with the link.

### 6. Rules screen (no model)

Before any model step, drop what clearly does not fit the accepted filters, with the reason
counted: pay known and under the minimum (the evaluation's pay rule), work mode that contradicts
the filter, a level two or more steps from the filter, an excluded word in the title, a
publication date known and older than the freshness filter. A missing value never drops an offer.

### 7. Evaluate the rest

The evaluation of each survivor, in the person's interface language, through the CLI limiter, at
most 20 per search (my call; the rest are counted as "not evaluated: limit"). The person's side
(level, pay floor, work mode, places) is the accepted filters, not the profile (owner's choice
2a): `evaluateOffer` gets an optional person override in place of `personOf`. The result
(decision, score, the evaluation as shown) is kept on `OfferSearchResult`, not as the offer's
`OfferEvaluation`, because the offer page weighs against the profile.

On Add, the offer's `OfferEvaluation` is built against the profile from the same model reading
(`readOfferFit`'s result), by code, with no second model run; how that reading is kept between the
search and the click is the builder's. Results are sorted by decision (apply, consider, skip),
then score. The list keeps the best 15; the rest are counted as "found but weaker" and can be
shown with one click.

If fewer than 15 good offers remain, the list shows what there is. No second web round in this
change (my call; it doubles the cost of a search).

### 8. The list

Per offer: company, title, place, pay (as read), how old the posting is, the decision and score
with the evaluation's top reasons and gaps, the link. Buttons: Add (`keepOffer`; the row then
links to the offer's page) and Dismiss (kept on the result; never shown again). A header line
counts what was found, read, dropped and why. No cost on the page (my call: `LlmCall` has no link
to a search, and adding one would break its "no user" rule); the AI usage tab shows the runs under
`offer-search`, `job-extract` and the evaluation's purposes.

Text sketch:

```
Find offers                                     [Edit filters]
Senior Product Manager · Warszawa / remote · from 25 000 PLN B2B · 30 days
Found 23 · 4 closed · 3 under your minimum · 1 could not be checked · 15 shown

[Apply 78]  Acme · Senior Product Manager · Remote PL · 24–30k PLN B2B · 6 days
            Meets 9 of 11 requirements · gap: SQL
            [Add] [Dismiss] [Open posting ↗]
[Consider 56] ...
...
Could not be checked
            linkedin.com/jobs/view/... (login wall)          [Open ↗] [Dismiss]
```

### 9. Data (one additive migration)

- `OfferSearch`: id, userId (cascade), filters (Json), status (`queued | searching | reading |
evaluating | done | failed`), error code, counts (Json), createdAt, finishedAt.
- `OfferSearchResult`: id, searchId (cascade), userId, jobId (nullable: null when unreadable),
  url, outcome (`ok | closed | unreadable | screened-out | not-evaluated`), reason code,
  factsByModel (Boolean), decision, score, evaluation (Json), dismissedAt, addedAt;
  unique (searchId, url).

Codes, numbers and dates only; no formatted or translated text stored. Erasing the account or the
profile deletes them (`src/server/privacy/erase.ts`).

### 10. Without Claude Code, or when it fails

No `claude-cli` provider: the page shows the filters and a note that search needs Claude Code; no
button. A failed or timed-out web step: status `failed` with a code, translated on the page, and
the filters stay for a retry.

## Left to the builder

- Exact prompt wording, the JSON shape of the web step's reply, timeouts.
- How the rules screen reuses the evaluation's functions (`packages/cv-core/src/evaluation.ts`)
  versus small helpers of its own.
- The polling interval and the progress display.
- Component structure and styling, following the Offers page.
- How the evaluation's model reading is kept for Add (on the result, or in `LlmCache`).
- Tests: unit tests for filters-from-profile, the reply parser, dedupe and the rules screen; a flow
  test with an injected `runClaudePrompt`, `readOffer` and `llm`, on the test database.
