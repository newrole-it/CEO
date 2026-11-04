import type { z } from "zod"
import { createOriginGuard } from "@newrole/app-kit/origin"
import { OfferError } from "./offers"
import { StoreError } from "./store"
import { WritingError } from "./writing"

/**
 * Route handler plumbing: only this app's own pages may change anything (a cross-site form or a
 * DNS-rebinding page can reach 127.0.0.1 too), and errors leave as { error: code, message }. The
 * editor reads the code (@newrole/cv-editor/backend).
 */

const guard = createOriginGuard(() => process.env.APP_ORIGIN?.trim() || null)

/** For a write: null when the request comes from this app, else the refusal to return. */
export function refuseCrossSite(request: Request): Response | null {
  if (guard.isSameAppRequest(request)) return null
  return Response.json({ error: "origin", message: "Start this from newrole CV." }, { status: 403 })
}

/** For a read: null when the request came in under this app's name. */
export function refuseForeignHost(request: Request): Response | null {
  if (guard.isAppHostRequest(request)) return null
  return Response.json({ error: "origin", message: "Unknown host." }, { status: 403 })
}

export function failure(code: string, message: string, status: number): Response {
  return Response.json({ error: code, message }, { status })
}

const STATUS: Record<string, number> = {
  "not-found": 404,
  "job-not-found": 404,
  conflict: 409,
  invalid: 400,
  "no-base": 409,
  "no-content": 422,
  "link-only": 422,
  unreadable: 422,
  "llm-unavailable": 503,
  "llm-failed": 502,
}

export function errorResponse(error: unknown): Response {
  if (error instanceof StoreError || error instanceof WritingError || error instanceof OfferError)
    return failure(error.code, error.message, STATUS[error.code] ?? 400)
  console.error("newrole CV request failed", error)
  return failure("failed", "Something went wrong.", 500)
}

/** The request's JSON body checked against `schema`; a Response to return when it does not fit. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T | Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return failure("invalid", "The request body is not JSON.", 400)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return failure("invalid", parsed.error.issues[0]?.message ?? "Invalid.", 400)
  return parsed.data
}
