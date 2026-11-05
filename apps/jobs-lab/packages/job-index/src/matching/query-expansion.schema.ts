/**
 * Query expansion: role phrase (EN/PL) → titles, synonyms, exclusions, search queries.
 * The LLM returns ExpansionLLMOutput; site:-scoped queries are built deterministically by
 * buildSearchQueries() (so search syntax never depends on the model).
 * Prompt: query-expansion.prompt.md. Examples: query-expansion.examples.json.
 */
import { z } from "zod";
import { extractJsonObject, loadPromptBlock, type ChatMessage } from "./prompts";
import { fold } from "@newrole/matching/text";
import { SeniorityEnum, SourceEnum, type Source } from "@newrole/matching/types";

export const QUERY_EXPANSION_VERSION = "qe-v2";

const Lang = z.enum(["en", "pl"]);
const Phrase = z.string().trim().min(1).max(80);

export const QueryExpansionInputSchema = z.object({
  phrase: z.string().trim().min(2).max(120),
  /** Optional user hint, e.g. "Warszawa" or "remote EU". Used only for web query location terms. */
  locationHint: z.string().trim().max(80).optional(),
});
export type QueryExpansionInput = z.infer<typeof QueryExpansionInputSchema>;

export const ExpansionLLMOutputSchema = z.object({
  inputPhrase: z.string(),
  detectedLanguage: z.enum(["en", "pl", "mixed"]),
  canonicalRole: z.object({
    titleEn: Phrase,
    titlePl: Phrase,
    function: z.enum([
      "engineering",
      "it",
      "product",
      "data",
      "security",
      "infrastructure",
      "design",
      "qa",
      "project_management",
      "analysis",
      "it_support",
      "leadership",
      "other",
    ]),
    seniority: SeniorityEnum,
    track: z.enum(["executive", "management", "individual_contributor"]),
  }),
  relatedTitles: z
    .array(
      z.object({
        title: Phrase,
        lang: Lang,
        relation: z.enum(["equivalent", "adjacent", "step_up", "step_down"]),
        weight: z.number().min(0).max(1),
      }),
    )
    .min(3)
    .max(25),
  seniorityVariants: z.array(z.object({ title: Phrase, lang: Lang, seniority: SeniorityEnum })).max(15),
  synonyms: z.object({ en: z.array(Phrase).max(15), pl: z.array(Phrase).max(15) }),
  /** Words that, in a description, signal the right kind of role (not required). */
  signalKeywords: z.array(Phrase).max(20),
  exclusions: z.object({
    titleKeywords: z.array(Phrase).max(25),
    descriptionKeywords: z.array(Phrase).max(15),
    rationale: z.string().max(400),
  }),
  /** 1–6 free-form web search queries (no site: operators — those are added in code). */
  webQueries: z.array(z.string().trim().min(3).max(200)).min(1).max(6),
});
export type ExpansionLLMOutput = z.infer<typeof ExpansionLLMOutputSchema>;

export const SiteQuerySchema = z.object({ source: SourceEnum, site: z.string(), query: z.string() });
export const QueryExpansionSchema = ExpansionLLMOutputSchema.extend({
  version: z.literal(QUERY_EXPANSION_VERSION),
  searchQueries: z.object({
    web: z.array(z.string()),
    sites: z.array(SiteQuerySchema),
  }),
});
export type QueryExpansion = z.infer<typeof QueryExpansionSchema>;

/* ---------------- search query builder ---------------- */

export const SITE_TARGETS: Array<{ source: Source; site: string; plBoard: boolean }> = [
  { source: "greenhouse", site: "boards.greenhouse.io", plBoard: false },
  { source: "greenhouse", site: "job-boards.greenhouse.io", plBoard: false },
  { source: "lever", site: "jobs.lever.co", plBoard: false },
  { source: "ashby", site: "jobs.ashbyhq.com", plBoard: false },
  { source: "workable", site: "apply.workable.com", plBoard: false },
  { source: "smartrecruiters", site: "jobs.smartrecruiters.com", plBoard: false },
  { source: "teamtailor", site: "teamtailor.com", plBoard: false },
  { source: "justjoin", site: "justjoin.it", plBoard: true },
  { source: "nofluffjobs", site: "nofluffjobs.com", plBoard: true },
  { source: "pracuj", site: "pracuj.pl", plBoard: true },
  { source: "linkedin", site: "linkedin.com/jobs/view", plBoard: false },
];

const q = (s: string) => `"${s.replace(/"/g, "")}"`;
const uniqFold = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = fold(x).trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export interface BuildQueryOptions {
  /** Max quoted titles per OR group (search engines degrade with long ORs). */
  maxTitlesPerQuery?: number;
  /** Location terms for global ATS sites. Default derived from hint or "(remote OR Poland OR Europe)". */
  locationTerms?: string[];
  /** Negative title terms appended to web queries (top N exclusions). */
  maxNegatives?: number;
}

export function buildSearchQueries(
  out: ExpansionLLMOutput,
  input: QueryExpansionInput,
  opts: BuildQueryOptions = {},
): QueryExpansion["searchQueries"] {
  const maxT = opts.maxTitlesPerQuery ?? 4;
  const loc = opts.locationTerms ?? (input.locationHint ? [input.locationHint, "remote"] : ["remote", "Poland", "Europe"]);
  const strong = (lang: "en" | "pl") =>
    uniqFold([
      lang === "en" ? out.canonicalRole.titleEn : out.canonicalRole.titlePl,
      ...out.relatedTitles.filter((t) => t.lang === lang && t.relation === "equivalent" && t.weight >= 0.8).map((t) => t.title),
      ...(lang === "en" ? out.synonyms.en : out.synonyms.pl),
    ]);
  const en = strong("en").slice(0, maxT * 2);
  const pl = strong("pl").slice(0, maxT * 2);
  const groups = (titles: string[]) => {
    const g: string[] = [];
    for (let i = 0; i < titles.length; i += maxT) g.push(`(${titles.slice(i, i + maxT).map(q).join(" OR ")})`);
    return g;
  };
  const locGroup = `(${loc.map((l) => (/\s/.test(l) ? q(l) : l)).join(" OR ")})`;
  const sites: QueryExpansion["searchQueries"]["sites"] = [];
  for (const t of SITE_TARGETS) {
    // PL boards: one EN + one PL group (PL first for Polish input); global ATS: up to two EN groups.
    const plFirst = out.detectedLanguage === "pl";
    const titleGroups = t.plBoard
      ? (plFirst ? [groups(pl)[0], groups(en)[0]] : [groups(en)[0], groups(pl)[0]]).filter((g): g is string => !!g)
      : groups(en).slice(0, 2);
    for (const g of titleGroups) {
      sites.push({ source: t.source, site: t.site, query: `site:${t.site} ${g}${t.plBoard ? "" : ` ${locGroup}`}` });
    }
  }
  const negatives = out.exclusions.titleKeywords.slice(0, opts.maxNegatives ?? 3).map((n) => `-${q(n)}`).join(" ");
  const web = uniqFold(out.webQueries).map((w) => (negatives ? `${w} ${negatives}` : w));
  return { web, sites };
}

/* ---------------- LLM call helpers (OpenAI-compatible chat completions) ---------------- */

/** Remove control chars and our delimiter tokens from user input before embedding it in the prompt. */
export function sanitizePhrase(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/<\/?role_phrase>/gi, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function buildQueryExpansionMessages(input: QueryExpansionInput): ChatMessage[] {
  const system = loadPromptBlock("query-expansion.prompt.md", "system");
  const user = [
    `<role_phrase>${sanitizePhrase(input.phrase)}</role_phrase>`,
    input.locationHint ? `<location_hint>${sanitizePhrase(input.locationHint)}</location_hint>` : "",
    "Return the JSON object now.",
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Suggested request params: works with any OpenAI-compatible endpoint that supports json_object. */
export const QUERY_EXPANSION_REQUEST = { temperature: 0.2, response_format: { type: "json_object" as const } };

/** Parse + validate model output and attach deterministic search queries. Throws ZodError on invalid output (retry once). */
export function finalizeExpansion(modelText: string, input: QueryExpansionInput): QueryExpansion {
  const llm = ExpansionLLMOutputSchema.parse(extractJsonObject(modelText));
  return QueryExpansionSchema.parse({ ...llm, version: QUERY_EXPANSION_VERSION, searchQueries: buildSearchQueries(llm, input) });
}
