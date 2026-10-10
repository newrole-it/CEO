import { randomBytes } from "crypto"
import { unlink, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { createLlmClient } from "src/server/llm/client"
import { extractProfileFromText } from "src/server/profile/extract"
import { extractPdfText } from "src/server/profile/pdf"

export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: "Send a PDF or pasted text." }, { status: 400 })
  }
  const pasted = form.get("text")
  let text = typeof pasted === "string" ? pasted : ""
  const file = form.get("file")
  if (file instanceof File && file.size > 0) {
    if (file.size > 8_000_000) {
      return Response.json({ error: "That PDF is larger than 8 MB." }, { status: 400 })
    }
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return Response.json({ error: "Upload a PDF, or paste the text instead." }, { status: 400 })
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    const tmp = join(tmpdir(), `jobscanner-upload-${randomBytes(8).toString("hex")}.pdf`)
    await writeFile(tmp, new Uint8Array(bytes))
    try {
      text = `${text}\n${await extractPdfText(bytes)}`
    } catch {
      return Response.json(
        { error: "Could not read that PDF. Paste the text instead." },
        { status: 400 }
      )
    } finally {
      await unlink(tmp).catch(() => undefined)
    }
  }
  if (text.trim().length < 20) {
    return Response.json({ error: "Add a PDF or paste more of the CV." }, { status: 400 })
  }
  const draft = await extractProfileFromText(text, createLlmClient())
  return Response.json({ draft })
}
