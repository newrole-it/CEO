import { DEFAULT_CONFIG, type MatchingConfig } from "../../../matching/config"
import {
  buildQueryExpansionMessages,
  buildSearchQueries,
  ExpansionLLMOutputSchema,
  finalizeExpansion,
  QUERY_EXPANSION_VERSION,
  type ExpansionLLMOutput,
  type QueryExpansion,
  type QueryExpansionInput,
} from "../../../matching/query-expansion.schema"
import { fold } from "../../../matching/text"
import {
  SENIORITY_LEVELS,
  SENIORITY_RANK,
  type ContractType,
  type MatchProfile,
  type Seniority,
} from "../../../matching/types"
import examples from "../../../matching/query-expansion.examples.json"
import type { LlmClient } from "src/server/llm/client"

const CONTRACTS: ContractType[] = ["b2b", "uop", "uz", "uod", "employment_foreign", "unknown"]
const STOP = new Set(["the", "and", "for", "of", "ds", "do", "dla", "oraz", "with", "role"])

type ExampleRow = { input?: { phrase?: string }; modelOutput?: unknown }

/** FX and hours stay overridable. DEFAULT_CONFIG itself is never mutated (matching tests depend on it). */
export function liveMatchingConfig(): MatchingConfig {
  const toPln = { ...DEFAULT_CONFIG.fx.toPln }
  let source = DEFAULT_CONFIG.fx.source
  const apply = (code: keyof typeof toPln, envName: string) => {
    const raw = process.env[envName]
    if (!raw) return
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return
    toPln[code] = value
    source = "env FX_*_PLN"
  }
  apply("EUR", "FX_EUR_PLN")
  apply("USD", "FX_USD_PLN")
  apply("GBP", "FX_GBP_PLN")
  apply("CHF", "FX_CHF_PLN")
  return {
    ...DEFAULT_CONFIG,
    fx: {
      ...DEFAULT_CONFIG.fx,
      toPln,
      source,
      asOf: process.env.FX_AS_OF?.trim() || DEFAULT_CONFIG.fx.asOf,
    },
  }
}

function positive(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function seniorityAt(rank: number, fromEnd: boolean): Seniority {
  const matches = SENIORITY_LEVELS.filter((level) => SENIORITY_RANK[level] === rank)
  return (fromEnd ? matches[matches.length - 1] : matches[0]) ?? "manager"
}

function windowFor(level: Seniority): { min: Seniority; max: Seniority } {
  const rank = SENIORITY_RANK[level]
  return {
    min: seniorityAt(Math.max(0, rank - 2), false),
    max: seniorityAt(Math.min(9, rank + 1), true),
  }
}

/**
 * Neutral profile. fixtures/profile.json is an example (30k PLN floor, Warsaw-only)
 * and is nobody's live preference. Salary floor defaults to 1 PLN so a missing
 * salary stays neutral and any disclosed salary clears the floor.
 */
export function liveProfile(expansion: QueryExpansion): MatchProfile {
  const titles = unique([expansion.canonicalRole.titleEn, expansion.canonicalRole.titlePl])
  const contracts = (process.env.MATCH_ACCEPTED_CONTRACTS || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is ContractType => (CONTRACTS as string[]).includes(item))
  const cities = (
    process.env.MATCH_HYBRID_CITIES ||
    "Warsaw,Kraków,Krakow,Wrocław,Wroclaw,Gdańsk,Gdansk,Poznań,Poznan,Łódź,Lodz,Katowice"
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  return {
    label: "neutral-defaults",
    targetTitles: titles.length ? titles : [expansion.inputPhrase],
    relatedTitles: expansion.relatedTitles.map((item) => ({
      title: item.title,
      weight: item.weight,
    })),
    seniority: windowFor(expansion.canonicalRole.seniority),
    location: {
      homeCity: process.env.MATCH_HOME_CITY?.trim() || "Warsaw",
      homeCountry: (process.env.MATCH_HOME_COUNTRY?.trim() || "PL").slice(0, 2).toUpperCase(),
      remoteRegions: ["PL", "EU", "EMEA", "WORLD"],
      hybridCities: cities,
      onsiteCities: cities,
      relocationOk: process.env.MATCH_RELOCATION_OK?.trim().toLowerCase() !== "false",
    },
    salary: {
      floorMonthlyPln: positive(process.env.MATCH_SALARY_FLOOR_PLN, 1),
      acceptedContracts: contracts.length ? contracts : CONTRACTS,
    },
    exclusions: {
      titleKeywords: expansion.exclusions.titleKeywords,
      descriptionKeywords: expansion.exclusions.descriptionKeywords,
      companies: [],
    },
  }
}

export function expansionView(expansion: QueryExpansion, source: string) {
  return {
    source,
    titles: unique([
      expansion.canonicalRole.titleEn,
      expansion.canonicalRole.titlePl,
      ...expansion.relatedTitles.map((item) => item.title),
    ]),
    exclusions: expansion.exclusions.titleKeywords,
    seniority: expansion.canonicalRole.seniority,
    canonicalEn: expansion.canonicalRole.titleEn,
    canonicalPl: expansion.canonicalRole.titlePl,
  }
}

export function titleIsRelevant(title: string, expansion: QueryExpansion): boolean {
  const words = new Set(tokens(title))
  const bags = unique([
    expansion.canonicalRole.titleEn,
    expansion.canonicalRole.titlePl,
    ...expansion.relatedTitles.filter((item) => item.weight >= 0.6).map((item) => item.title),
    ...expansion.synonyms.en,
    ...expansion.synonyms.pl,
  ]).map((item) => tokens(item))
  return bags.some((bag) => {
    if (bag.length === 0) return false
    const shared = bag.filter((word) => words.has(word)).length
    return shared >= Math.min(2, bag.length)
  })
}

function tokens(value: string): string[] {
  return [
    ...new Set(
      fold(value)
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !STOP.has(word))
    ),
  ]
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = fold(value).trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(value.trim())
  }
  return out
}

export async function resolveExpansion(
  input: QueryExpansionInput,
  llm: LlmClient | null,
  userId?: number
): Promise<{
  expansion: QueryExpansion
  source: "llm" | "example" | "minimal"
  tokenInput: number
  tokenOutput: number
}> {
  if (llm) {
    const messages = buildQueryExpansionMessages(input)
    const system = messages.find((message) => message.role === "system")?.content ?? ""
    const user = messages.find((message) => message.role === "user")?.content ?? ""
    let result: Awaited<ReturnType<typeof llm.completeText>> = null
    try {
      result = await llm.completeText({
        purpose: "query-expansion",
        system,
        user,
        maxTokens: 1400,
        userId,
      })
    } catch {
      result = null
    }
    if (result?.data) {
      try {
        return {
          expansion: finalizeExpansion(result.data, input),
          source: "llm",
          tokenInput: result.tokenInput,
          tokenOutput: result.tokenOutput,
        }
      } catch {
        // The model reply was not a valid expansion. Fall through to the deterministic path.
      }
    }
  }
  const fromExample = expansionFromExample(input)
  if (fromExample)
    return { expansion: fromExample, source: "example", tokenInput: 0, tokenOutput: 0 }
  return { expansion: minimalExpansion(input), source: "minimal", tokenInput: 0, tokenOutput: 0 }
}

function expansionFromExample(input: QueryExpansionInput): QueryExpansion | null {
  const key = fold(input.phrase)
  const row = (examples as ExampleRow[]).find(
    (item) => item.input?.phrase && fold(item.input.phrase) === key
  )
  if (!row?.modelOutput) return null
  const parsed = ExpansionLLMOutputSchema.safeParse(row.modelOutput)
  if (!parsed.success) return null
  return {
    ...parsed.data,
    version: QUERY_EXPANSION_VERSION,
    searchQueries: buildSearchQueries(parsed.data, input),
  }
}

function guessSeniority(phrase: string): Seniority {
  const text = fold(phrase)
  if (/\bcto\b|chief technology/.test(text)) return "c_level"
  if (/\bvp\b|vice president/.test(text)) return "vp"
  if (/head of|dyrektor/.test(text)) return "head"
  if (/director/.test(text)) return "director"
  if (/kierownik|manager/.test(text)) return "manager"
  if (/senior/.test(text)) return "senior"
  return "manager"
}

function minimalExpansion(input: QueryExpansionInput): QueryExpansion {
  const phrase = input.phrase.trim()
  const polish = /[ąćęłńóśźż]/i.test(phrase)
  const llm: ExpansionLLMOutput = {
    inputPhrase: phrase,
    detectedLanguage: polish ? "pl" : "en",
    canonicalRole: {
      titleEn: phrase,
      titlePl: phrase,
      function: "engineering",
      seniority: guessSeniority(phrase),
      track: "management",
    },
    relatedTitles: [
      { title: phrase, lang: polish ? "pl" : "en", relation: "equivalent", weight: 1 },
      { title: `Senior ${phrase}`.slice(0, 80), lang: "en", relation: "step_up", weight: 0.7 },
      { title: `${phrase} Lead`.slice(0, 80), lang: "en", relation: "adjacent", weight: 0.6 },
    ],
    seniorityVariants: [],
    synonyms: { en: [], pl: [] },
    signalKeywords: [],
    exclusions: {
      titleKeywords: ["intern", "junior"],
      descriptionKeywords: [],
      rationale: "Deterministic fallback used because no model output was available.",
    },
    webQueries: [`${phrase} ${input.locationHint ?? "Poland remote"}`.slice(0, 200)],
  }
  const parsed = ExpansionLLMOutputSchema.parse(llm)
  return {
    ...parsed,
    version: QUERY_EXPANSION_VERSION,
    searchQueries: buildSearchQueries(parsed, input),
  }
}
