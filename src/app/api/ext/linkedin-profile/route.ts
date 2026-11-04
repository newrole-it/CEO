import {
  errorResponse,
  jsonResponse,
  preflight,
  readJson,
  withToken,
} from "src/server/autofill/http"
import { LinkedInAuditBodySchema } from "@newrole/profile/linkedin-audit"
import { auditLinkedInProfile, latestLinkedInAudit } from "src/server/profile/linkedin-audit"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

/** The extension read the person's own LinkedIn profile page: store it and audit it. */
export const POST = withToken(async (request, { userId }) => {
  const body = await readJson(request, LinkedInAuditBodySchema)
  const audit = await auditLinkedInProfile(userId, body)
  if (!audit) return errorResponse(request, "Could not read a profile on this page.", 400)
  return jsonResponse(request, { audit })
})

/** The latest audit, for the popup. */
export const GET = withToken(async (request, { userId }) => {
  const locale = new URL(request.url).searchParams.get("locale") === "en" ? "en" : "pl"
  return jsonResponse(request, { audit: await latestLinkedInAudit(userId, locale) })
})
