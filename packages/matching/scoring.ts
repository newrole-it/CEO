/**
 * Explainable, deterministic scoring 0–100. Spec: scoring.md.
 * Input: a NormalizedPosting (post-dedupe) + MatchProfile + `now`. No LLM, no randomness, no I/O.
 * Posting text never influences the score except via parsed structured fields and exclusion keywords.
 */
import { SOURCE_PRIORITY } from "./dedupe";
import { CITY_ALIASES, LEVEL_TOKENS, normalizeTitle, titleCore, titleTokens } from "./normalization";
import { diceTokens, fold } from "./text";
import { SENIORITY_RANK, type MatchProfile, type NormalizedPosting } from "./types";

export const SCORING_VERSION = "scoring-v1";

export const WEIGHTS = {
  title: 30,
  seniority: 15,
  location: 25,
  salary: 15,
  freshness: 10,
  source: 5,
} as const;
export type ComponentId = keyof typeof WEIGHTS;

export const PENALTIES = {
  excludedTitleCap: 10, // hard exclusion: final score capped at 10
  excludedCompanyCap: 0,
  excludedDescriptionKeyword: -10,
  contractNotAccepted: -20,
  /** location value ≤ 0.2: remote restricted to non-accepted region, or on-site/hybrid where the person can't work */
  locationIneligible: -20,
  /** whole published range below the salary floor */
  belowSalaryFloor: -15,
  /** the source's own posting date is more than a year old: an opening still listed long after it was posted */
  postedOverYearAgo: -10,
};

/** Relevance gate: non-title points are multiplied by g = min(1, GATE_BASE + GATE_SLOPE × titleValue).
 *  title 0 → 0.4, 0.5 → 0.775, ≥0.8 → 1. Stops "remote + fresh + well paid" from lifting irrelevant roles. */
export const GATE_BASE = 0.4;
export const GATE_SLOPE = 0.75;

export interface ScoreComponent {
  id: ComponentId;
  weight: number;
  /** 0..1 */
  value: number;
  /** weight × value (× gate for non-title components), 1 decimal */
  points: number;
  reason: string;
}
export interface ScorePenalty {
  id:
    | "excluded_title"
    | "excluded_company"
    | "excluded_description_keyword"
    | "contract_not_accepted"
    | "location_ineligible"
    | "below_salary_floor"
    | "posted_over_year_ago";
  points: number;
  reason: string;
}
export interface ScoreResult {
  postingId: string;
  version: string;
  score: number;
  band: "strong" | "good" | "weak" | "poor";
  /** Relevance gate applied to all non-title components. */
  gate: { value: number; reason: string };
  components: ScoreComponent[];
  penalties: ScorePenalty[];
  flags: string[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const fmtPln = (n: number) => `${Math.round(n).toLocaleString("en-US").replace(/,/g, " ")} PLN`;

/* ---------------- title ---------------- */

interface TitleCandidate {
  title: string;
  weight: number;
  kind: "target" | "related";
}

function containsSequence(hay: string[], needle: string[]): boolean {
  const n = [...needle];
  for (let i = 0; i + n.length <= hay.length; i++) if (n.every((t, j) => hay[i + j] === t)) return true;
  return false;
}

export function titleMatch(posting: NormalizedPosting, profile: MatchProfile): { value: number; reason: string } {
  const p = new Set(posting.titleTokens);
  const pFunc = posting.titleTokens.filter((t) => !LEVEL_TOKENS.has(t));
  const pLevel = posting.titleTokens.filter((t) => LEVEL_TOKENS.has(t));
  const candidates: TitleCandidate[] = [
    ...profile.targetTitles.map((t) => ({ title: t, weight: 1, kind: "target" as const })),
    ...profile.relatedTitles.map((t) => ({ title: t.title, weight: t.weight, kind: "related" as const })),
  ];
  let best = { value: 0, reason: `title "${posting.raw.title}" does not match any target or related title` };
  for (const c of candidates) {
    const cTok = [...new Set(titleTokens(titleCore(normalizeTitle(c.title))))];
    const cFunc = cTok.filter((t) => !LEVEL_TOKENS.has(t));
    const cLevel = cTok.filter((t) => LEVEL_TOKENS.has(t));
    let value = 0;
    let how = "";
    const subset = cTok.length > 0 && cTok.every((t) => p.has(t));
    if (subset && cTok.length === p.size) {
      value = 1 * c.weight;
      how = "exact";
    } else if (subset && p.size - cTok.length <= 2) {
      // Contiguous phrase ("Engineering Manager, Checkout") = team/area suffix → 0.9;
      // scattered ("Head of Data Engineering") = specialty changes the function → 0.75.
      const contiguous = containsSequence(posting.titleTokens, titleTokens(titleCore(normalizeTitle(c.title))));
      value = (contiguous ? 0.9 : 0.75) * c.weight;
      how = contiguous ? "contains" : "contains (specialised)";
    } else {
      const f = diceTokens(pFunc, cFunc);
      if (f > 0) {
        const levelOverlap = cLevel.some((t) => pLevel.includes(t)) || (cLevel.length === 0 && pLevel.length === 0);
        value = 0.7 * f * (levelOverlap ? 1 : 0.6) * c.weight;
        how = `partial (function-word overlap ${f.toFixed(2)}${levelOverlap ? "" : ", different level word"})`;
      }
    }
    if (value > best.value + 1e-9) {
      best = {
        value: Math.min(1, value),
        reason: `title "${posting.raw.title}" ${how} match with ${c.kind} "${c.title}"${c.kind === "related" ? ` (weight ${c.weight})` : ""}`,
      };
    }
  }
  return best;
}

/* ---------------- seniority ---------------- */

export function seniorityMatch(posting: NormalizedPosting, profile: MatchProfile): { value: number; reason: string } {
  if (!posting.seniority) return { value: 0.5, reason: "seniority not detectable from title (neutral)" };
  const rank = SENIORITY_RANK[posting.seniority];
  const lo = SENIORITY_RANK[profile.seniority.min];
  const hi = SENIORITY_RANK[profile.seniority.max];
  const dist = rank < lo ? lo - rank : rank > hi ? rank - hi : 0;
  const value = dist === 0 ? 1 : dist === 1 ? 0.6 : dist === 2 ? 0.25 : 0;
  const where = dist === 0 ? "within" : rank < lo ? `${dist} level(s) below` : `${dist} level(s) above`;
  return { value, reason: `seniority ${posting.seniority} is ${where} target range ${profile.seniority.min}–${profile.seniority.max}` };
}

/* ---------------- location / work mode ---------------- */

function canonCity(c: string): string {
  return CITY_ALIASES[fold(c).trim()]?.[0] ?? c;
}

export function locationMatch(posting: NormalizedPosting, profile: MatchProfile): { value: number; reason: string } {
  const loc = posting.location;
  const L = profile.location;
  const hybridCities = L.hybridCities.map(canonCity);
  const onsiteCities = L.onsiteCities.map(canonCity);
  const cityNames = loc.cities.map((c) => c.city);
  const inHome = loc.cities.some((c) => c.country === L.homeCountry) || loc.countries.includes(L.homeCountry);
  const abroad = !inHome && (loc.cities.length > 0 || loc.countries.length > 0);
  const where = cityNames.length ? cityNames.join("/") : loc.countries.join("/") || "location not stated";

  if (loc.workMode === "remote") {
    const regions = loc.remoteRegions;
    if (regions.includes("WORLD") || regions.some((r) => L.remoteRegions.includes(r)))
      return { value: 1, reason: `remote (${regions.join(", ")}) — accepted region` };
    if (regions.includes("UNKNOWN")) return { value: 0.7, reason: "remote, eligible region not stated" };
    return { value: 0.1, reason: `remote but restricted to ${regions.join(", ")} — outside accepted regions` };
  }
  if (loc.workMode === "hybrid") {
    if (cityNames.some((c) => hybridCities.includes(c))) return { value: 0.8, reason: `hybrid in ${where} — accepted hybrid city` };
    if (inHome) return { value: 0.3, reason: `hybrid in ${where} — in ${L.homeCountry} but not an accepted hybrid city` };
    if (abroad) return { value: L.relocationOk ? 0.3 : 0, reason: `hybrid abroad (${where}) — relocation ${L.relocationOk ? "ok" : "not accepted"}` };
    return { value: 0.4, reason: "hybrid, city not stated" };
  }
  if (loc.workMode === "onsite") {
    if (cityNames.some((c) => onsiteCities.includes(c))) return { value: 0.6, reason: `on-site in ${where} — accepted on-site city` };
    if (inHome) return { value: 0.2, reason: `on-site in ${where} — not an accepted on-site city` };
    if (abroad) return { value: L.relocationOk ? 0.2 : 0, reason: `on-site abroad (${where}) — relocation ${L.relocationOk ? "ok" : "not accepted"}` };
    return { value: 0.3, reason: "on-site, city not stated" };
  }
  // unknown work mode
  if (cityNames.some((c) => hybridCities.includes(c) || onsiteCities.includes(c)))
    return { value: 0.6, reason: `${where}, work mode not stated` };
  if (inHome) return { value: 0.3, reason: `${where}, work mode not stated` };
  if (abroad) return { value: 0.1, reason: `${where} (abroad), work mode not stated` };
  return { value: 0.4, reason: "location and work mode not stated (neutral)" };
}

/* ---------------- salary ---------------- */

export function salaryMatch(posting: NormalizedPosting, profile: MatchProfile): { value: number; reason: string } {
  const s = posting.salary;
  const F = profile.salary.floorMonthlyPln;
  if (!s || (s.monthlyPlnMin === null && s.monthlyPlnMax === null))
    return { value: 0.5, reason: "salary not disclosed (neutral)" };
  const lo = s.monthlyPlnMin ?? s.monthlyPlnMax!;
  const hi = s.monthlyPlnMax ?? s.monthlyPlnMin!;
  const range = lo === hi ? `${s.monthlyPlnMin === null ? "up to " : s.monthlyPlnMax === null ? "from " : ""}${fmtPln(hi)}` : `${fmtPln(lo)}–${fmtPln(hi)}`;
  const assume = s.assumptions.length ? ` [${s.assumptions.join("; ")}]` : "";
  const base = `≈${range}/month B2B-net-equivalent vs floor ${fmtPln(F)}${assume}`;
  if (lo >= F) {
    const t = profile.salary.targetMonthlyPln;
    return { value: 1, reason: `${base} — whole range above floor${t && hi >= t ? ", reaches target" : ""}` };
  }
  if (hi >= F) {
    const v = hi === lo ? 1 : 0.5 + (0.5 * (hi - F)) / (hi - lo);
    return { value: r1(v * 100) / 100, reason: `${base} — range straddles floor` };
  }
  const ratio = hi / F;
  const v = ratio <= 0.7 ? 0 : ((ratio - 0.7) / 0.3) * 0.4;
  return { value: Math.round(v * 100) / 100, reason: `${base} — top of range is ${Math.round(ratio * 100)}% of floor` };
}

/* ---------------- freshness ---------------- */

export function freshnessMatch(posting: NormalizedPosting, now: Date): { value: number; reason: string } {
  if (!posting.postedAt) return { value: 0.3, reason: "posting date unknown" };
  const days = Math.max(0, Math.floor((now.getTime() - Date.parse(posting.postedAt)) / 86_400_000));
  const value = days <= 3 ? 1 : days <= 7 ? 0.85 : days <= 14 ? 0.7 : days <= 30 ? 0.4 : days <= 60 ? 0.15 : 0;
  return { value, reason: `posted ${days} day(s) ago${posting.mergedFrom.length ? " (earliest across merged sources)" : ""}` };
}

/* ---------------- source ---------------- */

const SOURCE_VALUE = [1, 0.9, 0.85, 0.7, 0.5];
export function sourceMatch(posting: NormalizedPosting): { value: number; reason: string } {
  const best = Math.min(...posting.sources.map((s) => SOURCE_PRIORITY[s]));
  const value = SOURCE_VALUE[best] ?? 0.5;
  return { value, reason: `source ${posting.sources.join(" + ")} (${best === 0 ? "direct ATS/company" : best <= 2 ? "PL job board" : best === 3 ? "LinkedIn" : "generic web"})` };
}

/* ---------------- penalties ---------------- */

function containsKeyword(text: string, kw: string): boolean {
  const t = ` ${fold(text).replace(/[^a-z0-9+#]+/g, " ")} `;
  const k = fold(kw).replace(/[^a-z0-9+#]+/g, " ").trim();
  return k.length > 0 && t.includes(` ${k} `);
}

/* ---------------- main ---------------- */

export function scorePosting(posting: NormalizedPosting, profile: MatchProfile, now: Date): ScoreResult {
  const title = titleMatch(posting, profile);
  const g = Math.min(1, GATE_BASE + GATE_SLOPE * title.value);
  const gate = {
    value: Math.round(g * 1000) / 1000,
    reason: g >= 1 ? "title relevant — no gate" : `title relevance ${title.value.toFixed(2)} → other components × ${g.toFixed(3)}`,
  };
  const parts: Array<[ComponentId, { value: number; reason: string }]> = [
    ["title", title],
    ["seniority", seniorityMatch(posting, profile)],
    ["location", locationMatch(posting, profile)],
    ["salary", salaryMatch(posting, profile)],
    ["freshness", freshnessMatch(posting, now)],
    ["source", sourceMatch(posting)],
  ];
  const components: ScoreComponent[] = parts.map(([id, { value, reason }]) => ({
    id,
    weight: WEIGHTS[id],
    value: Math.round(value * 1000) / 1000,
    points: r1(WEIGHTS[id] * value * (id === "title" ? 1 : g)),
    reason,
  }));
  let score = Math.round(components.reduce((a, c) => a + c.points, 0));
  const penalties: ScorePenalty[] = [];
  const comp = (id: ComponentId) => components.find((c) => c.id === id)!;

  const loc = comp("location");
  if (loc.value <= 0.2) penalties.push({ id: "location_ineligible", points: PENALTIES.locationIneligible, reason: `location not workable for profile: ${loc.reason}` });

  const s = posting.salary;
  const hi = s ? (s.monthlyPlnMax ?? s.monthlyPlnMin) : null;
  if (hi !== null && hi < profile.salary.floorMonthlyPln)
    penalties.push({ id: "below_salary_floor", points: PENALTIES.belowSalaryFloor, reason: `top of range ≈${fmtPln(hi)} is below floor ${fmtPln(profile.salary.floorMonthlyPln)}` });

  const ex = profile.exclusions;
  const descKw = ex.descriptionKeywords.find((k) => containsKeyword(posting.raw.description ?? "", k));
  if (descKw) penalties.push({ id: "excluded_description_keyword", points: PENALTIES.excludedDescriptionKeyword, reason: `description contains excluded keyword "${descKw}"` });

  const contracts = (posting.salary?.ranges ?? []).map((r) => r.contract).filter((c) => c !== "unknown");
  if (contracts.length && !contracts.some((c) => profile.salary.acceptedContracts.includes(c)))
    penalties.push({ id: "contract_not_accepted", points: PENALTIES.contractNotAccepted, reason: `contract ${[...new Set(contracts)].join("/")} not in accepted ${profile.salary.acceptedContracts.join("/")}` });

  if (posting.postedAt) {
    const days = Math.floor((now.getTime() - Date.parse(posting.postedAt)) / 86_400_000);
    if (days > 365) penalties.push({ id: "posted_over_year_ago", points: PENALTIES.postedOverYearAgo, reason: `posted ${days} days ago — over a year` });
  }

  for (const p of penalties) score += p.points;
  score = Math.max(0, score);

  const titleKw = ex.titleKeywords.find((k) => containsKeyword(posting.raw.title, k));
  if (titleKw) {
    // Always recorded (explainability), even when the score is already below the cap.
    const pts = Math.min(0, PENALTIES.excludedTitleCap - score);
    penalties.push({ id: "excluded_title", points: pts, reason: `title contains excluded keyword "${titleKw}" — capped at ${PENALTIES.excludedTitleCap}` });
    score += pts;
  }
  const exCompany = ex.companies.find((c) => fold(c).trim() === posting.companyNorm || containsKeyword(posting.raw.company, c));
  if (exCompany) {
    const pts = Math.min(0, PENALTIES.excludedCompanyCap - score);
    penalties.push({ id: "excluded_company", points: pts, reason: `company "${exCompany}" is excluded` });
    score += pts;
  }

  score = Math.max(0, Math.min(100, score));
  const band = score >= 80 ? "strong" : score >= 60 ? "good" : score >= 40 ? "weak" : "poor";
  return { postingId: posting.id, version: SCORING_VERSION, score, band, gate, components, penalties, flags: [...posting.flags] };
}

/** Score + sort (desc score, then fresher, then id) — deterministic ranking. */
export function rankPostings(postings: NormalizedPosting[], profile: MatchProfile, now: Date): ScoreResult[] {
  const byId = new Map(postings.map((p) => [p.id, p]));
  return postings
    .map((p) => scorePosting(p, profile, now))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(byId.get(b.postingId)!.postedAt ?? "1970") - Date.parse(byId.get(a.postingId)!.postedAt ?? "1970") ||
        a.postingId.localeCompare(b.postingId),
    );
}
