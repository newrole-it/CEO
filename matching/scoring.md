# Scoring spec (scoring-v1)

Code: `scoring.ts › scorePosting(posting, profile, now) → ScoreResult`; ranking: `rankPostings()`.
**Deterministic**: no LLM, no randomness, `now` is a parameter. Same inputs → same score, same reasons.
Posting text affects the score only through parsed structured fields and exclusion keywords — never through instructions inside it.

## Formula

```
score = round( title + gate × (seniority + location + salary + freshness + source) ) + penalties,  clamped 0..100
gate  = min(1, 0.4 + 0.75 × titleValue)          // title 0 → 0.4, 0.5 → 0.775, ≥ 0.8 → 1
```
Each component = `weight × value(0..1)` and emits a human-readable `reason`. Bands: **strong ≥ 80**, **good 60–79**, **weak 40–59**, **poor < 40**.
The gate stops "remote + fresh + well-paid" from lifting irrelevant roles (a Product Manager can't score above ~40) while staying explainable
(the result carries `gate.value` and `gate.reason`).

## Components

| id | weight | value rules |
|---|---|---|
| title | 30 | Best over `targetTitles` (tier weight 1) and `relatedTitles` (their weight). On `titleTokens` (PL→EN mapped): **exact** token-set match → 1.0 × w; **contains** (target phrase contiguous in title, ≤ 2 extra tokens, e.g. "Engineering Manager, Checkout") → 0.9 × w; **contains (specialised)** (target tokens present but split, e.g. "Head of *Data* Engineering") → 0.75 × w; **partial** → 0.7 × Dice(function tokens) × (0.6 if no shared level word) × w; else 0. |
| seniority | 15 | In profile range `[min,max]` → 1.0; 1 rank outside → 0.6; 2 → 0.25; ≥ 3 → 0; not detectable → 0.5. |
| location | 25 | remote & region accepted (or WORLD) → 1.0; remote, region unknown → 0.7; remote restricted elsewhere (e.g. US-only) → 0.1. hybrid in accepted city → 0.8; hybrid elsewhere in home country → 0.3; hybrid abroad → 0 (0.3 if relocationOk). on-site in accepted city → 0.6; on-site elsewhere in home country → 0.2; on-site abroad → 0 (0.2 if relocationOk). mode unknown: accepted city 0.6, home country 0.3, abroad 0.1, nothing stated 0.4. |
| salary | 15 | On monthly PLN B2B-net-equivalent (see normalization.md). Not disclosed → 0.5 (neutral). `lo ≥ floor` → 1.0; range straddles floor → 0.5 + 0.5 × (hi − floor)/(hi − lo); `hi < floor` → 0 at ≤ 70 % of floor, linear up to 0.4 just below floor. |
| freshness | 10 | days since `postedAt` (earliest across merged copies): ≤ 3 → 1.0; ≤ 7 → 0.85; ≤ 14 → 0.7; ≤ 30 → 0.4; ≤ 60 → 0.15; > 60 → 0; unknown → 0.3. |
| source | 5 | best source in the cluster: direct ATS/company 1.0; justjoin/nofluffjobs 0.9; pracuj 0.85; LinkedIn 0.7; generic web 0.5. |

## Penalties (applied after the weighted sum, each with a reason)

| id | effect | when |
|---|---|---|
| location_ineligible | −20 | location value ≤ 0.2 (remote restricted to a non-accepted region, on-site in a non-accepted city, on-site/hybrid abroad without relocation) |
| below_salary_floor | −15 | the top of the published range is below the floor |
| contract_not_accepted | −20 | every stated contract type is outside `acceptedContracts` (e.g. UZ) |
| excluded_description_keyword | −10 | description contains a `descriptionKeywords` entry (whole-word, diacritic-insensitive; no stemming — add inflected forms) |
| excluded_title | cap at 10 | title contains a `titleKeywords` entry (always recorded, even if already ≤ 10) |
| excluded_company | cap at 0 | company in `exclusions.companies` |

Flags (e.g. `suspected_prompt_injection`) are passed through and shown, **never** scored.

## Output

```ts
{ postingId, version: "scoring-v1", score, band, gate: { value, reason },
  components: [{ id, weight, value, points, reason }], penalties: [{ id, points, reason }], flags }
```
Store `version`, `cfg.fx.asOf` and the profile version with each score so rankings are reproducible.

## Worked examples (from `fixtures/`, profile = example profile, now = 2026-10-10)

**p01 Head of Engineering @ Northwind Ledger (Greenhouse, Remote EU, 32–40k PLN B2B) → 100 strong**
title 30/30 exact target · seniority 15/15 head ∈ manager–c_level · location 25/25 remote (EU) · salary 15/15 whole range ≥ 30k, reaches 40k target ·
freshness 10/10 (3 days, earliest of merged Greenhouse+LinkedIn copies) · source 5/5 direct ATS.

**p05 Engineering Manager @ Kestrel Mobility (Lever, Kraków hybrid, 22–28k PLN brutto UoP) → 77 good**
title 30 · seniority 15 · location 7.5/25 (hybrid in Kraków, not an accepted hybrid city) · salary 12.5/15 (UoP × 1.25 → 27.5–35k, straddles 30k: 0.5 + 0.5 × 5 000/7 500 = 0.83) ·
freshness 7/10 (9 days) · source 5 → 77.

**p06 VP of Engineering @ Orbitale Health (Ashby, Remote US-only, $180–220k/yr) → 56 weak**
title 30 · seniority 15 · location 2.5/25 (remote restricted to US) · salary 15 (≈59–72k PLN/month) · freshness 8.5 · source 5 = 76 → **location_ineligible −20** → 56.

**p08 Senior Software Engineer @ Pixelkraft (nofluffjobs, Remote PL) → 38 poor**
title 7.6/30 (partial, function overlap 0.67 with "Kierownik Zespołu Programistów", no shared level word: 0.7 × 0.67 × 0.6 × 0.9 = 0.25) →
gate 0.589 · seniority 2.2 (senior, 2 below range) · location 14.7 · salary 4.4 · freshness 5.9 · source 2.7 → 38.

**p13 Engineering Manager, Checkout @ Quokka Commerce (web, remote anywhere, injection text in description) → 84 strong**
Same score as the same posting with the injected paragraph removed (tested). `suspected_prompt_injection` flag shown; explanation prompt told to ignore it.

**p23 Interim Engineering Manager @ Rdest Digital (justjoin, 200 PLN/h umowa zlecenie) → 75 good**
title 27/30 (contains) · salary 15 (200 × 168 × 1.15 = 38 640) · … = 95 → **contract_not_accepted −20** → 75.

**p09 Senior Sales Engineer → 10 poor** (title exclusion "Sales Engineer", capped). **p10 Kierownik budowy → 0** (title exclusion, on-site Łódź, below floor, "plac budowy").

Full breakdown for all 21 unique postings: `fixtures/scored-output.txt` (regenerate: `npx tsx scripts/score-fixtures.ts --verbose`).

## Tuning notes
- Weights/penalties/gate are exported constants; change them together with `fixtures/postings.json` expectations (`npm test` will tell you what moved).
- Hard filters vs penalties: the MVP keeps everything visible but sorted; the UI can hide `poor` by default.
- When the person rates postings (👍/👎), log `(components, rating)`; later fit weights offline — keep the scorer deterministic.
