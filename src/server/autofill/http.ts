import { z } from "zod"
import { ApplicationError } from "src/server/applications/service"
import { authenticateRequest } from "src/server/auth/api-tokens"
import { appOrigin } from "src/server/auth/email"

/** Shared plumbing for /api/ext/** (docs/product/plan-aplikacje.md §5.3). */

export const LIMITS = {
  fields: 150,
  label: 500,
  value: 10_000,
  pageText: 12_000,
  pageTitle: 500,
  url: 2_000,
  options: 200,
  /** Whole request body */
  body: 2_000_000,
} as const

/** Accepts more than the cap and cuts it: one long consent label must not fail a whole form. */
function capped(max: number, hard = max * 20) {
  return z
    .string()
    .max(hard)
    .transform((value) => value.slice(0, max))
}

const optionalCapped = (max: number) =>
  capped(max)
    .nullish()
    .transform((value) => value ?? undefined)

const httpUrl = z
  .string()
  .max(LIMITS.url)
  .refine((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol)
    } catch {
      return false
    }
  }, "Must be an http(s) URL.")

export const PageSchema = z.object({
  url: httpUrl,
  title: capped(LIMITS.pageTitle)
    .nullish()
    .transform((value) => value ?? ""),
  text: capped(LIMITS.pageText)
    .nullish()
    .transform((value) => value ?? ""),
  /** og:site_name, when the page has one */
  siteName: optionalCapped(200),
})

export const FormFieldSchema = z.object({
  key: z.string().min(1).max(300),
  label: capped(LIMITS.label)
    .nullish()
    .transform((value) => value ?? ""),
  name: optionalCapped(300),
  id: optionalCapped(300),
  type: z
    .string()
    .max(40)
    .nullish()
    .transform((value) => value ?? "text"),
  autocomplete: optionalCapped(100),
  placeholder: optionalCapped(LIMITS.label),
  required: z
    .boolean()
    .nullish()
    .transform((value) => value ?? undefined),
  options: z
    .array(capped(LIMITS.label))
    .max(LIMITS.options * 10)
    .nullish()
    .transform((value) => value?.slice(0, LIMITS.options)),
  maxLength: z
    .number()
    .int()
    .nullish()
    .transform((value) => value ?? undefined),
  section: optionalCapped(LIMITS.label),
})

export const FillBodySchema = z.object({
  page: PageSchema,
  fields: z.array(FormFieldSchema).max(LIMITS.fields),
})

export const SubmittedBodySchema = z.object({
  page: PageSchema,
  job: z
    .object({ company: optionalCapped(160), title: optionalCapped(200) })
    .nullish()
    .transform((value) => value ?? undefined),
  fields: z
    .array(
      z.object({
        label: capped(LIMITS.label),
        value: capped(LIMITS.value),
        kind: z.string().max(40).nullish(),
        type: z.string().max(40).nullish(),
      })
    )
    .max(LIMITS.fields),
})

/** Echoes a chrome-extension:// origin, and only that scheme. */
export function corsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" }
  const origin = request.headers.get("origin")
  if (origin && /^chrome-extension:\/\/[a-z0-9]+$/i.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    headers["Access-Control-Max-Age"] = "600"
  }
  return headers
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}

export function jsonResponse(request: Request, data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { ...corsHeaders(request), "Cache-Control": "no-store" },
  })
}

export function errorResponse(request: Request, message: string, status: number): Response {
  return jsonResponse(request, { error: message }, status)
}

class BodyError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > LIMITS.body) throw new BodyError("Request body too large.", 413)
  const raw = await request.text()
  if (raw.length > LIMITS.body) throw new BodyError("Request body too large.", 413)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw || "{}")
  } catch {
    throw new BodyError("Invalid JSON.", 400)
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    const first = result.error.issues[0]
    const where = first?.path.join(".") || "body"
    throw new BodyError(`Invalid request: ${where}: ${first?.message ?? "invalid"}`, 400)
  }
  return result.data
}

const APPLICATION_ERROR_STATUS: Record<string, number> = {
  "not-found": 404,
  "job-not-found": 404,
  "cv-not-found": 404,
}

/** Every failure becomes a JSON { error } with a sensible status. */
export function failure(request: Request, error: unknown): Response {
  if (error instanceof BodyError) return errorResponse(request, error.message, error.status)
  if (error instanceof ApplicationError) {
    return errorResponse(request, error.message, APPLICATION_ERROR_STATUS[error.code] ?? 400)
  }
  console.error("ext api failed", error instanceof Error ? error.message : error)
  return errorResponse(request, "Something went wrong.", 500)
}

/** Runs a handler for the person behind the Bearer token; 401 without a valid one. */
export function withToken(
  handler: (request: Request, auth: { userId: number; tokenId: string }) => Promise<Response>
) {
  return async (request: Request): Promise<Response> => {
    try {
      const auth = await authenticateRequest(request)
      if (!auth) return errorResponse(request, "Missing or invalid token.", 401)
      return await handler(request, auth)
    } catch (error) {
      return failure(request, error)
    }
  }
}

/**
 * A browser request from the app's own pages. Blocks other sites from minting a token with the
 * person's cookie: Sec-Fetch-Site must say same-origin, and the Origin must be this app.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin") return false
  const origin = request.headers.get("origin")
  if (!origin) return site === "same-origin"
  const allowed = new Set<string>([appOrigin()])
  try {
    allowed.add(new URL(request.url).origin)
  } catch {}
  const host = request.headers.get("host")
  if (host) {
    allowed.add(`http://${host}`)
    allowed.add(`https://${host}`)
  }
  return allowed.has(origin)
}

/** "Chrome (30.10.2026)" */
export function defaultTokenName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `Chrome (${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()})`
}
