import { readdir } from "fs/promises"
import { tmpdir } from "os"
import { describe, expect, it } from "vitest"
import { extractPdfText } from "./pdf"

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
})
