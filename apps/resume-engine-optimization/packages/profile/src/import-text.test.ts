import { describe, expect, it } from "vitest"
import { importText, MAX_IMPORT_TEXT_CHARS } from "./import-text"
import { zip } from "./test-zip"

const CV = "Jan Kowalski\nSenior Backend Engineer\nAcme 2020–2024: Go, Kubernetes, PostgreSQL."

function file(name: string, type: string, content: Buffer | string): File {
  return new File([typeof content === "string" ? content : new Uint8Array(content)], name, { type })
}

describe("importText", () => {
  it("takes pasted text, cut to the limit", async () => {
    expect(await importText({ text: CV })).toEqual({ ok: true, text: CV })
    const long = await importText({ text: "x".repeat(MAX_IMPORT_TEXT_CHARS + 1) })
    expect(long).toMatchObject({ ok: false, status: 400, code: "too-long" })
  })

  it("asks for more when there is next to nothing", async () => {
    expect(await importText({ text: "Jan" })).toEqual({
      ok: false,
      status: 400,
      error: "Add a PDF or paste more of the CV.",
    })
  })

  it("reads LinkedIn's data export and adds it to a pasted note", async () => {
    const profile = `First Name,Last Name,Headline,Summary\nJan,Kowalski,Staff Engineer,Builds platforms for large teams.`
    const bytes = zip([{ name: "Basic_LinkedInDataExport/Profile.csv", content: profile }])
    const read = await importText({
      text: "Note",
      file: file("export.zip", "application/zip", bytes),
    })
    expect(read.ok).toBe(true)
    if (read.ok) {
      expect(read.text.startsWith("Note\n")).toBe(true)
      expect(read.text).toContain("Staff Engineer")
    }
  })

  it("refuses what is not a ZIP, a PDF it cannot read, and other files", async () => {
    const notZip = await importText({ file: file("export.zip", "application/zip", "nope") })
    expect(notZip).toMatchObject({ ok: false, status: 400, code: "not-zip" })
    const badPdf = await importText({ file: file("cv.pdf", "application/pdf", "not a pdf") })
    expect(badPdf).toEqual({
      ok: false,
      status: 400,
      error: "Could not read that PDF. Paste the text instead.",
    })
    const word = await importText({ file: file("cv.docx", "application/msword", "x") })
    expect(word).toMatchObject({ ok: false, error: "Upload a PDF, or paste the text instead." })
  })
})
