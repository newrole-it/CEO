# @newrole/matching

Matching layer for Jobscanner (Poland / Europe-Warsaw). Pure TypeScript + Zod: rules only, no model. The only I/O is reading NBP's exchange-rate table (`fx.ts`).
What it does: **normalize a posting (title, seniority, company, places, work mode, salary) → dedupe postings**.

The scorer, the matching pipeline, query expansion and match explanations (with their prompts, fixtures and tests) are used only by the offer index and live in the offer index, `@newrole/job-index` (apps/jobs-lab, `src/matching/`), which builds on this package.

> No existing Jobscanner code or specs were found under `/workspace/jobscanner` when this pack was written (only an empty `scripts/`),
> so the types in `types.ts` are proposals; the MVP should adopt them or map to its own names.

## Files

| path | what |
|---|---|
| `normalization.md` / `normalization.ts` | Title, seniority ladder, company, PL cities/countries, work mode (zdalnie/hybrydowo/stacjonarnie), salary parsing & conversion (PLN/EUR/USD, B2B/UoP/UZ/UoD, net/gross, h/day/month/year), injection heuristic |
| `places.ts` | Countries (249 ISO codes, Intl names in 8 languages + cited aliases), US/CA/AU subdivisions, city aliases, UN M49 remote regions (`regionCovers`, `remoteOpenTo`), the location matcher used by `normalizeLocation` |
| `config.ts` | FX placeholders, 168 h/month, 21 days, 12 months, contract→B2B-equivalent factors (all config) |
| `fx.ts`, `live-config.ts` | NBP table A rates into PLN, read every 12 hours (`ensureFxRates`); `liveMatchingConfig()` with those rates and the `FX_*_PLN` overrides |
| `dedupe.md` / `dedupe.ts` | ATS keys, canonical URLs, fingerprints, near-duplicate thresholds, merge winner rules |
| `types.ts` | Shared enums/schemas: `RawPosting`, `NormalizedPosting`, `MatchProfile`, `SalaryRange`, … |
| `text.ts` | Helpers: fold/diacritics, Dice, shingles, FNV |
| `test/matching.test.ts` | Normalization units: titles, seniority, company, locations and work modes, salaries, URLs and ATS keys |
| `test/places.test.ts` | Countries, subdivisions, cities, false-positive guards, remote regions and `remoteOpenTo` |
| `test/fx.test.ts` | Reading NBP table A |

## Use

```bash
# Dependencies (zod, tsx, typescript) are pinned to the same versions as the repo root and
# resolve from the root node_modules, so no install is needed inside this folder.
npm test                 # node:test via tsx (or: npm test -w @newrole/matching from the root)
npm run typecheck
```

```ts
import { normalizePosting } from "./normalization";
import { dedupePostings } from "./dedupe";
const { postings, merges } = dedupePostings(rawPostings.map((raw) => normalizePosting(raw)));
```

## Key design decisions
1. Normalization and dedupe are deterministic and unit-tested.
2. Salary compared on one basis — monthly PLN, B2B net-of-VAT equivalent — with every conversion step recorded as an assumption string.
3. Dedupe prefers direct ATS records, keeps the earliest postedAt and the union of sources; all merges logged with rule + detail.

## What each person sets
These come from the person's profile in the database, never from this pack (`MatchProfile` in `types.ts` is their shape):
- Salary floor and target (and in which basis — B2B net or UoP gross?).
- Accepted contracts (B2B only? UoP ok? foreign employment / EoR?).
- Home city and hybrid/on-site cities; relocation (in PL / abroad); acceptable remote regions (PL only, EU, EMEA, worldwide).
- Target role list and seniority range.
- Exclusions: industries/companies; language requirements.
