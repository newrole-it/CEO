import { randomBytes } from "crypto"
import { unlink, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

/** Reads a PDF from a temp file and deletes the file before returning. */
export async function extractPdfText(bytes: Buffer): Promise<string> {
  const file = join(tmpdir(), `jobscanner-cv-${randomBytes(8).toString("hex")}.pdf`)
  await writeFile(file, new Uint8Array(bytes))
  try {
    const { extractText, getDocumentProxy } = await import("unpdf")
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const result = await extractText(pdf, { mergePages: true })
    const text = result.text
    return Array.isArray(text) ? text.join("\n") : String(text ?? "")
  } finally {
    await unlink(file).catch(() => undefined)
  }
}
