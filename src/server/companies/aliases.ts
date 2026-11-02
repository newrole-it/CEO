import db from "db"
import { COMPANY_ALIASES, type CompanyAliasEntry } from "config/company-aliases"
import { companyKey } from "src/server/gmail/allowlist"
import { companyNameKey, readCompanyName, type CompanyMap } from "./names"

/**
 * The company map in CompanyAlias: which names and keys belong to which company in the index. Rows
 * are never deleted: a wrong one is switched off for good by setting its confidence to 0, and the
 * sync does not bring it back. The sync switches off, the same way, what it no longer plans.
 * Company rows themselves are not merged: jobs, watchlists and career pages keep pointing where
 * they did, and two rows sharing a key count as one company.
 */

export type AliasRow = {
  companyId: string
  alias: string
  normalizedAlias: string
  confidence: number
}

/** How far each source can be trusted: the company's own name, a sourced fact, its ATS board. */
const CONFIDENCE = { name: 1, curated: 1, board: 0.9 } as const

const SYNC_EVERY_MS = 60 * 60 * 1000

/**
 * A board id as an ATS address spells it: "booksy-1", "realtimeboardglobal" (Miro). Not a host
 * ("careers.allegro.eu"), a tenant path ("visa/wd5/Visa") or a region prefix ("eu:olx").
 */
const SLUG_BOARD = /^[a-z][a-z0-9_-]{2,39}$/i

export function planCompanyAliases(input: {
  companies: { id: string; name: string }[]
  boards: { companyId: string; boardId: string | null }[]
  curated?: Pick<CompanyAliasEntry, "company" | "aliases">[]
}): AliasRow[] {
  const rows = new Map<string, AliasRow>()
  const add = (companyId: string, alias: string, key: string, confidence: number) => {
    if (key.length < 2) return
    const id = `${companyId}|${key}`
    if (!rows.has(id)) rows.set(id, { companyId, alias, normalizedAlias: key, confidence })
  }

  const byKey = new Map<string, string[]>()
  for (const company of input.companies) {
    const key = companyNameKey(company.name)
    if (!key) continue
    add(company.id, readCompanyName(company.name), key, CONFIDENCE.name)
    byKey.set(key, [...(byKey.get(key) ?? []), company.id])
  }

  for (const entry of input.curated ?? COMPANY_ALIASES) {
    for (const companyId of byKey.get(companyNameKey(entry.company)) ?? []) {
      for (const alias of entry.aliases) {
        add(companyId, alias, companyKey(alias), CONFIDENCE.curated)
      }
    }
  }

  for (const { companyId, boardId } of input.boards) {
    if (boardId && SLUG_BOARD.test(boardId)) {
      add(companyId, boardId, companyKey(boardId), CONFIDENCE.board)
    }
  }
  return [...rows.values()]
}

/**
 * Active rows the plan no longer makes: an alias taken out of config/company-aliases.ts, a board
 * that moved, a renamed company. The model does not say who wrote a row, but the search pipeline's
 * own row is keyed by the company's normalizedName, so that one stays. Companies created after the
 * plan was read are left alone.
 */
export function staleAliasIds(input: {
  active: { id: string; companyId: string; normalizedAlias: string }[]
  planned: Pick<AliasRow, "companyId" | "normalizedAlias">[]
  companies: { id: string; normalizedName: string }[]
}): string[] {
  const planned = new Set(input.planned.map((row) => `${row.companyId}|${row.normalizedAlias}`))
  const normalizedName = new Map(
    input.companies.map((company) => [company.id, company.normalizedName])
  )
  return input.active
    .filter((row) => {
      const own = normalizedName.get(row.companyId)
      if (own === undefined || own === row.normalizedAlias) return false
      return !planned.has(`${row.companyId}|${row.normalizedAlias}`)
    })
    .map((row) => row.id)
}

export async function syncCompanyAliases(
  options: { curated?: Pick<CompanyAliasEntry, "company" | "aliases">[] } = {}
): Promise<{ added: number; planned: number; switchedOff: number }> {
  const [companies, boards, active] = await Promise.all([
    db.company.findMany({ select: { id: true, name: true, normalizedName: true } }),
    db.careerPage.findMany({
      where: { providerBoardId: { not: null } },
      select: { companyId: true, providerBoardId: true },
    }),
    db.companyAlias.findMany({
      where: { confidence: { gt: 0 } },
      select: { id: true, companyId: true, normalizedAlias: true },
    }),
  ])
  const rows = planCompanyAliases({
    companies,
    boards: boards.flatMap(({ companyId, providerBoardId }) =>
      companyId ? [{ companyId, boardId: providerBoardId }] : []
    ),
    curated: options.curated,
  })
  const { count } = await db.companyAlias.createMany({ data: rows, skipDuplicates: true })
  // Switched off, not deleted: the same convention as a wrong row, which the sync never revives.
  const stale = staleAliasIds({ active, planned: rows, companies })
  let switchedOff = 0
  for (let start = 0; start < stale.length; start += 1000) {
    const { count: off } = await db.companyAlias.updateMany({
      where: { id: { in: stale.slice(start, start + 1000) }, confidence: { gt: 0 } },
      data: { confidence: 0 },
    })
    switchedOff += off
  }
  return { added: count, planned: rows.length, switchedOff }
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
  const keys = [...new Set(names.map(companyNameKey).filter(Boolean))]
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
