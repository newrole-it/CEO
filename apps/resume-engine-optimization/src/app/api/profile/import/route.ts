import { getSession } from "src/server/auth/session"
import { takeSlot } from "src/server/auth/magic-link"
import { draftFromProfileText } from "src/server/profile/import"
import { importText, MAX_IMPORT_BODY_BYTES } from "@newrole/profile/import-text"
import { clientIpFrom } from "src/server/security/client-ip"
import { crossSiteRefused, isSameAppRequest } from "src/server/security/origin"

const IMPORTS_PER_USER = 20
const GUEST_IMPORTS_PER_IP = 60

async function sessionOf(): Promise<{ userId: number; guest: boolean } | null> {
  try {
    const session = await getSession()
    const userId = session.userId
    return userId ? { userId, guest: session.$publicData.role === "GUEST" } : null
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
  if (length > MAX_IMPORT_BODY_BYTES) {
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
  const file = form.get("file")
  const read = await importText({
    text: typeof pasted === "string" ? pasted : "",
    file: file instanceof File ? file : null,
  })
  if (!read.ok) {
    return Response.json(
      read.code ? { error: read.error, code: read.code } : { error: read.error },
      { status: read.status }
    )
  }
  return Response.json(await draftFromProfileText(read.text, session.userId))
}
