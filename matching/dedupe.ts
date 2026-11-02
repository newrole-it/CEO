/**
 * Dedupe: canonical URLs, ATS keys, fingerprints, near-duplicate detection, merge.
 * Spec: dedupe.md. Imports only text/types (normalization.ts imports this file).
 */
import { diceTokens, fnv1a, shingleJaccard, tokens } from "./text";
import type { NormalizedLocation, NormalizedPosting, Seniority, Source } from "./types";

/* ------------------------------------------------------------------ */
/* URL                                                                 */
/* ------------------------------------------------------------------ */

const TRACKING_PARAMS = [
  /^utm_/, /^gh_src$/, /^lever-(source|origin)/, /^source$/, /^src$/, /^ref$/, /^referrer$/, /^trk/, /^trackingid$/i,
  /^refid$/i, /^currentjobid$/i, /^fbclid$/, /^gclid$/, /^mc_[ce]id$/, /^_hs/, /^campaign/, /^sid$/, /^position$/, /^pagenum$/i,
];

/** Lowercase host, drop www., fragment, tracking params, trailing slash; sort remaining params; LinkedIn → /jobs/view/<id>. */
export function canonicalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw.trim();
  }
  u.hash = "";
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  const keep = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.some((re) => re.test(k.toLowerCase())))
    .sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);
  if (u.hostname.endsWith("linkedin.com")) {
    const m = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/);
    if (m) {
      u.hostname = "linkedin.com";
      u.pathname = `/jobs/view/${m[1]}`;
      u.search = "";
    }
  }
  let out = u.toString();
  if (out.endsWith("/") && u.pathname !== "/") out = out.slice(0, -1);
  return out.replace(/\/\?/, "?");
}

/**
 * Stable per-source job key, e.g. "greenhouse:4012345", "lever:2f1c…", "workable:acme:AB12CD".
 * Prefers ids parsed from the URL; falls back to adapter-provided atsJobId.
 */
export function extractAtsKey(url: string, source: Source, atsJobId?: string, atsBoard?: string): string | null {
  let u: URL | null = null;
  try {
    u = new URL(url);
  } catch {
    /* ignore */
  }
  const host = u?.hostname.toLowerCase().replace(/^www\./, "") ?? "";
  const path = u?.pathname ?? "";
  const ghJid = u?.searchParams.get("gh_jid");
  let m: RegExpMatchArray | null;
  if (ghJid) return `greenhouse:${ghJid}`;
  if (/greenhouse\.io$/.test(host) && (m = path.match(/\/jobs\/(\d+)/))) return `greenhouse:${m[1]}`;
  if (host === "jobs.lever.co" && (m = path.match(/^\/[^/]+\/([0-9a-f-]{36})/i))) return `lever:${m[1]!.toLowerCase()}`;
  if (host === "jobs.ashbyhq.com" && (m = path.match(/^\/[^/]+\/([0-9a-f-]{36})/i))) return `ashby:${m[1]!.toLowerCase()}`;
  if (host === "apply.workable.com" && (m = path.match(/^\/([^/]+)\/j\/([A-Z0-9]+)/i))) return `workable:${m[1]!.toLowerCase()}:${m[2]!.toUpperCase()}`;
  if (host === "jobs.smartrecruiters.com" && (m = path.match(/^\/[^/]+\/(\d+)/))) return `smartrecruiters:${m[1]}`;
  if (host.endsWith(".teamtailor.com") && (m = path.match(/\/jobs\/(\d+)/))) return `teamtailor:${host.split(".")[0]}:${m[1]}`;
  if (host === "justjoin.it" && (m = path.match(/\/(?:job-offer|offers)\/([^/?#]+)/))) return `justjoin:${m[1]!.toLowerCase()}`;
  if (host === "nofluffjobs.com" && (m = path.match(/\/job\/([^/?#]+)/))) return `nofluffjobs:${m[1]!.toLowerCase()}`;
  if (host.endsWith("pracuj.pl") && (m = path.match(/oferta,(\d+)/))) return `pracuj:${m[1]}`;
  if (host.endsWith("linkedin.com") && (m = path.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/))) return `linkedin:${m[1]}`;
  if (atsJobId) {
    // company_site covers dozens of vendors and career sites whose ids are only unique per tenant:
    // Traffit "106" at one employer and "106" at another are different jobs.
    const scoped = source === "workable" || source === "teamtailor" || source === "company_site";
    const board = atsBoard?.toLowerCase();
    // The search pipeline passes ids it has already scoped ("tutlo:106"); do not scope twice.
    const prefix = scoped && board && !atsJobId.toLowerCase().startsWith(`${board}:`) ? `${board}:` : "";
    return `${source}:${prefix}${atsJobId}`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Fingerprint                                                         */
/* ------------------------------------------------------------------ */

/** "remote" | "city:warszawa" | "country:de" | "unknown". Remote regions are NOT part of the bucket (sources disagree). */
export function locationBucket(loc: NormalizedLocation): string {
  if (loc.workMode === "remote" && loc.cities.length === 0) return "remote";
  const city = [...loc.cities].map((c) => c.city.toLowerCase()).sort()[0];
  if (city) return `city:${city}`;
  if (loc.workMode === "remote") return "remote";
  const country = [...loc.countries].sort()[0];
  return country ? `country:${country.toLowerCase()}` : "unknown";
}

/** fp = fnv1a(companyNorm | sorted unique core title tokens | seniority | location bucket). */
export function computeFingerprint(
  companyNorm: string,
  coreTitleTokens: string[],
  seniority: Seniority | null,
  loc: NormalizedLocation,
): string {
  const t = [...new Set(coreTitleTokens)].sort().join(" ");
  return fnv1a(`${companyNorm}|${t}|${seniority ?? "-"}|${locationBucket(loc)}`);
}

/* ------------------------------------------------------------------ */
/* Near-duplicates                                                     */
/* ------------------------------------------------------------------ */

export const DEDUPE_THRESHOLDS = {
  companyDice: 0.8,
  titleDice: 0.85,
  titleDiceWithDescription: 0.6,
  descriptionJaccard: 0.8,
  locationMismatchDescriptionJaccard: 0.5,
  maxPostedGapDays: 45,
};

const titleToks = (p: NormalizedPosting) => [...new Set(p.titleTokens)];
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

function locationsCompatible(a: NormalizedPosting, b: NormalizedPosting, descSim: number): boolean {
  const A = locationBucket(a.location);
  const B = locationBucket(b.location);
  if (A === B || A === "unknown" || B === "unknown") return true;
  // Same job listed as "Remote" on one board and "Warszawa (hybrid)" on another: accept only with similar text.
  if (A === "remote" || B === "remote") return descSim >= DEDUPE_THRESHOLDS.locationMismatchDescriptionJaccard;
  // Multi-city postings: overlap in cities
  return a.location.cities.some((c) => b.location.cities.some((d) => d.city === c.city));
}

export interface DuplicateVerdict {
  duplicate: boolean;
  rule: "ats_key" | "canonical_url" | "fingerprint" | "near_title" | "near_description" | null;
  detail: string;
}

export function compareForDuplicate(a: NormalizedPosting, b: NormalizedPosting): DuplicateVerdict {
  if (a.atsKey && a.atsKey === b.atsKey) return { duplicate: true, rule: "ats_key", detail: a.atsKey };
  if (a.canonicalUrl === b.canonicalUrl) return { duplicate: true, rule: "canonical_url", detail: a.canonicalUrl };
  if (a.fingerprint === b.fingerprint) return { duplicate: true, rule: "fingerprint", detail: a.fingerprint };
  const companySim = a.companyNorm === b.companyNorm ? 1 : diceTokens(tokens(a.companyNorm), tokens(b.companyNorm));
  if (companySim < DEDUPE_THRESHOLDS.companyDice) return { duplicate: false, rule: null, detail: `company ${companySim.toFixed(2)}` };
  if (a.seniority && b.seniority && a.seniority !== b.seniority)
    return { duplicate: false, rule: null, detail: `seniority ${a.seniority}≠${b.seniority}` };
  if (a.postedAt && b.postedAt && daysBetween(a.postedAt, b.postedAt) > DEDUPE_THRESHOLDS.maxPostedGapDays)
    return { duplicate: false, rule: null, detail: "posted too far apart (repost → keep separate)" };
  const titleSim = diceTokens(titleToks(a), titleToks(b));
  const descSim = shingleJaccard(a.raw.description ?? "", b.raw.description ?? "");
  if (!locationsCompatible(a, b, descSim)) return { duplicate: false, rule: null, detail: "location buckets differ" };
  if (titleSim >= DEDUPE_THRESHOLDS.titleDice)
    return { duplicate: true, rule: "near_title", detail: `title dice ${titleSim.toFixed(2)}` };
  if (titleSim >= DEDUPE_THRESHOLDS.titleDiceWithDescription && descSim >= DEDUPE_THRESHOLDS.descriptionJaccard)
    return { duplicate: true, rule: "near_description", detail: `title ${titleSim.toFixed(2)}, desc ${descSim.toFixed(2)}` };
  return { duplicate: false, rule: null, detail: `title ${titleSim.toFixed(2)}, desc ${descSim.toFixed(2)}` };
}

/* ------------------------------------------------------------------ */
/* Merge                                                               */
/* ------------------------------------------------------------------ */

/** Lower = more trusted. Direct ATS/company site beats PL boards beats LinkedIn beats generic web. */
export const SOURCE_PRIORITY: Record<Source, number> = {
  greenhouse: 0, lever: 0, ashby: 0, workable: 0, smartrecruiters: 0, teamtailor: 0, company_site: 0,
  justjoin: 1, nofluffjobs: 1, pracuj: 2, linkedin: 3, web: 4,
};

/** Winner order: source priority → has salary → longer description → earlier postedAt → id. */
export function compareWinner(a: NormalizedPosting, b: NormalizedPosting): number {
  return (
    SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source] ||
    Number(!!b.salary) - Number(!!a.salary) ||
    (b.raw.description?.length ?? 0) - (a.raw.description?.length ?? 0) ||
    (Date.parse(a.postedAt ?? "9999") - Date.parse(b.postedAt ?? "9999")) ||
    a.id.localeCompare(b.id)
  );
}

export function mergeGroup(group: NormalizedPosting[]): NormalizedPosting {
  const sorted = [...group].sort(compareWinner);
  const w = { ...sorted[0]! };
  const rest = sorted.slice(1);
  w.salary = w.salary ?? rest.find((p) => p.salary)?.salary ?? null;
  if (w.location.workMode === "unknown") w.location = rest.find((p) => p.location.workMode !== "unknown")?.location ?? w.location;
  const dates = group.map((p) => p.postedAt).filter((d): d is string => !!d).sort();
  w.postedAt = dates[0] ?? null; // first seen anywhere = true freshness
  w.sources = [...new Set(group.flatMap((p) => p.sources))];
  w.mergedFrom = [...new Set([...w.mergedFrom, ...rest.flatMap((p) => [p.id, ...p.mergedFrom])])];
  w.flags = [...new Set(group.flatMap((p) => p.flags))];
  return w;
}

/** O(n²) union-find; block by companyNorm first for large n. Returns merged postings + audit of merges. */
export function dedupePostings(postings: NormalizedPosting[]): {
  postings: NormalizedPosting[];
  merges: Array<{ a: string; b: string; rule: DuplicateVerdict["rule"]; detail: string }>;
} {
  const parent = postings.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const merges: Array<{ a: string; b: string; rule: DuplicateVerdict["rule"]; detail: string }> = [];
  for (let i = 0; i < postings.length; i++)
    for (let j = i + 1; j < postings.length; j++) {
      const v = compareForDuplicate(postings[i]!, postings[j]!);
      if (v.duplicate) {
        parent[find(j)] = find(i);
        merges.push({ a: postings[i]!.id, b: postings[j]!.id, rule: v.rule, detail: v.detail });
      }
    }
  const groups = new Map<number, NormalizedPosting[]>();
  postings.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]));
  return { postings: [...groups.values()].map(mergeGroup), merges };
}
