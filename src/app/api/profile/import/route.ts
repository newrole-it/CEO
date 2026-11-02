import { getBlitzContext } from "src/app/blitz-server"
import { takeSlot } from "src/server/auth/magic-link"
import { draftFromProfileText } from "src/server/profile/import"
import {
  ExportError,
  isZipBytes,
  linkedInExportText,
  MAX_ZIP_BYTES,
} from "src/server/profile/linkedin-export"
import { extractPdfText } from "src/server/profile/pdf"
import { clientIpFrom } from "src/server/security/client-ip"
import { crossSiteRefused, isSameAppRequest } from "src/server/security/origin"

const MAX_PDF_BYTES = 8_000_000
// The largest file plus room for the multipart envelope and a pasted note.
const MAX_BODY_BYTES = MAX_ZIP_BYTES + 1_000_000
// Far more than any CV; every character goes to the model.
const MAX_TEXT_CHARS = 60_000
const IMPORTS_PER_USER = 20
const GUEST_IMPORTS_PER_IP = 60

function isZipFile(file: File): boolean {
  return /zip/.test(file.type) || file.name.toLowerCase().endsWith(".zip")
}

async function sessionOf(): Promise<{ userId: number; guest: boolean } | null> {
  try {
    const ctx = await getBlitzContext()
    const userId = ctx.session.userId
    return userId ? { userId, guest: ctx.session.$publicData.role === "GUEST" } : null
  } catch (error) {
    console.error("profile import session failed", error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Reading a CV calls the model, so the caller must have a session (Onboarding starts a guest one)
 * and the body is measured before it is read: the declared length, never the buffered bytes.
 */
export async function POST(request: Request) {
  if (!isSameAppRequest(request)) return crossSiteRefused()
  const length = Number(request.headers.get("content-length") ?? NaN)
  if (!Number.isFinite(length)) {
    return Response.json({ error: "Send a PDF or pasted text." }, { status: 411 })
  }
  if (length > MAX_BODY_BYTES) {
    return Response.json(
      { error: "That ZIP is larger than 50 MB.", code: "too-large" },
      { status: 413 }
    )
  }
  const session = await sessionOf()
  if (!session) return Response.json({ error: "Sign in required.", code: "auth" }, { status: 401 })
  const now = new Date()
  const ipKey = `profile-import-ip:${clientIpFrom(request.headers)}`
  const allowed =
    (await takeSlot(`profile-import:${session.userId}`, IMPORTS_PER_USER, now)) &&
    // Guests cost nothing to create, so they also share a budget per address.
    (!session.guest || (await takeSlot(ipKey, GUEST_IMPORTS_PER_IP, now)))
  if (!allowed) {
    return Response.json(
      { error: "Too many CVs read. Wait an hour and try again.", code: "limited" },
      { status: 429 }
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: "Send a PDF or pasted text." }, { status: 400 })
  }
  const pasted = form.get("text")
  let text = typeof pasted === "string" ? pasted : ""
  if (text.length > MAX_TEXT_CHARS) {
    return Response.json(
      { error: "That text is too long. Paste only the CV.", code: "too-long" },
      { status: 400 }
    )
  }
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

  // A long PDF or a full LinkedIn export can hold more text than any CV; the model gets the start.
  return Response.json(await draftFromProfileText(text.slice(0, MAX_TEXT_CHARS), session.userId))
}
