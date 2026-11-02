# Dedupe rules (v1)

Code: `dedupe.ts`. Run after normalization, before scoring: `dedupePostings(normalized) → { postings, merges }`.
Every merge is logged with the rule and detail (`merges[]`) so it can be audited/undone in the UI.

## 1. Exact keys (checked first, in this order)

1. **ATS key** (`extractAtsKey`) — stable per-source job id parsed from the URL (falls back to adapter-provided `atsJobId`):

| source | URL pattern | key |
|---|---|---|
| Greenhouse | `boards.greenhouse.io/{board}/jobs/{id}`, `job-boards.greenhouse.io/…`, any URL with `?gh_jid={id}` (embedded boards) | `greenhouse:{id}` (ids are global) |
| Lever | `jobs.lever.co/{company}/{uuid}` | `lever:{uuid}` |
| Ashby | `jobs.ashbyhq.com/{company}/{uuid}` | `ashby:{uuid}` |
| Workable | `apply.workable.com/{company}/j/{shortcode}` | `workable:{company}:{SHORTCODE}` |
| SmartRecruiters | `jobs.smartrecruiters.com/{Company}/{id}-{slug}` | `smartrecruiters:{id}` |
| Teamtailor | `{company}.teamtailor.com/jobs/{id}-{slug}` | `teamtailor:{company}:{id}` |
| justjoin.it | `/job-offer/{slug}` | `justjoin:{slug}` |
| nofluffjobs | `/job/{slug}` | `nofluffjobs:{slug}` |
| pracuj.pl | `…,oferta,{id}` | `pracuj:{id}` |
| LinkedIn | `/jobs/view/{slug-}{id}` | `linkedin:{id}` |
| Any other employer system (`company_site`: Traffit, SuccessFactors, career sites, …) | adapter-provided id | `company_site:{board}:{id}` (ids are only unique per employer) |

   The key comes from the URL, not from `source`, so a web-search hit pointing at a Teamtailor page dedupes with the Teamtailor adapter's record (fixture p24 → p11).
2. **Canonical URL** (`canonicalizeUrl`) — https, lowercase host, no `www.`, no fragment, tracking params removed (`utm_*`, `gh_src`, `lever-source/origin`,
   `source`, `src`, `ref`, `referrer`, `trk*`, `trackingId`, `refId`, `currentJobId`, `fbclid`, `gclid`, `mc_cid/eid`, `_hs*`, `campaign*`), remaining params sorted,
   trailing slash removed; LinkedIn reduced to `https://linkedin.com/jobs/view/{id}`.
3. **Fingerprint** — `fnv1a(companyNorm | sorted unique core-title tokens | seniority | locationBucket)`.
   - core-title tokens: `titleCore` + PL→EN token map (so `CTO (Chief Technology Officer)` ≡ `CTO`; level adjectives removed but **seniority kept separately**,
     so `Senior Engineering Manager` ≠ `Engineering Manager` at the same company).
   - `locationBucket`: `remote` (any remote without a city) | `city:{canonical city}` (first alphabetically) | `country:{cc}` | `unknown`.
     Remote *regions* are deliberately not in the bucket — boards disagree ("Remote" vs "Remote (EU)").
   - Use sha1 in Postgres if preferred; FNV-1a is used to stay dependency-free.

## 2. Near-duplicates (`compareForDuplicate`)

Only considered when **all** gates pass:
- company similarity: equal `companyNorm` or token Dice ≥ **0.80**;
- seniority equal (or one side unknown);
- `postedAt` within **45 days** (further apart = repost, kept as a separate record so freshness is honest);
- location compatible: same bucket, or one side `unknown`, or overlapping cities; `remote` vs a city only if description Jaccard ≥ **0.50**.

Then duplicate if:
- **near_title**: core-title token Dice ≥ **0.85**; or
- **near_description**: title Dice ≥ **0.60** and description 3-word-shingle Jaccard ≥ **0.80** (fixture p04 → p03: `Chief Technology Officer / CTO – Fintech` vs `CTO`, Dice 0.67, Jaccard 0.93).

Thresholds live in `DEDUPE_THRESHOLDS`. Pairs are clustered with union-find (transitive). The MVP does O(n²) per run; for large n block by `companyNorm` first.

## 3. Which record wins (`compareWinner`)

1. Source priority (`SOURCE_PRIORITY`): direct ATS / company site (0) > justjoin, nofluffjobs (1) > pracuj (2) > LinkedIn (3) > generic web (4).
2. Has a parsed salary.
3. Longer description.
4. Earlier `postedAt`.
5. `id` (lexicographic, for determinism).

## 4. Merge (`mergeGroup`)

- All fields from the winner, except:
- `salary`: winner's, else first salary found among the others (by priority);
- `location`: winner's unless its work mode is `unknown`, then the first known one;
- `postedAt`: **earliest** across the group (first seen anywhere);
- `sources`: union (used by the source-quality component and shown as "also on LinkedIn, justjoin");
- `mergedFrom`: ids of all absorbed records; `flags`: union (an injection attempt on any copy stays visible).

Keep the raw records in Postgres (`posting_raw`) and store the cluster (`posting_cluster(id, winner_id, member_ids, rule)`) so re-scoring never needs re-fetching.
