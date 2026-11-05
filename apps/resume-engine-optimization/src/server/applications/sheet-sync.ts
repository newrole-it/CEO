import { DELETED_STATUS } from "src/shared/applications"
import {
  fieldsHash,
  readHeader,
  readRow,
  sheetDate,
  syncKeys,
  writtenFields,
  type SheetApplication,
  type SheetFields,
  type SheetLocale,
} from "./sheet-table"

/**
 * Two-way sync as a plan, before anything is written: which sheet rows become applications, which
 * applications take a change made in the sheet, which ones the sheet no longer has. Pure.
 */

export type SheetRead = {
  exists: boolean
  header: string[]
  rows: string[][]
  /** The first link in each data row (the role cell in a tab newrole.it wrote) */
  links: (string | null)[]
}

export type SyncApplication = SheetApplication & {
  /** How newrole.it last wrote this application to the sheet; null if it never did */
  sheetRow: { hash: string; syncedAt: Date } | null
}

export type SyncPlan = {
  /** Rows nobody in newrole.it knows yet */
  creates: SheetFields[]
  /** Changes made in the sheet, only the fields that differ from what newrole.it holds */
  updates: { id: string; fields: SheetFields }[]
  /** Applications whose row was deleted from the sheet: kept, with status DELETED */
  deletes: string[]
  /** The tab holds rows newrole.it did not write: it takes the tab over, after a copy */
  adopt: boolean
  /** Rows left out: no company or role, or an ID that is not this person's application */
  skipped: number
}

const EMPTY: SyncPlan = { creates: [], updates: [], deletes: [], adopt: false, skipped: 0 }

function same(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null)
}

function fold(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Company, role and day: the same application typed twice, or one already in newrole.it. */
function matchKey(
  company: string | null | undefined,
  title: string | null | undefined,
  day: string | null | undefined
) {
  return `${fold(company)}|${fold(title)}|${day ?? ""}`
}

/** Status and its stage label travel together: a new status from the sheet brings its label. */
function changedKeys(row: SheetFields, written: SheetFields, keys: (keyof SheetFields)[]) {
  const changed = keys.filter((key) => row[key] !== undefined && !same(row[key], written[key]))
  if (changed.includes("status") && !changed.includes("stageNote") && row.stageNote !== undefined)
    changed.push("stageNote")
  return changed
}

function pick(fields: SheetFields, keys: (keyof SheetFields)[]): SheetFields {
  const out: SheetFields = {}
  for (const key of keys) (out as Record<string, unknown>)[key] = fields[key]
  return out
}

export function planSheetSync(
  read: SheetRead,
  apps: SyncApplication[],
  opts: { includeNotes: boolean; locale?: SheetLocale; now: Date }
): SyncPlan {
  if (!read.exists || !read.header.length) return EMPTY
  const keys = readHeader(read.header)
  const hasIds = keys.includes("id")
  const compare = syncKeys(opts.includeNotes)
  const byId = new Map(apps.map((app) => [app.id, app]))
  const byKey = new Map(
    apps.map((app) => [matchKey(app.company, app.title, sheetDate(app.appliedAt)), app])
  )
  const plan: SyncPlan = { creates: [], updates: [], deletes: [], adopt: false, skipped: 0 }
  const seen = new Set<string>()
  let rowsWithId = 0
  let dataRows = 0

  read.rows.forEach((cells, index) => {
    const row = readRow(keys, cells, read.links[index] ?? null)
    if (!row) return
    dataRows += 1
    const { fields } = row
    if (row.id) {
      rowsWithId += 1
      const app = byId.get(row.id)
      if (!app) {
        // Deleted in newrole.it, or copied from someone else's sheet: the write drops it.
        plan.skipped += 1
        return
      }
      seen.add(app.id)
      const written = writtenFields(app, { locale: opts.locale, includeNotes: opts.includeNotes })
      const now = fieldsHash({ ...written, ...fields }, compare)
      const baseline = app.sheetRow?.hash ?? fieldsHash(written, compare)
      if (now === baseline) return
      const appChanged = !app.sheetRow || app.updatedAt > app.sheetRow.syncedAt
      const sheetTime = row.editedAt ?? opts.now
      if (appChanged && app.updatedAt > sheetTime) return
      const changed = changedKeys(fields, written, compare)
      if (changed.length) plan.updates.push({ id: app.id, fields: pick(fields, changed) })
      return
    }
    if (!fields.company || !fields.title) {
      plan.skipped += 1
      return
    }
    const known = byKey.get(matchKey(fields.company, fields.title, fields.appliedAt))
    if (known && !seen.has(known.id)) {
      // Already in newrole.it: the sheet only fills what newrole.it does not have.
      seen.add(known.id)
      const written = writtenFields(known, { locale: opts.locale, includeNotes: opts.includeNotes })
      const gaps = compare.filter(
        (key) => fields[key] != null && (written[key] == null || written[key] === "")
      )
      if (gaps.length) plan.updates.push({ id: known.id, fields: pick(fields, gaps) })
      return
    }
    plan.creates.push(fields)
  })

  plan.adopt = !hasIds && dataRows > 0
  // No row with an ID at all means the tab was cleared or swapped, not that rows were deleted.
  if (hasIds && rowsWithId > 0) {
    for (const app of apps) {
      if (app.sheetRow && app.status !== DELETED_STATUS && !seen.has(app.id))
        plan.deletes.push(app.id)
    }
  }
  return plan
}
