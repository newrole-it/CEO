import { createOriginGuard } from "@newrole/app-kit/origin"
import { appOrigin } from "src/server/auth/email"

/**
 * Checks for route handlers that change state with the session cookie. Blitz's getBlitzContext
 * copies the anti-CSRF cookie into the header itself, so these routes get no CSRF check from it.
 * The rules are @newrole/app-kit/origin's, with APP_ORIGIN as this app's name.
 */
export const { isAppHost, isAppHostRequest, isSameAppRequest } = createOriginGuard(appOrigin)

export function crossSiteRefused(): Response {
  return Response.json({ error: "Start this from newrole.it.", code: "origin" }, { status: 403 })
}
