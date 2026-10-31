# Jobscanner — matching pack

Matching layer for Jobscanner (a personal job scanner). Pure TypeScript + Zod, no I/O except reading prompt `.md` files.
Pipeline: **role phrase → query expansion (LLM) → search (JS Sources) → normalize → dedupe → score (deterministic) → explain (LLM, optional)**.

> No existing Jobscanner code or specs were found under `/workspace/jobscanner` when this pack was written (only an empty `scripts/`),
> so the types in `types.ts` are proposals; the MVP should adopt them or map to its own names.
> `fixtures/profile.json` is **example data**, not anyone's real preferences.

## Files

| path | what |
|---|---|
| `query-expansion.prompt.md` | System prompt + usage notes for role-phrase expansion (EN/PL) |
| `query-expansion.schema.ts` | Zod schemas (`QueryExpansionInputSchema`, `ExpansionLLMOutputSchema`, `QueryExpansionSchema`), message builder, deterministic `site:` query builder, `finalizeExpansion()` |
| `query-expansion.examples.json` | 5 worked examples: Head of Engineering, CTO, Engineering Manager, Kierownik działu IT, VP Engineering (generated + validated by `scripts/gen-examples.ts`) |
| `normalization.md` / `normalization.ts` | Title, seniority ladder, company, PL cities/countries, work mode (zdalnie/hybrydowo/stacjonarnie), salary parsing & conversion (PLN/EUR/USD, B2B/UoP/UZ/UoD, net/gross, h/day/month/year), injection heuristic |
| `config.ts` | FX placeholders, 168 h/month, 21 days, 12 months, contract→B2B-equivalent factors (all config) |
| `dedupe.md` / `dedupe.ts` | ATS keys, canonical URLs, fingerprints, near-duplicate thresholds, merge winner rules |
| `scoring.md` / `scoring.ts` | Explainable 0–100 score: weights, gate, penalties, bands, worked examples |
| `match-explanation.prompt.md` / `match-explanation.schema.ts` | Injection-safe explanation prompt, strict Zod output, invariant enforcement, deterministic fallback |
| `types.ts` | Shared enums/schemas: `RawPosting`, `NormalizedPosting`, `MatchProfile`, `SalaryRange`, … |
| `text.ts`, `prompts.ts`, `pipeline.ts` | Helpers (fold/diacritics, Dice, shingles, FNV), prompt loader + JSON extraction, `runMatching()` |
| `fixtures/profile.json` | Example profile (targets HoE/CTO/EM/VP/Director; Warszawa hybrid; remote PL/EU/EMEA; floor 30k PLN B2B-net/month) |
| `fixtures/postings.json` | 24 fictional postings (EN/PL, 11 sources, PLN/EUR/USD, B2B/UoP/UZ, h/day/month/year, 3 duplicates, 1 injection, irrelevant roles) with expected score ranges, bands and reasons |
| `fixtures/scored-output.txt` | Current full score breakdown for all fixtures |
| `test/matching.test.ts` | 46 tests: fixture ranges/bands/reasons, dedupe, injection invariance, explanation invariants, normalization units, example validation |
| `scripts/score-fixtures.ts` | Print ranked fixtures with breakdown (`--verbose`) |

## Use

```bash
# Dependencies (zod, tsx, typescript) are pinned to the same versions as the repo root and
# resolve from the root node_modules, so no install is needed inside this folder.
npm test                 # node:test via tsx (or: npm test --prefix matching from the root)
npm run typecheck
npx tsx scripts/score-fixtures.ts --verbose
npm run gen:examples     # regenerate query-expansion.examples.json
```

```ts
import { buildQueryExpansionMessages, finalizeExpansion, QUERY_EXPANSION_REQUEST } from "./query-expansion.schema";
const messages = buildQueryExpansionMessages({ phrase: "Kierownik działu IT", locationHint: "Warszawa" });
// POST {LLM_BASE_URL}/chat/completions { model: LLM_MODEL, messages, ...QUERY_EXPANSION_REQUEST }
const expansion = finalizeExpansion(choice.message.content, { phrase: "Kierownik działu IT" }); // throws ZodError → retry once

import { runMatching } from "./pipeline";
const { ranked, postings, merges } = runMatching(rawPostings, profile, new Date());
```

LLM calls use only plain chat completions with `response_format: {type: "json_object"}` (OpenAI-compatible; no vendor-specific features).
Output is always re-validated with Zod.

## Key design decisions
1. LLM only where language understanding helps (expansion, explanation); scoring/dedupe/normalization are deterministic and unit-tested.
2. `site:` queries are built in code from the LLM's titles, so search syntax and board coverage never depend on the model.
3. Salary compared on one basis — monthly PLN, B2B net-of-VAT equivalent — with every conversion step recorded as an assumption string.
4. Relevance gate + "ineligible" penalties so perfect-on-paper but unworkable roles (US-only remote, on-site in another city) don't float to the top.
5. Injection safety by construction: score computed before the LLM sees the text; model output can't change score/band; random delimiters; strict schema; fallback.
6. Dedupe prefers direct ATS records, keeps the earliest postedAt and the union of sources; all merges logged with rule + detail.

## Open questions
See the final section of the hand-off message; mirrored here:
- Real salary floor and target (and in which basis — B2B net or UoP gross?).
- Accepted contracts (B2B only? UoP ok? foreign employment / EoR?).
- Home city and hybrid/on-site cities; would he relocate (in PL / abroad)? Acceptable remote regions (PL only, EU, EMEA, worldwide)?
- Target role list and seniority range (is Engineering Manager too junior? is Team Lead ever interesting?).
- Exclusions: industries/companies (gambling, body-leasing/outsourcing agencies, defence…)? Language requirements (German, etc.)?
