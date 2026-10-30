import { describe, expect, it } from "vitest"
import { appsScriptSource, statusColors } from "./apps-script"
import { buildSheetTable, safeCell, sheetDate, toCsv, type SheetApplication } from "./sheet-table"
import { isWebhookUrl, parseSyncError, readSyncResponse } from "./sheet"

const app = (over: Partial<SheetApplication>): SheetApplication => ({
  company: "Allegro",
  title: "Engineering Manager",
  status: "APPLIED",
  stageNote: null,
  closedAtStage: null,
  appliedAt: new Date("2026-10-01T10:00:00Z"),
  statusChangedAt: new Date("2026-10-01T10:00:00Z"),
  nextStep: null,
  nextStepAt: null,
  contact: null,
  location: null,
  salaryText: null,
  source: "nowarola",
  url: null,
  notes: null,
  updatedAt: new Date("2026-10-02T10:00:00Z"),
  ...over,
})

describe("sheet table", () => {
  it("has the Polish columns, notes only when included", () => {
    const table = buildSheetTable([], { locale: "pl" })
    expect(table.header).toEqual([
      "Firma",
      "Stanowisko",
      "Status",
      "Etap",
      "Odrzucono po",
      "Aplikowano",
      "W etapie od",
      "Następny krok",
      "Termin",
      "Kontakt",
      "Lokalizacja",
      "Wynagrodzenie",
      "Źródło",
      "Link",
      "Notatki",
      "Ostatnia zmiana",
    ])
    expect(buildSheetTable([], { includeNotes: false }).header).not.toContain("Notatki")
    expect(buildSheetTable([], { locale: "en" }).header[0]).toBe("Company")
  })

  it("puts active applications first in funnel order, then the newest", () => {
    const rows = buildSheetTable([
      app({ company: "A", status: "REJECTED", closedAtStage: "INTERVIEW" }),
      app({ company: "B", status: "OFFER" }),
      app({ company: "C", status: "APPLIED", appliedAt: new Date("2026-09-01T10:00:00Z") }),
      app({ company: "D", status: "APPLIED", appliedAt: new Date("2026-10-20T10:00:00Z") }),
    ]).rows
    expect(rows.map((row) => row[0])).toEqual(["D", "C", "B", "A"])
    expect(rows[3][2]).toBe("Odrzucono")
    expect(rows[3][4]).toBe("Rozmowy")
    expect(rows[2][4]).toBe("")
  })

  it("writes dates in Warsaw time and labels the source", () => {
    const [row] = buildSheetTable(
      [
        app({
          appliedAt: new Date("2026-10-01T22:30:00Z"),
          nextStepAt: new Date("2026-11-03T09:00:00Z"),
          source: "extension",
        }),
      ],
      { locale: "pl" }
    ).rows
    expect(row[5]).toBe("2026-10-02")
    expect(row[8]).toBe("2026-11-03")
    expect(row[12]).toBe("Rozszerzenie")
    expect(sheetDate(null)).toBe("")
  })

  it("keeps formulas as text", () => {
    expect(safeCell('=IMPORTXML("x")')).toBe('\'=IMPORTXML("x")')
    expect(safeCell("@here")).toBe("'@here")
    expect(safeCell("-5")).toBe("-5")
    expect(safeCell("Backend")).toBe("Backend")
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
    })
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
    expect(script).toContain("setFrozenRows(1)")
    const colors = statusColors()
    expect(colors["Odrzucono"]).toEqual(colors["Rejected"])
    expect(Object.keys(colors)).toHaveLength(20)
  })
})
