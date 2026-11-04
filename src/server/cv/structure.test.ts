import { describe, expect, it, vi } from "vitest"

vi.mock("db", () => ({ default: {} }))
vi.mock("@newrole/profile/pdf", () => ({ extractPdfText: vi.fn() }))
vi.mock("src/server/llm/client", () => ({ createLlmClient: () => null }))
vi.mock("./service", async () => ({
  ...(await vi.importActual<typeof import("./service")>("./service")),
  storedPdf: vi.fn(),
  createCv: vi.fn(async (input: unknown) => input),
}))

import { extractPdfText } from "@newrole/profile/pdf"
import { createCv, storedPdf } from "./service"
import { createEditableFromUpload } from "./structure"

describe("createEditableFromUpload", () => {
  it("takes the language of the CV's text, not the one stored with the upload", async () => {
    vi.mocked(storedPdf).mockResolvedValue({
      bytes: Buffer.from("%PDF"),
      title: "CV_EN",
      language: "pl",
    })
    vi.mocked(extractPdfText).mockResolvedValue(
      "Anna Przykładowa, Łódź. I lead engineering teams and design platforms from the first plan to production. I have built and led a team of developers, and I work with the product team on the company's goals. Experience: Head of Engineering, five years in the role."
    )
    await createEditableFromUpload(7, "cv1")
    expect(vi.mocked(createCv).mock.calls[0][0]).toMatchObject({
      title: "CV_EN (editable)",
      language: "en",
      content: { consent: null, sections: [{ title: "Profile" }] },
    })
  })
})
