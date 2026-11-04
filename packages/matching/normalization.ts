/**
 * Normalization helpers: title, seniority, company, location, work mode, salary.
 * Spec: normalization.md. Pure functions, no I/O, deterministic.
 */
import { DEFAULT_CONFIG, type MatchingConfig } from "./config";
import { canonicalizeUrl, computeFingerprint, extractAtsKey } from "./dedupe";
import { CITY_ALIASES, matchPlaces } from "./places";
import { collapseSpaces, fold, tokens } from "./text";
import type {
  ContractType,
  Currency,
  NormalizedLocation,
  NormalizedPosting,
  NormalizedSalary,
  RawPosting,
  Region,
  SalaryBasis,
  SalaryPeriod,
  SalaryRange,
  Seniority,
  Source,
  WorkMode,
} from "./types";

/* ------------------------------------------------------------------ */
/* Title                                                               */
/* ------------------------------------------------------------------ */

const PHRASE_REWRITES: Array<[RegExp, string]> = [
  [/\bchief technolog(y|ical) officer\b/g, "cto"],
  [/\bchief technical officer\b/g, "cto"],
  [/\bchief information officer\b/g, "cio"],
  [/\bchief product officer\b/g, "cpo"],
  [/\bchief data officer\b/g, "cdo"],
  [/\bvice[- ]president\b/g, "vp"],
  [/\bv\.p\.?(?=\s|$)/g, "vp"],
  [/\bdyrektor(ka)? (ds\.? )?technologii\b/g, "cto"], // PL "Dyrektor ds. technologii" ~ CTO
  [/\bdyrektor(ka)? techniczn(y|a)\b/g, "cto"],
  [/\br&d\b/g, "rnd"],
  [/&/g, " and "],
  [/\beng\.(?=\s|$)/g, "engineering"],
  [/\bengg?\b/g, "engineering"],
  [/\bmgr\.?(?=\s|$)/g, "manager"],
  [/\bsr\.?(?=\s|$)/g, "senior"],
  [/\bjr\.?(?=\s|$)/g, "junior"],
  [/\bswe\b/g, "software engineer"],
  [/\bem\b/g, "engineering manager"],
];

/** Gender / inclusivity markers like (m/f/d), (k/m), (all genders), (m/w/d), (f/m/x). */
const GENDER_MARKER = /\((?:\s*[mfwdkx*]\s*\/?)+\)|\(\s*all genders\s*\)|\bm\/f\/d\b|\bk\/m\b|\bm\/k\b/g;

/** Tokens dropped from titles: work mode, contract, region and city words that leak into titles. */
const TITLE_NOISE = new Set([
  "remote", "hybrid", "onsite", "on", "site", "zdalnie", "zdalna", "zdalny", "hybrydowo", "hybrydowa",
  "stacjonarnie", "stacjonarna", "praca", "fully", "100", "eu", "emea", "europe", "poland", "polska", "pl",
  "cet", "b2b", "uop", "only", "anywhere",
]);

const LEVEL_ADJECTIVES = new Set([
  "senior", "junior", "mid", "regular", "middle", "starszy", "starsza", "mlodszy", "mlodsza",
  "i", "ii", "iii", "iv", "v",
]);

/** PL→EN token map used for cross-language token comparison (scoring/dedupe), not display. */
const PL_TOKEN_MAP: Record<string, string> = {
  kierownik: "manager", kierowniczka: "manager", menedzer: "manager", menadzer: "manager", menedzerka: "manager",
  dyrektor: "director", dyrektorka: "director", szef: "head", szefowa: "head",
  lider: "lead", liderka: "lead", leader: "lead",
  zespolu: "team", zespol: "team", zespolem: "team", zespolow: "team",
  dzialu: "department", dzial: "department", departamentu: "department", pionu: "department",
  programistow: "software", programistycznego: "software", programista: "software", oprogramowania: "software",
  rozwoju: "development", rozwoj: "development",
  inzynierii: "engineering", inzynieryjnego: "engineering", inzynier: "engineer",
  technologii: "technology", technologiczny: "technology", technicznego: "technology", techniczny: "technology",
  informatyki: "it", informatyczny: "it", informatycznego: "it",
  wsparcia: "support", budowy: "construction", sprzedazy: "sales", produktu: "product",
};
const TITLE_STOPWORDS = new Set(["of", "the", "and", "ds", "do", "spraw", "w", "for", "z", "na", "a", "an", "to", "in"]);

/** Generic role-level tokens; the rest are "function" tokens (engineering, it, data, ...). */
export const LEVEL_TOKENS = new Set([
  "manager", "head", "director", "lead", "vp", "chief", "officer", "senior", "principal", "staff",
  "team", "department", "group", "global", "regional",
]);

const CITY_TOKENS = new Set<string>(); // filled after CITY_ALIASES is declared

/** Folded, cleaned display-independent title, e.g. "Senior Eng. Manager (m/f/d) – Remote" → "senior engineering manager". */
export function normalizeTitle(raw: string): string {
  let s = fold(raw).replace(GENDER_MARKER, " ");
  for (const [re, rep] of PHRASE_REWRITES) s = s.replace(re, rep);
  s = s.replace(/[|–—,:;()[\]/\\]+/g, " ").replace(/\s-\s/g, " ").replace(/[^a-z0-9+# .-]/g, " ");
  const kept = collapseSpaces(s)
    .split(" ")
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((t) => t && !TITLE_NOISE.has(t) && !CITY_TOKENS.has(t));
  return kept.join(" ");
}

/** Title without level adjectives (senior/junior/II…). Used for matching and fingerprints. */
export function titleCore(titleNorm: string): string {
  return titleNorm
    .split(" ")
    .filter((t) => !LEVEL_ADJECTIVES.has(t))
    .join(" ");
}

/** Tokens mapped to English and stop-word filtered, for similarity. */
export function titleTokens(titleNorm: string): string[] {
  return tokens(titleNorm)
    .map((t) => PL_TOKEN_MAP[t] ?? t)
    .filter((t) => !TITLE_STOPWORDS.has(t));
}

export function functionTokens(titleNorm: string): string[] {
  return titleTokens(titleCore(titleNorm)).filter((t) => !LEVEL_TOKENS.has(t));
}

/* ------------------------------------------------------------------ */
/* Seniority                                                           */
/* ------------------------------------------------------------------ */

/** Checked in order; first match wins. Operates on normalizeTitle() output (folded, no diacritics). */
const SENIORITY_PATTERNS: Array<[Seniority, RegExp]> = [
  ["c_level", /\b(cto|cio|cpo|cdo|ceo|coo|chief [a-z ]*officer|dyrektor generalny|prezes|czlonek zarzadu)\b/],
  ["vp", /\b(vp|svp|evp|wiceprezes)\b/],
  ["head", /\b(head|szef|szefowa|(kierownik|kierowniczka) (dzialu|departamentu|pionu))\b/],
  ["director", /\b(director|dyrektor(ka)?)\b/],
  ["senior_manager", /\b(senior [a-z]* ?manager|starszy kierownik)\b/],
  ["manager", /\b(manager|kierownik|kierowniczka|mened[zż]er(ka)?|menad[zż]er(ka)?)\b/],
  ["principal", /\b(principal|staff|distinguished|architect|architekt)\b/],
  ["lead", /\b(lead|leader|lider(ka)?|tl)\b/],
  ["senior", /\b(senior|starszy|starsza)\b/],
  ["mid", /\b(mid|regular|middle|intermediate)\b/],
  ["junior", /\b(junior|mlodszy|mlodsza|entry level|graduate|absolwent)\b/],
  ["intern", /\b(intern|internship|trainee|staz|stazysta|stazystka|praktykant(ka)?|praktyki|apprentice)\b/],
];

export function detectSeniority(titleNorm: string): Seniority | null {
  for (const [level, re] of SENIORITY_PATTERNS) if (re.test(titleNorm)) return level;
  return null;
}

/* ------------------------------------------------------------------ */
/* Company                                                             */
/* ------------------------------------------------------------------ */

const LEGAL_SUFFIX =
  /\b(sp\.?\s*z\s*o\.?\s*o\.?|spolka z ograniczona odpowiedzialnoscia|s\.?\s*a\.?|spolka akcyjna|sp\.?\s*k\.?|sp\.?\s*j\.?|gmbh|ag|ltd\.?|limited|inc\.?|llc|plc|b\.?v\.?|s\.?r\.?o\.?|oy|ab|sas|srl|corp\.?|corporation)(?=\s|$)/g;

/** "Brzozowa Labs Polska Sp. z o.o." → "brzozowa labs". Dedupe/matching key only, not for display. */
export function normalizeCompany(raw: string): string {
  let s = fold(raw).replace(/[,()"']/g, " ");
  s = collapseSpaces(s.replace(LEGAL_SUFFIX, " "));
  s = s.replace(/\b(polska|poland)$/, "");
  return collapseSpaces(s.replace(/[^a-z0-9 ]+/g, " "));
}

/* ------------------------------------------------------------------ */
/* Location & work mode                                                */
/* ------------------------------------------------------------------ */

// Country names, subdivisions, cities and remote regions live in places.ts; re-exported so
// existing imports from "@newrole/matching/normalization" keep working.
export {
  CITY_ALIASES,
  COUNTRY_ALIASES,
  COUNTRY_CODES,
  COUNTRY_NAMES,
  EU_COUNTRIES,
  countryFromText,
  countryName,
  m49Region,
  regionCovers,
  remoteOpenTo,
} from "./places";
for (const k of Object.keys(CITY_ALIASES)) if (!k.includes(" ")) CITY_TOKENS.add(k);

const RE_REMOTE = /\b(remote|zdaln\w*|work from home|wfh|home office|anywhere|telepraca|distributed|fully remote)\b/;
const RE_HYBRID_SRC = String.raw`\b(hybrid\w*|hybrydow\w*|\d+\s*(days?|dni)\s*(a week |w tygodniu )?(in|w)\s*(the\s*)?(office|biurze))\b`;
const RE_HYBRID = new RegExp(RE_HYBRID_SRC);
const RE_HYBRID_G = new RegExp(RE_HYBRID_SRC, "g");
const RE_ONSITE = /\b(on-?site|in[- ]office|office[- ]based|stacjonarn\w*|w biurze|office)\b/;

const REGION_PATTERNS: Array<[Region, RegExp]> = [
  ["WORLD", /\b(anywhere|worldwide|global(ly)?|world)\b/],
  ["EMEA", /\bemea\b/],
  ["EU", /\b(eu|europe|european|europa|eea|cet|cest|utc\s*\+\s*[0-3]|gmt\s*\+\s*[0-3])\b/],
  ["PL", /\b(poland|polska|pl|polsce)\b/],
  // Bare "us" is matched by matchPlaces only where it stands as a location, never as the pronoun.
  ["US", /\b(usa|united states|north america|est|pst)\b/],
  ["AMERICAS", /\b(americas|latam|south america)\b/],
  ["APAC", /\b(apac|asia)\b/],
];

/**
 * Parse free-text location + optional structured hint.
 * Rules (see normalization.md): city aliases → canonical PL spelling; countries and US/CA/AU subdivisions from
 * places.ts; remote/hybrid/onsite from PL+EN terms; a bare city with no mode word gives workMode "unknown"
 * (we do not assume onsite).
 */
export function normalizeLocation(location = "", workModeHint = "", descriptionFallback = ""): NormalizedLocation {
  const text = fold(`${location} ${workModeHint}`);
  // Location and hint are read apart so a hint word never joins the last "City, ST" part.
  const fromLocation = matchPlaces(location);
  const fromHint = matchPlaces(workModeHint);
  const cities = [...fromLocation.cities];
  for (const c of fromHint.cities) if (!cities.some((x) => x.city === c.city)) cities.push(c);
  const countries = new Set([...fromLocation.countries, ...fromHint.countries]);
  const usNamed = fromLocation.usNamed || fromHint.usNamed;

  const modes = detectWorkModes(text);
  if (modes.length === 0 && descriptionFallback) {
    const d = fold(descriptionFallback);
    if (/\b(100% remote|fully remote|praca (w pelni )?zdalna|remote-first|remote first)\b/.test(d)) modes.push("remote");
    else if (/\b(hybrid work|praca hybrydowa|hybrid model)\b/.test(d)) modes.push("hybrid");
  }

  const remoteRegions: Region[] = [];
  if (modes.includes("remote")) {
    for (const [region, re] of REGION_PATTERNS) {
      if (re.test(text) || (region === "US" && usNamed)) remoteRegions.push(region);
    }
    if (remoteRegions.length === 0) remoteRegions.push(countries.has("PL") ? "PL" : "UNKNOWN");
  }

  const order: WorkMode[] = ["remote", "hybrid", "onsite"];
  const workMode = order.find((m) => modes.includes(m)) ?? "unknown";
  return { cities, countries: [...countries], remoteRegions, workModes: modes.length ? modes : ["unknown"], workMode };
}

export function detectWorkModes(foldedText: string): WorkMode[] {
  const out: WorkMode[] = [];
  let t = foldedText;
  if (RE_REMOTE.test(t)) out.push("remote");
  t = t.replace(/home office/g, " ");
  if (RE_HYBRID.test(t)) out.push("hybrid");
  t = t.replace(RE_HYBRID_G, " ");
  if (RE_ONSITE.test(t)) out.push("onsite");
  return out;
}

/* ------------------------------------------------------------------ */
/* Salary                                                              */
/* ------------------------------------------------------------------ */

function detectCurrency(s: string): Currency | null {
  if (/\bpln\b|\bzl\b|zl\/|\d\s*zl/.test(s)) return "PLN";
  if (/\beur\b|€|euro/.test(s)) return "EUR";
  if (/\busd\b|\$/.test(s)) return "USD";
  if (/\bgbp\b|£/.test(s)) return "GBP";
  if (/\bchf\b/.test(s)) return "CHF";
  return null;
}

function detectPeriod(s: string): SalaryPeriod | null {
  if (/(\/\s*h\b|\/\s*hr\b|per hour|hourly|\/\s*godz|\bgodz|na godzine|\bh\b|\/hour)/.test(s)) return "hour";
  if (/(\/\s*(day|dzien|md)\b|per day|daily|dziennie|za dzien|man-?day|\bmd\b|\/\s*d\b|stawka dzienna)/.test(s)) return "day";
  if (/(month|monthly|\/\s*mo\b|\bmies|miesiecznie|\/\s*m\b|\bmc\b|\bmsc\b|\bpm\b|p\.m\.)/.test(s)) return "month";
  if (/(year|annual|annually|yearly|\/\s*yr\b|\bp\.?a\.?(?=\s|$|\)|,)|\brok\b|rocznie|roczn)/.test(s)) return "year";
  return null;
}

function detectContract(s: string): ContractType | null {
  if (/\bb2b\b|faktur|invoice|contractor|\bfv\b|kontrakt/.test(s)) return "b2b";
  if (/\buop\b|umow\w* o prace|employment contract|permanent contract|\bcoe\b/.test(s)) return "uop";
  if (/\buz\b|umow\w* zlecen\w*|mandate contract/.test(s)) return "uz";
  if (/\buod\b|o dzielo|specific[- ]task contract/.test(s)) return "uod";
  return null;
}

function detectBasis(s: string, contract: ContractType): SalaryBasis | null {
  if (/\+\s*vat|plus vat|excl\.?\s*vat|bez vat|netto\s*\+/.test(s)) return "net_of_vat";
  if (/brutto|gross/.test(s)) return "gross";
  if (/netto|\bnet\b|na reke|take[- ]home/.test(s)) return contract === "b2b" ? "net_of_vat" : "net";
  return null;
}

function parseNumber(tok: string): number | null {
  let t = tok.replace(/\s+/g, "");
  const k = /k$/i.test(t);
  t = t.replace(/k$/i, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, "");
  else t = t.replace(",", ".");
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return k ? n * 1000 : n;
}

function defaultPeriodByMagnitude(v: number, currency: Currency): SalaryPeriod {
  if (currency === "PLN") return v < 500 ? "hour" : v < 3000 ? "day" : v < 100_000 ? "month" : "year";
  return v < 300 ? "hour" : v < 2000 ? "day" : v < 30_000 ? "month" : "year";
}

export interface ParseSalaryOptions {
  defaultCurrency?: Currency;
  defaultContract?: ContractType;
  config?: MatchingConfig;
}

/**
 * Parse free-text salary. Handles: "25 000 – 32 000 PLN netto + VAT / mies. (B2B)",
 * "20 000-26 000 zł brutto UoP", "€90k–110k/year", "150–190 PLN/h + VAT", "do 30 000 zł", "od 20k".
 * Multiple options separated by ";", "|", newline or " or "/" lub " → multiple ranges.
 */
export function parseSalaryText(text: string, opts: ParseSalaryOptions = {}): SalaryRange[] {
  const cfg = opts.config ?? DEFAULT_CONFIG;
  const out: SalaryRange[] = [];
  const segments = fold(text).split(/;|\||\n|\bor\b|\blub\b/);
  let lastCurrency: Currency | null = null;
  for (const seg0 of segments) {
    // drop digits that are not amounts: "23% VAT", "100% remote", "B2B", "24/7", "CET ±2h", "UTC+1"
    const seg = seg0.replace(/\d+\s*%|\bb2b\b|\b\d+\/7\b|[+±]\s*\d+\s*h?\b/g, " ").trim();
    if (!/\d/.test(seg)) continue;
    const nums = [...seg.matchAll(/(\d[\d\s.,]*\d|\d)\s*(k\b)?/g)]
      .map((m) => parseNumber(m[1]! + (m[2] ? "k" : "")))
      .filter((n): n is number => n !== null && n > 0);
    if (nums.length === 0) continue;
    const currency: Currency | null = detectCurrency(seg) ?? lastCurrency ?? opts.defaultCurrency ?? null;
    if (!currency) continue;
    lastCurrency = currency;
    let min: number | null = nums[0]!;
    let max: number | null = nums[1] ?? nums[0]!;
    // "90–110k": k applies to both ends
    if (nums.length >= 2 && min < 1000 && max >= 1000 && min * 1000 <= max * 1.5 && /k\b/.test(seg)) min *= 1000;
    if (/\b(do|up to|until|max\.?)\s*\d/.test(seg) && nums.length === 1) min = null;
    if (/\b(od|from|min\.?)\s*\d/.test(seg) && nums.length === 1) max = null;
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    let contract = detectContract(seg0) ?? opts.defaultContract ?? "unknown";
    const explicitBasis = detectBasis(seg0, contract);
    // "€120k gross/year" with no contract word: foreign payroll employment.
    let contractInferred = false;
    if (contract === "unknown" && explicitBasis === "gross" && currency !== "PLN") [contract, contractInferred] = ["employment_foreign", true];
    // "brutto" in PLN with no contract word: almost always UoP on PL boards.
    else if (contract === "unknown" && explicitBasis === "gross" && currency === "PLN") [contract, contractInferred] = ["uop", true];
    // "netto + VAT" implies an invoice, i.e. B2B.
    else if (contract === "unknown" && explicitBasis === "net_of_vat") [contract, contractInferred] = ["b2b", true];
    const basis = explicitBasis ?? cfg.defaultBasis[contract];
    const period = detectPeriod(seg) ?? defaultPeriodByMagnitude((max ?? min)!, currency);
    // ignore stray small numbers (e.g. "2 dni w biurze" leaking into the salary text)
    if (min !== null && max !== null && min < max * 0.1) min = max;
    out.push({ min, max, currency, period, contract, basis, ...(contractInferred ? { contractInferred } : {}) });
  }
  return out;
}

/** Convert one range to monthly PLN on the comparison basis (B2B net-of-VAT equivalent). */
export function toMonthlyPlnB2b(
  r: SalaryRange,
  cfg: MatchingConfig = DEFAULT_CONFIG,
): { min: number | null; max: number | null; assumptions: string[] } {
  const assumptions: string[] = [];
  const periodFactor =
    r.period === "hour" ? cfg.hoursPerMonth : r.period === "day" ? cfg.daysPerMonth : r.period === "year" ? 1 / cfg.monthsPerYear : 1;
  if (r.period === "hour") assumptions.push(`hourly × ${cfg.hoursPerMonth} h/month`);
  if (r.period === "day") assumptions.push(`daily × ${cfg.daysPerMonth} days/month`);
  if (r.period === "year") assumptions.push(`yearly ÷ ${cfg.monthsPerYear} months`);
  const fx = cfg.fx.toPln[r.currency];
  if (r.currency !== "PLN") assumptions.push(`${r.currency}→PLN @ ${fx} (config, asOf ${cfg.fx.asOf})`);
  const basis = r.basis === "unknown" ? cfg.defaultBasis[r.contract] : r.basis;
  const factor = cfg.toB2bNetFactor[r.contract][basis] ?? cfg.toB2bNetFactor[r.contract].unknown ?? 1;
  if (factor !== 1) assumptions.push(`${r.contract} ${basis} × ${round2(factor)} → B2B net-of-VAT equivalent`);
  if (r.contract === "unknown") assumptions.push("contract type unknown: compared as-is");
  if (r.contractInferred) assumptions.push(`contract inferred as ${r.contract} from wording`);
  const conv = (v: number | null) => (v === null ? null : Math.round(v * periodFactor * fx * factor));
  return { min: conv(r.min), max: conv(r.max), assumptions };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Normalize all ranges; pick the most favourable option (highest max, then min) for comparison. */
export function normalizeSalary(ranges: SalaryRange[], cfg: MatchingConfig = DEFAULT_CONFIG): NormalizedSalary | null {
  if (ranges.length === 0) return null;
  let best: { min: number | null; max: number | null; assumptions: string[] } | null = null;
  for (const r of ranges) {
    const c = toMonthlyPlnB2b(r, cfg);
    const v = c.max ?? c.min ?? 0;
    if (v < 1000 || v > 500_000) continue; // implausible after conversion → ignore
    const bv = best ? (best.max ?? best.min ?? 0) : -1;
    if (!best || v > bv || (v === bv && (c.min ?? 0) > (best.min ?? 0))) best = c;
  }
  if (!best) return null;
  return {
    ranges,
    monthlyPlnMin: best.min,
    monthlyPlnMax: best.max,
    comparisonBasis: "b2b_net_monthly_pln",
    assumptions: best.assumptions,
  };
}

/* ------------------------------------------------------------------ */
/* Untrusted-text heuristics                                           */
/* ------------------------------------------------------------------ */

const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(instructions?|prompts?|rules|guidelines)\b/i,
  /\b(you are|act as|jestes|udawaj)\b[^.\n]{0,30}\b(ai|assistant|language model|llm|model|asystent)\b/i,
  /\bsystem prompt\b|\bdeveloper message\b|<\/?\s*(system|assistant|user|instructions?)\s*>/i,
  /\b(rate|score|rank|mark|oce[nń]|ustaw)\b[^.\n]{0,40}\b(100|10\/10|perfect|highest|top|maximum|maksymaln\w*|idealn\w*)\b/i,
  /\b(zignoruj|pomi[nń])\b[^.\n]{0,40}\b(instrukcj\w*|polece\w*|zasad\w*)\b/i,
  /<<<\s*(end|begin)|END_POSTING|BEGIN_POSTING|\[\/?INST\]/i,
];

/** Heuristic flag only. The score never depends on it; the explanation prompt mentions it. */
export function detectInjectionSignals(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

/* ------------------------------------------------------------------ */
/* Posting                                                             */
/* ------------------------------------------------------------------ */

const PL_SOURCES: Source[] = ["justjoin", "nofluffjobs", "pracuj"];

export function normalizePosting(raw: RawPosting, cfg: MatchingConfig = DEFAULT_CONFIG): NormalizedPosting {
  const titleNorm = normalizeTitle(raw.title);
  const core = titleCore(titleNorm);
  const seniority = detectSeniority(titleNorm);
  const companyNorm = normalizeCompany(raw.company);
  const location = normalizeLocation(raw.location ?? "", raw.workModeHint ?? "", raw.description ?? "");
  const defaultCurrency: Currency | undefined = PL_SOURCES.includes(raw.source) ? "PLN" : undefined;
  const ranges = raw.salary?.length
    ? raw.salary.map((r) => ({ ...r, contract: r.contract ?? "unknown", basis: r.basis ?? "unknown" }))
    : raw.salaryText
      ? parseSalaryText(raw.salaryText, { defaultCurrency, config: cfg })
      : [];
  const salary = normalizeSalary(ranges as SalaryRange[], cfg);
  const flags: string[] = [];
  if (detectInjectionSignals(`${raw.title}\n${raw.description ?? ""}`)) flags.push("suspected_prompt_injection");
  if (ranges.length && !salary) flags.push("salary_unparseable_or_implausible");
  const canonicalUrl = canonicalizeUrl(raw.url);
  return {
    raw,
    id: raw.id,
    source: raw.source,
    canonicalUrl,
    atsKey: extractAtsKey(raw.url, raw.source, raw.atsJobId, raw.atsBoard),
    companyNorm,
    titleNorm,
    titleCore: core,
    titleTokens: titleTokens(core),
    seniority,
    location,
    salary,
    postedAt: raw.postedAt ?? null,
    fingerprint: computeFingerprint(companyNorm, titleTokens(core), seniority, location),
    flags,
    mergedFrom: [],
    sources: [raw.source],
  };
}
