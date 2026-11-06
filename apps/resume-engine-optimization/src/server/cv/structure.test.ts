import { describe, expect, it, vi } from "vitest"

const writes: { kind: string; data: Record<string, unknown> }[] = []

vi.mock("db", () => {
  const tx = {
    $executeRaw: vi.fn(),
    cvDocument: {
      // mergeOne finds no editable copy from before: the PDF is read
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ kind: "document", data })
        return { count: 1 }
      }),
    },
    cvVersion: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ kind: "version", data })
        return data
      }),
    },
  }
  return { default: { $transaction: async (run: (client: typeof tx) => unknown) => run(tx) } }
})
vi.mock("@newrole/profile/pdf", () => ({ extractPdfText: vi.fn() }))
vi.mock("src/server/llm/client", () => ({ createLlmClient: () => null }))
vi.mock("./service", async () => ({
  ...(await vi.importActual<typeof import("./service")>("./service")),
  storedPdf: vi.fn(),
  getCv: vi.fn(),
}))

import { extractPdfText } from "@newrole/profile/pdf"
import { getCv, storedPdf } from "./service"
import { createEditableFromUpload } from "./structure"

describe("createEditableFromUpload", () => {
  it("makes the same CV editable, in the language of its text, and keeps the file as version 0", async () => {
    vi.mocked(getCv).mockResolvedValue({ id: "cv1", content: null } as never)
    vi.mocked(storedPdf).mockResolvedValue({
      bytes: Buffer.from("%PDF"),
      title: "CV_EN",
      name: "CV_EN.pdf",
      language: "pl",
    })
    vi.mocked(extractPdfText).mockResolvedValue(
      "Anna Przykładowa, Łódź. I lead engineering teams and design platforms from the first plan to production. I have built and led a team of developers, and I work with the product team on the company's goals. Experience: Head of Engineering, five years in the role."
    )
    await createEditableFromUpload(7, "cv1", null)
    const [document, version] = writes
    expect(document.data).toMatchObject({
      kind: "EDITABLE",
      language: "en",
      pdf: null,
      content: { consent: null, sections: [{ title: "Profile" }] },
    })
    expect(version.data).toMatchObject({
      documentId: "cv1",
      number: 0,
      origin: "upload",
      pdfName: "CV_EN.pdf",
    })
    expect(String(version.data.pdf)).toBe("%PDF")
  })
})
