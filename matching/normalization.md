# Normalization rules (v1)

Code: `normalization.ts` (pure functions), config: `config.ts`, types: `types.ts`.
Entry point: `normalizePosting(raw: RawPosting, cfg?) → NormalizedPosting`.
All string comparison runs on `fold(s)` = lowercase + diacritics removed (incl. Polish `ł→l`, which NFD does not decompose).
Display always uses the original text; folded forms are keys only.

## 1. Title

`normalizeTitle(raw)`:
1. `fold`, drop gender markers: `(m/f/d)`, `(k/m)`, `(m/w/d)`, `(f/m/x)`, `(all genders)`.
2. Phrase rewrites: `Chief Technology/Technical Officer`, `Dyrektor ds. technologii`, `Dyrektor techniczny` → `cto`; `Vice President`/`V.P.` → `vp`;
   `Eng.`/`Eng` → `engineering`; `Mgr` → `manager`; `Sr.` → `senior`; `Jr.` → `junior`; `SWE` → `software engineer`; `EM` → `engineering manager`; `&` → `and`.
3. Punctuation `| – — , : ; ( ) / \` → space.
4. Remove noise tokens that leak into titles: work mode (`remote`, `hybrid`, `zdalnie`, `hybrydowo`, `stacjonarnie`…), region (`EU`, `EMEA`, `Polska`…),
   contract (`B2B`, `UoP`) and any known city alias (`Warszawa`, `Warsaw`, `WWA`, `Kraków`…).

`titleCore(titleNorm)` additionally removes level adjectives (`senior`, `junior`, `mid`, `regular`, `starszy`, `młodszy`, `I–V`) — used for matching and fingerprints.
`titleTokens()` maps Polish words to English for cross-language comparison (`kierownik→manager`, `dyrektor→director`, `szef→head`, `zespołu→team`,
`działu→department`, `programistów/oprogramowania→software`, `inżynierii→engineering`, `technologii→technology`, `informatyki→it`, `rozwoju→development`)
and drops stop-words (`of`, `the`, `and`, `ds.`, `do spraw`, `w`, `z`, `na`).
"Level" tokens (`manager`, `head`, `director`, `lead`, `vp`, `chief`, `officer`, `team`, `department`…) are separated from "function" tokens
(`engineering`, `software`, `it`, `data`, `platform`…) for partial matching.

Examples: `Senior Eng. Manager (m/f/d) – Remote` → `senior engineering manager` → core `engineering manager`;
`Chief Technology Officer / CTO – Warszawa` → `cto cto` (token set `{cto}`); `Kierownik Działu IT (k/m)` → `kierownik dzialu it` → tokens `[manager, department, it]`.

## 2. Seniority ladder

`SENIORITY_LEVELS` with numeric rank (`SENIORITY_RANK`):

| rank | level | EN cues | PL cues |
|---|---|---|---|
| 0 | intern | intern, internship, trainee, apprentice | staż, stażysta/-ka, praktykant/-ka, praktyki |
| 1 | junior | junior, jr, entry level, graduate | młodszy/-a, absolwent |
| 2 | mid | mid, regular, middle, intermediate | regular |
| 3 | senior | senior, sr | starszy/-a |
| 4 | lead | lead, team lead, tech lead, TL | lider/-ka |
| 5 | principal / manager | principal, staff, architect / manager, mgr | architekt / kierownik, kierowniczka, menedżer/-ka |
| 6 | senior_manager | senior … manager | starszy kierownik |
| 7 | director / head | director / head (of) | dyrektor/-ka / szef/-owa, kierownik działu/departamentu/pionu |
| 8 | vp | VP, SVP, EVP | wiceprezes |
| 9 | c_level | CTO, CIO, CPO, CDO, CEO, COO, chief … officer | prezes, członek zarządu, dyrektor generalny |

`detectSeniority()` checks top-down, first match wins (so `Senior Engineering Manager` → senior_manager, `Tech Lead Manager` → manager).
No cue → `null` (scored as neutral, not as mid). "Head of" is treated as director-level (EU/PL convention); "Kierownik działu IT" → head.

## 3. Company

`normalizeCompany()`: fold, strip legal suffixes (`sp. z o.o.`, `S.A.`, `spółka akcyjna`, `sp.k.`, `sp.j.`, `GmbH`, `AG`, `Ltd`, `Inc`, `LLC`, `PLC`, `B.V.`, `s.r.o.`, `Oy`, `AB`, `SAS`, `SRL`, `Corp`),
strip trailing `Polska`/`Poland` (local subsidiaries), punctuation → space. `Brzozowa Labs Polska Sp. z o.o.` → `brzozowa labs`. Dedupe/matching key only.

## 4. Location

`normalizeLocation(location, workModeHint, descriptionFallback)` → `{ cities[{city,country}], countries[], remoteRegions[], workModes[], workMode }`.

- **Cities** (`CITY_ALIASES`, folded alias → canonical name with Polish diacritics + ISO-3166 alpha-2):
  Warszawa (warsaw, warschau, varsovie, wwa), Kraków (krakow, cracow, krakau), Wrocław (wroclaw, breslau), Poznań, Gdańsk (incl. trójmiasto/tricity),
  Gdynia, Sopot, Łódź (lodz), Katowice, Szczecin, Lublin, Bydgoszcz, Białystok, Rzeszów, Gliwice, Toruń, Kielce, Olsztyn, Opole, Bielsko-Biała,
  Częstochowa, Radom; plus common foreign hubs (Berlin, München/Monachium, Hamburg, Amsterdam, London/Londyn, Dublin, Praha/Praga, Wien/Wiedeń,
  Lisboa, Barcelona, Madrid, Paris/Paryż, Zürich, Stockholm/Sztokholm, New York, San Francisco). Extend the table rather than adding regexes.
- **Countries**: EN + PL names (`Poland/Polska`, `Germany/Deutschland/Niemcy`, …) → ISO codes. Bare two-letter codes are not matched in free text (too ambiguous), only via regions.
- **Remote regions** (only when remote): `WORLD` (anywhere, worldwide, global), `EMEA`, `EU` (EU, Europe, EEA, CET/CEST, UTC/GMT+0..3),
  `PL` (Poland, Polska, w Polsce), `US` (US, USA, EST/PST), `AMERICAS`, `APAC`. Remote with no region → `PL` if the location names Poland, else `UNKNOWN`.

## 5. Work mode

| mode | EN | PL |
|---|---|---|
| remote | remote, fully remote, work from home, WFH, anywhere, distributed, **home office** | zdalnie, zdalna, praca zdalna, telepraca |
| hybrid | hybrid, "N days in (the) office" | hybrydowo, hybrydowa, praca hybrydowa, "N dni w biurze" |
| onsite | on-site, onsite, in-office, office-based, office | stacjonarnie, stacjonarna, praca stacjonarna, w biurze |

- Check order remote → hybrid → onsite; "home office" (PL usage = remote) and hybrid phrases are removed before the onsite check so "2 days in office" is not onsite.
- A posting can offer several modes (`workModes`); `workMode` = the most flexible (remote > hybrid > onsite).
- Structured source fields (justjoin `workplace_type`, nofluff `remote` flag) go in `workModeHint` and are parsed with the same rules.
- If location/hint say nothing, the description is scanned only for strong phrases (`100% remote`, `fully remote`, `praca zdalna`, `remote-first`, `hybrid work`, `praca hybrydowa`).
- A bare city with no mode word → `unknown` (not assumed on-site).

## 6. Salary

### Parsing (`parseSalaryText`)
Handles e.g. `25 000 – 32 000 PLN netto + VAT / mies. (B2B)`, `20 000-26 000 zł brutto UoP`, `€90k–110k/year`, `150–190 PLN/h + VAT`, `1 200 PLN / dzień`, `do 30 000 zł`, `od 20k`.
- Multiple options split on `;`, `|`, newline, ` or `, ` lub ` → one `SalaryRange` each (e.g. B2B and UoP variants).
- Numbers: spaces/`.`/`,` thousands separators, `k` suffix (applied to both ends for `90–110k`); `%`-numbers, `B2B`, `24/7`, `±2h`, `UTC+1` are removed first.
  `do/up to/max` → max only; `od/from/min` → min only; reversed ranges swapped; a min < 10 % of max is treated as noise.
- Currency: `PLN/zł/zl`, `EUR/€`, `USD/$`, `GBP/£`, `CHF`; else source default (PLN for justjoin/nofluffjobs/pracuj); else the range is dropped.
- Period: hour (`/h`, `/godz`, `hourly`), day (`/day`, `/dzień`, `dziennie`, `MD`, `man-day`), month (`/mo`, `mies.`, `miesięcznie`, `mc`, `msc`), year (`/year`, `annual`, `p.a.`, `rocznie`).
  If missing, inferred by magnitude: PLN < 500 hour, < 3 000 day, < 100 000 month, else year; EUR/USD/GBP/CHF < 300 hour, < 2 000 day, < 30 000 month, else year.
- Contract: `B2B/faktura/invoice/contractor/kontrakt` → b2b; `UoP/umowa o pracę/employment contract/permanent` → uop; `UZ/umowa zlecenie/mandate` → uz; `UoD/umowa o dzieło` → uod.
  Inference (flagged `contractInferred`): `netto + VAT` → b2b; `brutto` in PLN → uop; `gross` in a foreign currency → employment_foreign.
- Basis: `+ VAT/netto +/excl. VAT` → net_of_vat; `brutto/gross` → gross; `netto/net/na rękę` → net (net_of_vat for b2b). Default: b2b → net_of_vat, uop/uz/uod/foreign → gross.

### Conversion to the comparison basis (`toMonthlyPlnB2b`)
Everything is compared as **monthly PLN, B2B net-of-VAT equivalent** (how PL senior-tech offers are most often quoted). All factors are config (`config.ts › DEFAULT_CONFIG`):

| step | rule (default) |
|---|---|
| period | hour × 168 h/month (21 days × 8 h); day × 21; year ÷ 12 (no 13th salary) |
| FX | × `fx.toPln[currency]` — **placeholders** EUR 4.30, USD 3.95, GBP 5.00, CHF 4.55 (asOf 2026-10-01). Refresh daily from NBP table A in prod and store `asOf` with every score. |
| B2B net-of-VAT | × 1.00 (already the basis); amount stated incl. VAT → ÷ 1.23 |
| UoP gross (brutto) | × 1.25 (parity rule of thumb: paid leave, employer ZUS, benefits) |
| UoP net (na rękę) | × 1.25 × 1.40 (netto ≈ brutto / 1.4) |
| UZ gross / net | × 1.15 / × 1.15 × 1.3 |
| UoD gross / net | × 1.10 / × 1.10 × 1.15 |
| foreign employment gross | × 1.25 |
| unknown contract | × 1.00, flagged "compared as-is" |

These are rough market heuristics, not tax advice; every applied step is written to `NormalizedSalary.assumptions` and surfaces in the scoring reason.

### Ranges and missing values
- Several options → keep all in `ranges`, compare using the most favourable (highest max, then min).
- Only max (`do 30 000`) → `monthlyPlnMin = null`; only min (`od 20k`) → `monthlyPlnMax = null`. Scoring treats a single bound as both ends.
- No salary → `salary = null` → neutral salary score (0.5), listed as missing info.
- Converted values < 1 000 or > 500 000 PLN/month are discarded as implausible (`salary_unparseable_or_implausible` flag).

## 7. Untrusted-text flag
`detectInjectionSignals()` (EN + PL patterns: "ignore previous instructions", "rate this 100", fake `</system>`, spoofed delimiters, "zignoruj polecenia"…)
sets `suspected_prompt_injection`. It **never** changes the score; it's shown in the UI and passed to the explanation prompt.
