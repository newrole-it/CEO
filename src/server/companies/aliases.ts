import db from "db"
import { COMPANY_ALIASES, type CompanyAliasEntry } from "config/company-aliases"
import { companyKey } from "src/server/gmail/allowlist"
import { companyKeys, readCompanyName, type CompanyMap } from "./names"

/**
 * The company map in CompanyAlias: which names and keys belong to which company in the index. Rows
 * are only ever added, so a wrong one is switched off for good by setting its confidence to 0;
 * the sync does not bring it back. Company rows themselves are not merged: jobs, watchlists and
 * career pages keep pointing where they did, and two rows sharing a key count as one company.
 */

export type AliasRow = {
  companyId: string
  alias: string
  normalizedAlias: string
  confidence: number
}

/** How far each source can be trusted: the company's own name, a bracket, its ATS board. */
const CONFIDENCE = { name: 1, curated: 1, board: 0.9, bracket: 0.8 } as const

const SYNC_EVERY_MS = 60 * 60 * 1000

/**
 * A board id as an ATS address spells it: "booksy-1", "realtimeboardglobal" (Miro). Not a host
 * ("careers.allegro.eu"), a tenant path ("visa/wd5/Visa") or a region prefix ("eu:olx").
 */
const SLUG_BOARD = /^[a-z][a-z0-9_-]{2,39}$/i

export function planCompanyAliases(input: {
  companies: { id: string; name: string }[]
  boards: { companyId: string; boardId: string | null }[]
  curated?: CompanyAliasEntry[]
}): AliasRow[] {
  const rows = new Map<string, AliasRow>()
  const add = (companyId: string, alias: string, key: string, confidence: number) => {
    if (key.length < 2) return
    const id = `${companyId}|${key}`
    if (!rows.has(id)) rows.set(id, { companyId, alias, normalizedAlias: key, confidence })
  }

  const byKey = new Map<string, string[]>()
  for (const company of input.companies) {
    const keys = companyKeys(company.name)
    const { main, also } = readCompanyName(company.name)
    const key = companyKey(main)
    if (key.length >= 2) {
      add(company.id, main, key, CONFIDENCE.name)
      byKey.set(key, [...(byKey.get(key) ?? []), company.id])
    }
    for (const name of also) {
      if (keys.includes(companyKey(name))) add(company.id, name, companyKey(name), CONFIDENCE.bracket)
    }
  }

  for (const entry of input.curated ?? COMPANY_ALIASES) {
    for (const companyId of byKey.get(companyKeys(entry.company)[0] ?? "") ?? []) {
      for (const alias of entry.aliases) add(companyId, alias, companyKey(alias), CONFIDENCE.curated)
    }
  }

  for (const { companyId, boardId } of input.boards) {
    if (boardId && SLUG_BOARD.test(boardId)) {
      add(companyId, boardId, companyKey(boardId), CONFIDENCE.board)
    }
  }
  return [...rows.values()]
}

export async function syncCompanyAliases(): Promise<{ added: number; planned: number }> {
  const [companies, boards] = await Promise.all([
    db.company.findMany({ select: { id: true, name: true } }),
    db.careerPage.findMany({
      where: { providerBoardId: { not: null } },
      select: { companyId: true, providerBoardId: true },
    }),
  ])
  const rows = planCompanyAliases({
    companies,
    boards: boards.flatMap(({ companyId, providerBoardId }) =>
      companyId ? [{ companyId, boardId: providerBoardId }] : []
    ),
  })
  const { count } = await db.companyAlias.createMany({ data: rows, skipDuplicates: true })
  return { added: count, planned: rows.length }
}

let lastSyncAt = 0

/** New companies reach the index all the time, so the worker keeps the map up to date. */
export async function maybeSyncCompanyAliases(now = Date.now()): Promise<void> {
  if (now - lastSyncAt < SYNC_EVERY_MS) return
  lastSyncAt = now
  await syncCompanyAliases().catch((error) => {
    console.warn("company aliases", error instanceof Error ? error.message : error)
  })
}

export async function companyMapFor(names: string[]): Promise<CompanyMap> {
  const keys = [...new Set(names.flatMap(companyKeys))]
  const map = new Map<string, string[]>()
  if (!keys.length) return map
  const rows = await db.companyAlias.findMany({
    where: { normalizedAlias: { in: keys }, confidence: { gt: 0 } },
    select: { companyId: true, normalizedAlias: true },
  })
  for (const { companyId, normalizedAlias } of rows) {
    map.set(normalizedAlias, [...(map.get(normalizedAlias) ?? []), companyId])
  }
  return map
}
