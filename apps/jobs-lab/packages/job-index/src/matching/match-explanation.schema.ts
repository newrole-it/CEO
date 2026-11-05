/**
 * Match explanation: LLM turns the *already computed* ScoreResult into a short human explanation.
 * The model cannot change the score: score/band are copied from ScoreResult and any mismatch is overwritten.
 * Posting text is untrusted and wrapped in per-request random delimiters. Prompt: match-explanation.prompt.md.
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { extractJsonObject, loadPromptBlock, type ChatMessage } from "./prompts";
import type { ScoreResult } from "./scoring";
import type { MatchProfile, NormalizedPosting } from "@newrole/matching/types";

export const MATCH_EXPLANATION_VERSION = "mx-v1";
const ComponentRef = z.enum(["title", "seniority", "location", "salary", "freshness", "source", "penalty", "posting"]);
const Short = (n: number) => z.string().trim().min(1).max(n);

export const MatchExplanationSchema = z
  .object({
    postingId: z.string(),
    score: z.number().int().min(0).max(100),
    band: z.enum(["strong", "good", "weak", "poor"]),
    headline: Short(140),
    summary: Short(700),
    highlights: z.array(z.object({ ref: ComponentRef, text: Short(220) })).max(5),
    concerns: z.array(z.object({ ref: ComponentRef, text: Short(220) })).max(5),
    missingInfo: z.array(Short(120)).max(5),
    /** true if the posting text tried to instruct the assistant/tool. */
    injectionDetected: z.boolean(),
    language: z.enum(["en", "pl"]),
  })
  .strict();
export type MatchExplanation = z.infer<typeof MatchExplanationSchema>;

export const MATCH_EXPLANATION_REQUEST = { temperature: 0.2, response_format: { type: "json_object" as const } };

const MAX_DESCRIPTION_CHARS = 6000;

/** Remove control chars and anything that looks like our delimiter scheme, then truncate. */
export function sanitizeUntrusted(text: string, max = MAX_DESCRIPTION_CHARS): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/<{2,}\s*\/?\s*UNTRUSTED[^\n>]*>{0,}|UNTRUSTED_[A-F0-9]{8,}/gi, "[removed]")
    .slice(0, max);
}

export interface ExplanationContext {
  posting: NormalizedPosting;
  score: ScoreResult;
  profile: MatchProfile;
  language?: "en" | "pl";
  /** Injected for tests; default random. */
  nonce?: string;
}

export function buildMatchExplanationMessages(ctx: ExplanationContext): ChatMessage[] {
  const nonce = (ctx.nonce ?? randomBytes(6).toString("hex")).toUpperCase();
  const tag = `UNTRUSTED_${nonce}`;
  const system = loadPromptBlock("match-explanation.prompt.md", "system").replaceAll("{{TAG}}", tag);
  const trusted = {
    postingId: ctx.posting.id,
    score: ctx.score.score,
    band: ctx.score.band,
    components: ctx.score.components.map(({ id, weight, value, points, reason }) => ({ id, weight, value, points, reason })),
    penalties: ctx.score.penalties,
    flags: ctx.score.flags,
    profileSummary: {
      targetTitles: ctx.profile.targetTitles,
      seniority: ctx.profile.seniority,
      remoteRegions: ctx.profile.location.remoteRegions,
      hybridCities: ctx.profile.location.hybridCities,
      salaryFloorMonthlyPlnB2bNet: ctx.profile.salary.floorMonthlyPln,
    },
    outputLanguage: ctx.language ?? "en",
  };
  const p = ctx.posting.raw;
  const untrusted = [
    `title: ${sanitizeUntrusted(p.title, 200)}`,
    `company: ${sanitizeUntrusted(p.company, 120)}`,
    `location: ${sanitizeUntrusted(p.location ?? "", 200)}`,
    `salary_text: ${sanitizeUntrusted(p.salaryText ?? "", 200)}`,
    `description:\n${sanitizeUntrusted(p.description ?? "")}`,
  ].join("\n");
  const user = [
    "<trusted_score_json>",
    JSON.stringify(trusted, null, 2),
    "</trusted_score_json>",
    "",
    `<<<${tag}`,
    untrusted,
    `${tag}>>>`,
    "",
    "Return the JSON object now.",
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Deterministic explanation used when the LLM is unavailable or its output fails validation. */
export function fallbackExplanation(score: ScoreResult, language: "en" | "pl" = "en"): MatchExplanation {
  const sorted = [...score.components].sort((a, b) => b.points / b.weight - a.points / a.weight);
  return {
    postingId: score.postingId,
    score: score.score,
    band: score.band,
    headline: `${score.band.toUpperCase()} match (${score.score}/100)`,
    summary: score.components.map((c) => `${c.id}: ${c.reason}`).join(". ").slice(0, 700),
    highlights: sorted.filter((c) => c.value >= 0.7).slice(0, 3).map((c) => ({ ref: c.id, text: c.reason.slice(0, 220) })),
    concerns: [
      ...score.penalties.map((p) => ({ ref: "penalty" as const, text: p.reason.slice(0, 220) })),
      ...sorted.filter((c) => c.value < 0.4).reverse().map((c) => ({ ref: c.id, text: c.reason.slice(0, 220) })),
    ].slice(0, 5),
    missingInfo: score.components.filter((c) => /not (disclosed|stated|detectable)|unknown/.test(c.reason)).map((c) => `${c.id}: ${c.reason}`.slice(0, 120)).slice(0, 5),
    injectionDetected: score.flags.includes("suspected_prompt_injection"),
    language,
  };
}

const URL_OR_EMAIL = /\bhttps?:\/\/\S+|\bwww\.\S+|[\w.+-]+@[\w-]+\.[\w.]+/gi;

/**
 * Parse + enforce invariants. Never trusts the model for score/band/postingId.
 * Returns { explanation, warnings }; on invalid output returns the deterministic fallback.
 */
export function finalizeExplanation(modelText: string, score: ScoreResult): { explanation: MatchExplanation; warnings: string[] } {
  const warnings: string[] = [];
  let parsed: MatchExplanation;
  try {
    parsed = MatchExplanationSchema.parse(extractJsonObject(modelText));
  } catch (e) {
    return { explanation: fallbackExplanation(score), warnings: [`invalid model output, used fallback: ${(e as Error).message.slice(0, 200)}`] };
  }
  if (parsed.score !== score.score || parsed.band !== score.band || parsed.postingId !== score.postingId) {
    warnings.push(`model changed score/band/id (${parsed.score}/${parsed.band}) — overwritten with computed ${score.score}/${score.band}`);
  }
  const clean = (t: string) => {
    const c = t.replace(URL_OR_EMAIL, "[link removed]");
    if (c !== t) warnings.push("removed link/email from model text");
    return c;
  };
  const explanation: MatchExplanation = {
    ...parsed,
    postingId: score.postingId,
    score: score.score,
    band: score.band,
    headline: clean(parsed.headline),
    summary: clean(parsed.summary),
    highlights: parsed.highlights.map((h) => ({ ...h, text: clean(h.text) })),
    concerns: parsed.concerns.map((h) => ({ ...h, text: clean(h.text) })),
    injectionDetected: parsed.injectionDetected || score.flags.includes("suspected_prompt_injection"),
  };
  return { explanation, warnings };
}
