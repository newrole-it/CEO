import {lookup} from "dns/promises"
import {assertPublicAddresses, assertSafeUrl, UnsafeUrlError} from "./url-safety"

export type HttpResponse = {
  url: string
  status: number
  body: string
  contentType: string
}

export type HttpClient = {
  get: (url: string, opts?: {maxBytes?: number; accept?: string; timeoutMs?: number}) => Promise<HttpResponse>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type LookupFn = (hostname: string) => Promise<string[]>

const nextHostSlot = new Map<string, number>()
const MIN_INTERVAL_MS = 400
const HOST_INTERVAL_MS: Record<string, number> = {
  "apply.workable.com": 1000,
  "www.workable.com": 1000,
}
const MAX_RETRIES = 3

const defaultLookup: LookupFn = async (hostname) => {
  const records = await lookup(hostname, {all: true, verbatim: true})
  return records.map((record) => record.address)
}

async function waitForHost(host: string): Promise<void> {
  const now = Date.now()
  const slot = nextHostSlot.get(host) ?? now
  const start = Math.max(now, slot)
  nextHostSlot.set(host, start + (HOST_INTERVAL_MS[host] ?? MIN_INTERVAL_MS))
  const delay = start - now
  if (delay > 0) await sleep(delay)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const {done, value} = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new UnsafeUrlError("Response exceeded the size cap")
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder("utf-8", {fatal: false}).decode(merged)
}

export async function safeFetch(
  rawUrl: string,
  options?: {
    maxBytes?: number
    accept?: string
    timeoutMs?: number
    fetchImpl?: FetchLike
    lookupImpl?: LookupFn
    redirectCount?: number
  },
): Promise<HttpResponse> {
  const maxBytes = options?.maxBytes ?? Number(process.env.FETCH_MAX_BYTES || 1_500_000)
  const timeoutMs = options?.timeoutMs ?? Number(process.env.FETCH_TIMEOUT_MS || 15_000)
  const fetchImpl = options?.fetchImpl ?? fetch
  const lookupImpl = options?.lookupImpl ?? defaultLookup
  const redirectCount = options?.redirectCount ?? 0
  if (redirectCount > 3) throw new UnsafeUrlError("Too many redirects")

  const url = assertSafeUrl(rawUrl)
  const addresses = await lookupImpl(url.hostname)
  assertPublicAddresses(addresses)

  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await waitForHost(url.hostname)
      const response = await fetchImpl(url.toString(), {
          method: "GET",
          redirect: "manual",
          headers: {
            Accept: options?.accept ?? "application/json, text/html;q=0.8, */*;q=0.1",
            "User-Agent": "Jobscanner/0.1 (personal job search; public APIs only)",
          },
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location")
          if (!location) throw new UnsafeUrlError("Redirect missing location")
          const next = new URL(location, url).toString()
          return safeFetch(next, {...options, redirectCount: redirectCount + 1, fetchImpl, lookupImpl})
        }
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get("retry-after"))
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter < 30
            ? retryAfter * 1000
            : 400 * 2 ** attempt
          if (attempt === MAX_RETRIES) {
            const body = await readCapped(response, Math.min(maxBytes, 20_000))
            return {
              url: url.toString(),
              status: response.status,
              body,
              contentType: response.headers.get("content-type") ?? "",
            }
          }
          await sleep(wait)
          continue
        }
        const body = await readCapped(response, maxBytes)
        return {
          url: response.url || url.toString(),
          status: response.status,
          body,
          contentType: response.headers.get("content-type") ?? "",
        }
    } catch (error) {
      lastError = error
      if (error instanceof UnsafeUrlError) throw error
      if (attempt === MAX_RETRIES) break
      await sleep(400 * 2 ** attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Fetch failed")
}

export function createHttpClient(): HttpClient {
  return {
    get: (url, opts) => safeFetch(url, opts),
  }
}
