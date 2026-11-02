import { companyKey, companyWords } from "src/server/gmail/allowlist"

/**
 * One company goes by many spellings: "Careers at Tide", "Wolt - English", "Techland S.A.". This
 * reads a name into the key it is compared by, the CompanyAlias.normalizedAlias of the rows written
 * by aliases.ts. A bracket is cut and never read as a second name: "Mangopay (incl. Nethone)" names
 * a standalone company. That one company has another name is a fact with a source, so it belongs in
 * config/company-aliases.ts.
 */

const BOARD_PREFIX = /^(?:careers?|jobs?|kariera|praca|work)\s+(?:at|in|with|w|@)\s+/i
const BOARD_SUFFIX = /\s+(?:careers?|jobs?|kariera)$/i

/** Where a person's application can get the site's name for a company's: "LinkedIn" on its feed. */
const PLATFORMS = new Set([
  "linkedin",
  "justjoin",
  "justjoinit",
  "nofluffjobs",
  "pracuj",
  "pracujpl",
  "theprotocol",
  "bulldogjob",
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "teamtailor",
  "recruitee",
  "smartrecruiters",
  "personio",
  "bamboohr",
  "breezy",
  "pinpoint",
  "traffit",
  "jobvite",
  "workday",
  "icims",
  "erecruiter",
])

/** The name without brackets, board wording and a descriptor after a dash. */
export function readCompanyName(raw: string): string {
  const main = raw
    .replace(/\s+/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .trim()
    .replace(BOARD_PREFIX, "")
    .replace(BOARD_SUFFIX, "")
    .split(/\s+[-–—|·:]\s+/)[0]!
    .trim()
  return main || raw.trim()
}

/** The key of a name; empty when too short to mean anything. */
export function companyNameKey(raw: string): string {
  const key = companyKey(readCompanyName(raw))
  return key.length >= 2 ? key : ""
}

/** The site an application or offer is on, given as its company: says nothing about the employer. */
export function isPlatformName(name: string, url?: string | null): boolean {
  const key = companyKey(name)
  if (!PLATFORMS.has(key) || !url) return false
  try {
    return new URL(url).hostname.replace(/[^a-z0-9]/g, "").includes(key)
  } catch {
    return false
  }
}

/** Company ids behind each key, from CompanyAlias. */
export type CompanyMap = ReadonlyMap<string, readonly string[]>

export type CompanyIdentity = { key: string; ids: Set<string>; words: string[] }

export function identifyCompany(
  name: string,
  map: CompanyMap = new Map(),
  companyId?: string | null
): CompanyIdentity {
  const key = companyNameKey(name)
  const ids = new Set(map.get(key) ?? [])
  if (companyId) ids.add(companyId)
  const words = companyWords(readCompanyName(name))
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  return { key, ids, words }
}

const LETTERS_FOR_SIMILAR = 4

function startsWithWords(longer: string[], shorter: string[]): boolean {
  return (
    shorter.length < longer.length &&
    shorter.join("").length >= LETTERS_FOR_SIMILAR &&
    shorter.every((word, index) => longer[index] === word)
  )
}

/**
 * same: one key or one company in the map. similar: one name opens the other, "Swift Harbor" and
 * "Swift Harbor Solutions", which "Text" and "Text Systems" also do, so it never counts alone.
 */
export function compareCompanies(
  a: CompanyIdentity,
  b: CompanyIdentity
): "same" | "similar" | null {
  if (a.key && a.key === b.key) return "same"
  if ([...a.ids].some((id) => b.ids.has(id))) return "same"
  if (startsWithWords(a.words, b.words) || startsWithWords(b.words, a.words)) return "similar"
  return null
}
