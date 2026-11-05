import { readdir } from "fs/promises"
import { tmpdir } from "os"
import { describe, expect, it } from "vitest"
import { parseLinkedInProfile } from "./linkedin"
import { extractPdfText } from "./pdf"

/** A one-page PDF with each line drawn on its own baseline, built here so no fixture is needed. */
function pdfWithLines(lines: string[]): Buffer {
  const stream = lines
    .map((line, index) => `BT /F1 12 Tf 72 ${720 - index * 20} Td (${line}) Tj ET`)
    .join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, "latin1")
}

async function cvFiles(): Promise<string[]> {
  const names = await readdir(tmpdir())
  return names.filter(
    (name) => name.startsWith("jobscanner-cv-") || name.startsWith("jobscanner-upload-")
  )
}

describe("pdf extraction", () => {
  it("leaves nothing on disk and rejects a file that is not a PDF", async () => {
    const before = new Set(await cvFiles())
    await expect(extractPdfText(Buffer.from("this is not a pdf"))).rejects.toThrow()
    const left = (await cvFiles()).filter((name) => !before.has(name))
    expect(left).toEqual([])
  })

  it("keeps line breaks, so a CV's sections are found by their headings", async () => {
    const text = await extractPdfText(
      pdfWithLines([
        "Anna Example",
        "Backend Developer",
        "Experience",
        "Backend Developer, Example Payments, 2021 - present",
        "Built a payments API.",
        "Education",
        "Computer Science, Example University, 2012 - 2017",
      ])
    )
    expect(text.split("\n").map((line) => line.trim())).toContain("Experience")
    const kinds = parseLinkedInProfile(text)?.blocks.map((block) => block.kind) ?? []
    expect(kinds).toContain("experience")
    expect(kinds).toContain("education")
  })
})
