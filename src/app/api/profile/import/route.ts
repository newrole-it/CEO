import { getBlitzContext } from "src/app/blitz-server"
import { draftFromProfileText } from "src/server/profile/import"
import {
  ExportError,
  isZipBytes,
  linkedInExportText,
  MAX_ZIP_BYTES,
} from "src/server/profile/linkedin-export"
import { extractPdfText } from "src/server/profile/pdf"

const MAX_PDF_BYTES = 8_000_000

function isZipFile(file: File): boolean {
  return /zip/.test(file.type) || file.name.toLowerCase().endsWith(".zip")
}

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
    if (isZipFile(file)) {
      if (file.size > MAX_ZIP_BYTES) {
        return Response.json({ error: "That ZIP is larger than 50 MB." }, { status: 400 })
      }
      const bytes = Buffer.from(await file.arrayBuffer())
      try {
        if (!isZipBytes(bytes)) throw new ExportError("not-zip", "That file is not a ZIP archive.")
        text = `${text}\n${linkedInExportText(bytes)}`.trim()
      } catch (error) {
        const code = error instanceof ExportError ? error.code : "not-zip"
        return Response.json(
          { error: error instanceof Error ? error.message : "Could not read that ZIP.", code },
          { status: 400 }
        )
      }
    } else {
      if (file.size > MAX_PDF_BYTES) {
        return Response.json({ error: "That PDF is larger than 8 MB." }, { status: 400 })
      }
      if (
        file.type &&
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        return Response.json({ error: "Upload a PDF, or paste the text instead." }, { status: 400 })
      }
      const bytes = Buffer.from(await file.arrayBuffer())
      try {
        text = `${text}\n${await extractPdfText(bytes)}`.trim()
      } catch {
        return Response.json(
          { error: "Could not read that PDF. Paste the text instead." },
          { status: 400 }
        )
      }
    }
  }
  if (text.trim().length < 20) {
    return Response.json({ error: "Add a PDF or paste more of the CV." }, { status: 400 })
  }

  let userId: number | undefined
  try {
    const ctx = await getBlitzContext()
    userId = ctx.session.userId ?? undefined
  } catch (error) {
    console.error("profile import session failed", error instanceof Error ? error.message : error)
  }

  return Response.json(await draftFromProfileText(text, userId))
}
