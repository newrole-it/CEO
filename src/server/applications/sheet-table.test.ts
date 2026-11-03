import { describe, expect, it } from "vitest"
import { appsScriptSource, statusColors } from "./apps-script"
import {
  buildSheetTable,
  parseCsv,
  parseDay,
  parseNextCell,
  parseStatusCell,
  readHeader,
  readRow,
  safeCell,
  sheetDate,
  statusOptions,
  toCsv,
  writtenFields,
} from "./sheet-table"
import { app } from "./sheet-fixtures"
import { isWebhookUrl, parseSyncError, readSheetResponse, readSyncResponse } from "./sheet"

describe("sheet table", () => {
  it("has the person's own columns, the two salaries and the hidden ID columns", () => {
    expect(buildSheetTable([], { locale: "pl" }).header).toEqual([
      "Lp.",
      "Data aplikacji",
      "Firma",
      "Stanowisko",
      "Lokalizacja / tryb",
      "Źródło",
      "Status",
      "Ostatnia aktualizacja",
      "Następny krok / uwagi",
      "Widełki z ogłoszenia",
      "newrole.it ID",
      "newrole.it edited",
    ])
    const csv = buildSheetTable([], { target: "csv" }).header
    expect(csv).toContain("Link")
    expect(csv).not.toContain("newrole.it edited")
    expect(buildSheetTable([], { locale: "en" }).header[2]).toBe("Company")
  })

  it("puts active applications first, numbers them and leaves deleted ones out", () => {
    const table = buildSheetTable([
      app({ id: "a", company: "A", status: "REJECTED", closedAtStage: "INTERVIEW" }),
      app({ id: "b", company: "B", status: "OFFER" }),
      app({ id: "d", company: "D", appliedAt: new Date("2026-10-20T10:00:00Z") }),
      app({ id: "x", company: "X", status: "DELETED" }),
    ])
    expect(table.rows.map((row) => row[2])).toEqual(["D", "B", "A"])
    expect(table.rows.map((row) => row[0])).toEqual(["1", "2", "3"])
    expect(table.ids).toEqual(["d", "b", "a"])
    expect(table.rows[2][6]).toBe("Odrzucono")
    expect(table.rows[2][8]).toBe("Po etapie: Rozmowy")
  })

  it("writes Polish dates, merged cells and the offer's site as the source", () => {
    const [row] = buildSheetTable([
      app({
        appliedAt: new Date("2026-10-01T22:30:00Z"),
        location: "Warszawa",
        workplace: "HYBRID",
        url: "https://www.linkedin.com/jobs/view/123",
        status: "INTERVIEW",
        stageNote: "2. rozmowa techniczna",
        salaryText: "20 000–25 000 PLN",
        statedSalary: "24 000 PLN",
        nextStep: "Rozmowa z CTO",
        nextStepAt: new Date("2026-11-05T09:00:00Z"),
        notes: "Pytać o zespół",
      }),
    ]).rows
    expect(row.slice(1, 10)).toEqual([
      "02.10.2026",
      "Allegro",
      "Engineering Manager",
      "Warszawa / hybrydowo",
      "linkedin.com",
      "Rozmowy",
      "02.10.2026",
      "Etap: 2. rozmowa techniczna\nNastępny krok: Rozmowa z CTO (05.11.2026)\nPytać o zespół",
      "20 000–25 000 PLN",
    ])
    expect(row).not.toContain("24 000 PLN")
    expect(sheetDate(null)).toBe("")
  })

  it("keeps the Status cell to a dropdown option", () => {
    const options = statusOptions("pl")
    expect(options).toContain("Rozmowy")
    expect(options).not.toContain("Usunięte")
    const statuses = ["APPLIED", "INTERVIEW", "REJECTED", "OFFER"] as const
    const rows = buildSheetTable(
      statuses.map((status, i) =>
        app({ id: `a${i}`, status, stageNote: "etap", closedAtStage: "TASK" })
      )
    ).rows
    for (const row of rows) expect(options).toContain(row[6])
  })

  it("keeps formulas as text", () => {
    expect(safeCell('=IMPORTXML("x")')).toBe('\'=IMPORTXML("x")')
    expect(safeCell("@here")).toBe("'@here")
    expect(safeCell("-5")).toBe("-5")
    expect(safeCell("Backend")).toBe("Backend")
  })
})

describe("reading rows", () => {
  it("reads dates as people type them", () => {
    expect(parseDay("02.11.2026")).toBe("2026-11-02")
    expect(parseDay("2.11.26")).toBe("2026-11-02")
    expect(parseDay("2026-11-02")).toBe("2026-11-02")
    expect(parseDay("02/11/2026 14:30")).toBe("2026-11-02")
    expect(parseDay("31.02.2026")).toBeNull()
    expect(parseDay("wtorek")).toBeNull()
  })

  it("maps known labels, keeps the person's own words as the stage", () => {
    expect(parseStatusCell("Rozmowy · 2. rozmowa")).toEqual({
      status: "INTERVIEW",
      stageNote: "2. rozmowa",
      closedAtStage: null,
    })
    expect(parseStatusCell("Odrzucono (po etapie: Zadanie)")).toMatchObject({
      status: "REJECTED",
      closedAtStage: "TASK",
    })
    expect(parseStatusCell("Odrzucona po rozmowie")).toMatchObject({
      status: "REJECTED",
      stageNote: "Odrzucona po rozmowie",
    })
    expect(parseStatusCell("Czekam na feedback")).toEqual({
      status: "APPLIED",
      stageNote: "Czekam na feedback",
      closedAtStage: null,
    })
    expect(parseStatusCell("rozmowa z HR")).toMatchObject({ status: "SCREENING" })
  })

  it("splits the next step from the notes", () => {
    expect(parseNextCell("Następny krok: Rozmowa z CTO (05.11.2026)\nPytać o zespół")).toEqual({
      nextStep: "Rozmowa z CTO",
      nextStepAt: "2026-11-05",
      notes: "Pytać o zespół",
    })
    expect(
      parseNextCell("Po etapie: Zadanie\nEtap: 2. rozmowa\nNastępny krok: Telefon\nNotatka")
    ).toEqual({
      closedAtStage: "TASK",
      stageNote: "2. rozmowa",
      nextStep: "Telefon",
      nextStepAt: null,
      notes: "Notatka",
    })
    expect(parseNextCell("Zadzwonić w piątek")).toEqual({
      nextStep: null,
      nextStepAt: null,
      notes: "Zadzwonić w piątek",
    })
  })

  it("reads the stage from the next-step cell, or from an older Status cell", () => {
    const keys = readHeader(["Firma", "Stanowisko", "Następny krok / uwagi", "Status"])
    expect(
      readRow(keys, ["Allegro", "EM", "Etap: 2. rozmowa\nNotatka", "Rozmowy"], null)?.fields
    ).toMatchObject({ status: "INTERVIEW", stageNote: "2. rozmowa", notes: "Notatka" })
    expect(
      readRow(keys, ["Allegro", "EM", "Notatka", "Rozmowy · 1. rozmowa"], null)?.fields
    ).toMatchObject({ status: "INTERVIEW", stageNote: "1. rozmowa", notes: "Notatka" })
    const written = app({
      status: "REJECTED",
      closedAtStage: "INTERVIEW",
      stageNote: "po finale",
      nextStep: "Feedback",
      notes: "x",
    })
    expect(writtenFields(written)).toMatchObject({
      status: "REJECTED",
      closedAtStage: "INTERVIEW",
      stageNote: "po finale",
      nextStep: "Feedback",
      notes: "x",
    })
  })

  it("reads the person's own tab by its headers, in any order", () => {
    const keys = readHeader([
      "Lp.",
      "Firma",
      "Data aplikacji",
      "Stanowisko",
      "Lokalizacja / tryb",
      "Źródło",
      "Status",
      "Ostatnia aktualizacja",
      "Następny krok / uwagi",
      "Kolumna własna",
    ])
    const row = readRow(
      keys,
      [
        "1",
        "Allegro",
        "15.10.2026",
        "EM",
        "Poznań / zdalnie",
        "LinkedIn",
        "Rozmowy",
        "20.10.2026",
        "Czekam",
        "x",
      ],
      null
    )
    expect(row?.id).toBeNull()
    expect(row?.fields).toEqual({
      company: "Allegro",
      appliedAt: "2026-10-15",
      title: "EM",
      location: "Poznań / zdalnie",
      origin: "LinkedIn",
      status: "INTERVIEW",
      stageNote: null,
      closedAtStage: null,
      nextStep: null,
      nextStepAt: null,
      notes: "Czekam",
      url: null,
    })
    expect(readRow(keys, ["7", "", "", "", "", "", "", "", "", ""], null)).toBeNull()
  })

  it("reads back exactly what it wrote", () => {
    const written = app({
      url: "https://jobs.lever.co/x/1",
      status: "REJECTED",
      closedAtStage: "INTERVIEW",
      stageNote: "po finale",
      nextStepAt: new Date("2026-11-05T09:00:00Z"),
      notes: "a\n\nb",
      salaryText: "=30k",
    })
    const fields = writtenFields(written)
    expect(fields).toMatchObject({
      url: "https://jobs.lever.co/x/1",
      origin: "jobs.lever.co",
      status: "REJECTED",
      stageNote: "po finale",
      closedAtStage: "INTERVIEW",
      nextStep: null,
      nextStepAt: "2026-11-05",
      notes: "a\n\nb",
      salaryText: "=30k",
      appliedAt: "2026-10-01",
    })
  })

  it("parses CSV from spreadsheets: BOM, semicolons, quotes, blank lines", () => {
    expect(parseCsv('\uFEFFFirma;Stanowisko\r\n"Żabka; S.A.";"Dev ""Senior"""\n\n;\n')).toEqual([
      ["Firma", "Stanowisko"],
      ["Żabka; S.A.", 'Dev "Senior"'],
    ])
    const table = buildSheetTable([app({ notes: "x, y" })], { target: "csv" })
    expect(parseCsv(toCsv(table))).toEqual([table.header, ...table.rows])
  })
})

describe("csv", () => {
  it("quotes only when needed and ends lines with CRLF", () => {
    const csv = toCsv({
      header: ["Firma", "Notatki"],
      rows: [
        ["Allegro", "plain"],
        ["Żabka, S.A.", 'said "hi"\nnext line'],
      ],
    })
    expect(csv).toBe('Firma,Notatki\r\nAllegro,plain\r\n"Żabka, S.A.","said ""hi""\nnext line"\r\n')
  })
})

describe("webhook", () => {
  it("accepts only Apps Script web app URLs", () => {
    expect(isWebhookUrl("https://script.google.com/macros/s/AKfycbx_1-abc/exec")).toBe(true)
    expect(isWebhookUrl("https://script.google.com/a/macros/firma.pl/s/AKfy-1/exec")).toBe(true)
    expect(isWebhookUrl("https://script.google.com/macros/s/AKfy/dev")).toBe(false)
    expect(isWebhookUrl("http://script.google.com/macros/s/AKfy/exec")).toBe(false)
    expect(isWebhookUrl("https://evil.example/macros/s/AKfy/exec")).toBe(false)
  })

  it("reads the script reply", () => {
    expect(readSyncResponse(200, "application/json", '{"ok":true,"rows":3}', 3)).toEqual({
      ok: true,
      rows: 3,
      table: null,
      tableDetail: null,
    })
    expect(
      readSyncResponse(200, "application/json", '{"ok":true,"rows":3,"table":"no-service"}', 3)
    ).toMatchObject({ table: "no-service", tableDetail: null })
    expect(
      readSyncResponse(200, "application/json", '{"ok":true,"table":"error: Invalid range"}', 3)
    ).toMatchObject({ table: "error", tableDetail: "error: Invalid range" })
    expect(
      readSyncResponse(200, "application/json", '{"ok":false,"error":"bad-secret"}', 3)
    ).toMatchObject({
      ok: false,
      code: "secret",
    })
    expect(readSyncResponse(200, "text/html", "<html>Sign in</html>", 3)).toMatchObject({
      ok: false,
      code: "auth",
    })
    expect(readSyncResponse(404, "text/html", "", 3)).toMatchObject({ ok: false, code: "http" })
    expect(parseSyncError("auth: Google prosi o logowanie.")).toEqual({
      code: "auth",
      detail: "Google prosi o logowanie.",
    })
    expect(parseSyncError("something")).toEqual({ code: null, detail: "something" })
  })

  it("embeds the secret and colours every status label", () => {
    const script = appsScriptSource("abc123")
    expect(script).toContain('var SECRET = "abc123";')
    expect(script).toContain("function doPost(e)")
    expect(script).toContain("function doGet()")
    expect(script).toContain("function onEdit(e)")
    expect(script).toContain("whenTextStartsWith(label)")
    expect(script).toContain('error: "foreign-tab"')
    // A table with Status as a dropdown, or a plain dropdown without the Sheets service.
    expect(script).toContain("addTable")
    expect(script).toContain('fields: "range,columnProperties"')
    expect(script).toContain('columnType = "DROPDOWN"')
    expect(script).toContain("requireValueInList(options, true)")
    // The table is reshaped before the rows go in, and a failed write never empties the tab.
    expect(script.indexOf("table_(book, sheet")).toBeLessThan(
      script.indexOf("range.setValues(values)")
    )
    expect(script).not.toContain("clearContents()")
    expect(script).toContain('error: "exception: " + errorText_(err)')
    // A table column has its own type and refuses a number format: never fatal.
    expect(script.match(/setNumberFormat\("@"\)/g)).toHaveLength(1)
    const colors = statusColors()
    expect(colors["Odrzucono"]).toEqual(colors["Rejected"])
    expect(Object.keys(colors)).toHaveLength(22)
  })

  it("reads the tab the script returns, and tells an old script apart", () => {
    const read = readSheetResponse(
      200,
      "application/json",
      JSON.stringify({ ok: true, exists: true, header: ["Firma"], rows: [["A"]], links: [null] })
    )
    expect(read).toEqual({
      ok: true,
      read: { exists: true, header: ["Firma"], rows: [["A"]], links: [null] },
    })
    expect(
      readSheetResponse(200, "application/json", '{"ok":false,"error":"no-header"}')
    ).toMatchObject({ ok: false, code: "outdated" })
    expect(
      readSyncResponse(200, "application/json", '{"ok":false,"error":"foreign-tab"}', 1)
    ).toMatchObject({ ok: false, code: "foreign" })
  })
})
