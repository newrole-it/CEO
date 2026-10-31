import { companyKey, companyWords } from "src/server/gmail/allowlist"

/**
 * One company goes by many names: "Careers at Tide", "Wolt - English", "Techland S.A.", "Samsung
 * (incl. SRPOL)". This reads a name into the keys it can be compared by. Keys are the
 * CompanyAlias.normalizedAlias of the rows written by aliases.ts.
 */

const BOARD_PREFIX = /^(?:careers?|jobs?|kariera|praca|work)\s+(?:at|in|with|w|@)\s+/i
const BOARD_SUFFIX = /\s+(?:careers?|jobs?|kariera)$/i
const SECOND_NAME = /^(?:incl\.?|including|acquired(?:\s+by)?|part\s+of|formerly|dawniej|aka)\s+/i
/** A bracket that says where or how, not who: "Acme (Remote)". "Poland" already has no key. */
const NO_COMPANY = new Set(["remote", "hybrid", "eu", "emea", "europe", "global", "english", "it"])

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
])

/** The name itself, and the other names a bracket gives. "Exadel (acquired Codete)". */
export function readCompanyName(raw: string): { main: string; also: string[] } {
  const also: string[] = []
  const unbracketed = raw.replace(/\s+/g, " ").replace(/\(([^)]*)\)/g, (_all, inner: string) => {
    also.push(inner.replace(SECOND_NAME, "").trim())
    return " "
  })
  const main = unbracketed
    .trim()
    .replace(BOARD_PREFIX, "")
    .replace(BOARD_SUFFIX, "")
    .split(/\s+[-–—|·:]\s+/)[0]!
    .trim()
  return { main: main || raw.trim(), also: also.filter(Boolean) }
}

/** Every key of a name, the main one first. A key too short to mean anything is left out. */
export function companyKeys(raw: string): string[] {
  const { main, also } = readCompanyName(raw)
  const keys = [companyKey(main), ...also.map(companyKey).filter((key) => !NO_COMPANY.has(key))]
  return [...new Set(keys)].filter((key) => key.length >= 2)
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

export type CompanyIdentity = { keys: string[]; ids: Set<string>; words: string[] }

export function identifyCompany(
  name: string,
  map: CompanyMap = new Map(),
  companyId?: string | null
): CompanyIdentity {
  const keys = companyKeys(name)
  const ids = new Set(keys.flatMap((key) => [...(map.get(key) ?? [])]))
  if (companyId) ids.add(companyId)
  const words = companyWords(readCompanyName(name).main)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  return { keys, ids, words }
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
 * same: one key or one company in the map. similar: one name opens the other, "Fast Forward" and
 * "Fast Forward Solutions", which "Text" and "Text Systems" also do, so it never counts alone.
 */
export function compareCompanies(
  a: CompanyIdentity,
  b: CompanyIdentity
): "same" | "similar" | null {
  if (a.keys.some((key) => b.keys.includes(key))) return "same"
  if ([...a.ids].some((id) => b.ids.has(id))) return "same"
  if (startsWithWords(a.words, b.words) || startsWithWords(b.words, a.words)) return "similar"
  return null
}
