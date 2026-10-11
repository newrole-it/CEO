import db from "db"
import { getBlitzContext } from "src/app/blitz-server"
import { createLlmClient } from "src/server/llm/client"
import { runProfileAuditForUser } from "src/server/profile/audit-store"
import { extractProfileFromText } from "src/server/profile/extract"
import { parseLinkedInProfile } from "src/server/profile/linkedin"
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
    try {
      text = `${text}\n${await extractPdfText(bytes)}`.trim()
    } catch {
      return Response.json(
        { error: "Could not read that PDF. Paste the text instead." },
        { status: 400 }
      )
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

  const draft = await extractProfileFromText(text, createLlmClient(), userId)
  const document = parseLinkedInProfile(text)
  let audited = false
  try {
    if (userId && document) {
      await db.candidateProfile.upsert({
        where: { userId },
        update: { linkedinDocument: document, linkedinImportedAt: new Date() },
        create: { userId, linkedinDocument: document, linkedinImportedAt: new Date() },
      })
      await runProfileAuditForUser(userId)
      audited = true
    }
  } catch (error) {
    console.error("profile import persist failed", error instanceof Error ? error.message : error)
  }
  return Response.json({ draft, audited })
}
