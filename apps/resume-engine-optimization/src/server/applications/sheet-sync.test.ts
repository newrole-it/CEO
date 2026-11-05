import { describe, expect, it } from "vitest"
import { planSheetSync, type SheetRead, type SyncApplication } from "./sheet-sync"
import { buildSheetTable, fieldsHash, syncKeys, writtenFields } from "./sheet-table"
import { app } from "./sheet-fixtures"

const now = new Date("2026-11-02T18:00:00Z")
const synced = new Date("2026-11-02T17:00:00Z")

/** An application as it was last written to the sheet at `synced`. */
function inSheet(over: Partial<SyncApplication> = {}): SyncApplication {
  const base = app({ updatedAt: new Date("2026-11-02T16:00:00Z"), ...over })
  return {
    ...base,
    sheetRow: { hash: fieldsHash(writtenFields(base), syncKeys(true)), syncedAt: synced },
  }
}

/** The tab exactly as newrole.it wrote these applications. */
function tab(apps: SyncApplication[]): SheetRead {
  const table = buildSheetTable(apps)
  return { exists: true, header: table.header, rows: table.rows, links: table.links }
}

const STATUS = 6
const NEXT = 8
const EDITED = 11

describe("planSheetSync", () => {
  it("does nothing when nobody touched the sheet", () => {
    const apps = [inSheet({ id: "a" }), inSheet({ id: "b", company: "B" })]
    expect(planSheetSync(tab(apps), apps, { includeNotes: true, now })).toEqual({
      creates: [],
      updates: [],
      deletes: [],
      adopt: false,
      skipped: 0,
    })
  })

  it("takes the person's own tab over: every row becomes an application", () => {
    const read: SheetRead = {
      exists: true,
      header: ["Lp.", "Data aplikacji", "Firma", "Stanowisko", "Status"],
      rows: [
        ["1", "15.10.2026", "Allegro", "EM", "Czekam na feedback"],
        ["2", "", "", "", ""],
        ["3", "16.10.2026", "", "Bez firmy", "Aplikowano"],
      ],
      links: [null, null, null],
    }
    const plan = planSheetSync(read, [], { includeNotes: true, now })
    expect(plan.adopt).toBe(true)
    expect(plan.skipped).toBe(1)
    expect(plan.creates).toEqual([
      {
        appliedAt: "2026-10-15",
        company: "Allegro",
        title: "EM",
        status: "APPLIED",
        stageNote: "Czekam na feedback",
        closedAtStage: null,
        url: null,
      },
    ])
  })

  it("does not create an application newrole.it already has, and fills its gaps", () => {
    const known = inSheet({
      id: "a",
      company: "Allegro",
      title: "EM",
      appliedAt: new Date("2026-10-15T10:00:00Z"),
    })
    const read: SheetRead = {
      exists: true,
      header: ["Data aplikacji", "Firma", "Stanowisko", "Widełki z ogłoszenia"],
      rows: [["15.10.2026", "Allegro", "EM", "25 000 PLN"]],
      links: [null],
    }
    const plan = planSheetSync(read, [known], { includeNotes: true, now })
    expect(plan.creates).toEqual([])
    expect(plan.updates).toEqual([{ id: "a", fields: { salaryText: "25 000 PLN" } }])
  })

  it("brings a sheet edit in when the system did not change since", () => {
    const apps = [inSheet({ id: "a" })]
    const read = tab(apps)
    read.rows[0][STATUS] = "Rozmowy · 1. rozmowa"
    const plan = planSheetSync(read, apps, { includeNotes: true, now })
    expect(plan.updates).toEqual([
      { id: "a", fields: { status: "INTERVIEW", stageNote: "1. rozmowa" } },
    ])
  })

  it("picks a status from the dropdown and keeps the stage written below the next step", () => {
    const apps = [inSheet({ id: "a", status: "INTERVIEW", stageNote: "1. rozmowa" })]
    const untouched = tab(apps)
    expect(planSheetSync(untouched, apps, { includeNotes: true, now }).updates).toEqual([])
    const read = tab(apps)
    read.rows[0][STATUS] = "Zadanie"
    read.rows[0][NEXT] = "Etap: zadanie domowe"
    expect(planSheetSync(read, apps, { includeNotes: true, now }).updates).toEqual([
      { id: "a", fields: { status: "TASK", stageNote: "zadanie domowe" } },
    ])
  })

  it("lets the newer change win when both sides changed", () => {
    const changedLater = { ...inSheet({ id: "a" }), updatedAt: new Date("2026-11-02T17:40:00Z") }
    const read = tab([inSheet({ id: "a" })])
    read.rows[0][STATUS] = "Oferta"
    read.rows[0][EDITED] = "2026-11-02T17:20:00.000Z"
    expect(planSheetSync(read, [changedLater], { includeNotes: true, now }).updates).toEqual([])
    read.rows[0][EDITED] = "2026-11-02T17:50:00.000Z"
    expect(planSheetSync(read, [changedLater], { includeNotes: true, now }).updates).toEqual([
      { id: "a", fields: { status: "OFFER", stageNote: null } },
    ])
  })

  it("marks a row deleted from the sheet, but not when the whole tab was emptied", () => {
    const apps = [inSheet({ id: "a" }), inSheet({ id: "b", company: "B" })]
    const read = tab(apps)
    read.rows = read.rows.filter((row) => row[10] !== "b")
    expect(planSheetSync(read, apps, { includeNotes: true, now }).deletes).toEqual(["b"])
    expect(planSheetSync({ ...read, rows: [] }, apps, { includeNotes: true, now }).deletes).toEqual(
      []
    )
    const neverWritten = [...apps.slice(0, 1), { ...apps[1], sheetRow: null }]
    expect(planSheetSync(read, neverWritten, { includeNotes: true, now }).deletes).toEqual([])
  })

  it("drops a row whose application was deleted in newrole.it", () => {
    const read = tab([inSheet({ id: "gone" })])
    expect(planSheetSync(read, [], { includeNotes: true, now })).toMatchObject({
      creates: [],
      updates: [],
      skipped: 1,
    })
  })

  it("ignores notes when the sheet does not show them", () => {
    const apps = [inSheet({ id: "a", notes: "prywatne" })]
    const table = buildSheetTable(apps, { includeNotes: false })
    const read = { exists: true, header: table.header, rows: table.rows, links: table.links }
    const withoutNotes = apps.map((item) => ({
      ...item,
      sheetRow: {
        hash: fieldsHash(writtenFields(item, { includeNotes: false }), syncKeys(false)),
        syncedAt: synced,
      },
    }))
    expect(planSheetSync(read, withoutNotes, { includeNotes: false, now }).updates).toEqual([])
  })
})
