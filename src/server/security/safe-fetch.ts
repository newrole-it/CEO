import type { LookupAddress, LookupOptions } from "dns"
import { lookup } from "dns/promises"
import { isIP } from "net"
import { Agent } from "undici"
import { reserveHostSlot } from "src/server/crawler/host-pace"
import { fetchUserAgent } from "src/server/crawler/hygiene"
import { assertSourcePolicy } from "./source-policy"
import { assertPublicAddresses, assertSafeUrl, UnsafeUrlError } from "./url-safety"

export type HttpResponse = {
  url: string
  status: number
  body: string
  contentType: string
  headers?: Record<string, string>
}

export type HttpClient = {
  get: (
    url: string,
    opts?: {
      maxBytes?: number
      accept?: string
      timeoutMs?: number
      headers?: Record<string, string>
      encoding?: "utf8" | "base64"
    }
  ) => Promise<HttpResponse>
  post: (
    url: string,
    body: string,
    opts?: {
      maxBytes?: number
      accept?: string
      timeoutMs?: number
      headers?: Record<string, string>
    }
  ) => Promise<HttpResponse>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type LookupFn = (hostname: string) => Promise<string[]>

const nextHostSlot = new Map<string, number>()
const MIN_INTERVAL_MS = 5_000
const HOST_INTERVAL_MS: Record<string, number> = {}
const MAX_RETRIES = 3

export function noteHostInterval(host: string, ms: number): void {
  const current = HOST_INTERVAL_MS[host] ?? MIN_INTERVAL_MS
  HOST_INTERVAL_MS[host] = Math.max(current, ms)
}

const defaultLookup: LookupFn = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true })
  return records.map((record) => record.address)
}

async function waitForHost(host: string, minIntervalMs: number): Promise<void> {
  const interval = HOST_INTERVAL_MS[host] ?? minIntervalMs
  if (interval <= 0) return
  if (!process.env.VITEST) {
    try {
      // Shared by every process on the database; the in-memory slot below is the fallback.
      const delay = await reserveHostSlot(host, interval)
      if (delay > 0) await sleep(delay)
      return
    } catch {}
  }
  const now = Date.now()
  const slot = nextHostSlot.get(host) ?? now
  const start = Math.max(now, slot)
  nextHostSlot.set(host, start + interval)
  const delay = start - now
  if (delay > 0) await sleep(delay)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Node 22 asks for every address (`options.all`). A bare string is then read as an address list and the connect fails. */
export function pinnedLookup(address: string) {
  const family = isIP(address) || 4
  return (
    _hostname: string,
    options: LookupOptions,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number
    ) => void
  ) => {
    if (options.all) {
      callback(null, [{ address, family }])
      return
    }
    callback(null, address, family)
  }
}

function pinAgent(address: string): Agent {
  return new Agent({
    connect: {
      // LookupFunction types only the single-address callback. Node 22 sets options.all.
      lookup: pinnedLookup(address) as never,
    },
  })
}

async function readCappedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
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
  return merged
}

async function readCapped(
  response: Response,
  maxBytes: number,
  encoding?: "utf8" | "base64"
): Promise<string> {
  const bytes = await readCappedBytes(response, maxBytes)
  if (encoding === "base64") return Buffer.from(bytes).toString("base64")
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes)
}

function responseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

export async function safeFetch(
  rawUrl: string,
  options?: {
    method?: "GET" | "POST"
    body?: string
    maxBytes?: number
    accept?: string
    timeoutMs?: number
    headers?: Record<string, string>
    encoding?: "utf8" | "base64"
    fetchImpl?: FetchLike
    lookupImpl?: LookupFn
    redirectCount?: number
    minIntervalMs?: number
  }
): Promise<HttpResponse> {
  const maxBytes = options?.maxBytes ?? Number(process.env.FETCH_MAX_BYTES || 1_500_000)
  const timeoutMs = options?.timeoutMs ?? Number(process.env.FETCH_TIMEOUT_MS || 15_000)
  const fetchImpl = options?.fetchImpl ?? fetch
  const lookupImpl = options?.lookupImpl ?? defaultLookup
  const redirectCount = options?.redirectCount ?? 0
  const minIntervalMs = options?.minIntervalMs ?? (options?.fetchImpl ? 0 : MIN_INTERVAL_MS)
  if (redirectCount > 3) throw new UnsafeUrlError("Too many redirects")

  const url = assertSafeUrl(rawUrl)
  assertSourcePolicy(url)
  const addresses = await lookupImpl(url.hostname)
  assertPublicAddresses(addresses)
  const agent = options?.fetchImpl ? undefined : pinAgent(addresses[0])

  let lastError: unknown
  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await waitForHost(url.hostname, minIntervalMs)
        const response = await fetchImpl(url.toString(), {
          method: options?.method ?? "GET",
          redirect: "manual",
          body: options?.body,
          headers: {
            Accept: options?.accept ?? "application/json, text/html;q=0.8, */*;q=0.1",
            "User-Agent": fetchUserAgent(),
            ...options?.headers,
          },
          signal: AbortSignal.timeout(timeoutMs),
          ...(agent ? { dispatcher: agent } : {}),
        } as RequestInit)
        // A 304 answers a conditional request: the caller keeps what it has, nothing to follow.
        if (response.status >= 300 && response.status < 400 && response.status !== 304) {
          const location = response.headers.get("location")
          if (!location) throw new UnsafeUrlError("Redirect missing location")
          const next = new URL(location, url)
          const sameHost = next.hostname.toLowerCase() === url.hostname.toLowerCase()
          // Await so a rejected redirect is handled before finally closes the agent.
          return await safeFetch(next.toString(), {
            ...options,
            body: sameHost ? options?.body : undefined,
            method: sameHost ? options?.method : "GET",
            headers: sameHost ? options?.headers : undefined,
            redirectCount: redirectCount + 1,
            // Only the caller's own fetchImpl: passing the resolved global fetch would make the
            // next hop skip pinAgent, and that hop's host could re-resolve to a private address.
            fetchImpl: options?.fetchImpl,
            lookupImpl,
            minIntervalMs,
          })
        }
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get("retry-after"))
          const wait =
            Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter < 30
              ? retryAfter * 1000
              : 400 * 2 ** attempt
          if (attempt === MAX_RETRIES) {
            const body = await readCapped(response, Math.min(maxBytes, 20_000), options?.encoding)
            return {
              url: url.toString(),
              status: response.status,
              body,
              contentType: response.headers.get("content-type") ?? "",
              headers: responseHeaders(response.headers),
            }
          }
          await sleep(wait)
          continue
        }
        const body = await readCapped(response, maxBytes, options?.encoding)
        return {
          url: response.url || url.toString(),
          status: response.status,
          body,
          contentType: response.headers.get("content-type") ?? "",
          headers: responseHeaders(response.headers),
        }
      } catch (error) {
        lastError = error
        if (error instanceof UnsafeUrlError) throw error
        if (attempt === MAX_RETRIES) break
        await sleep(400 * 2 ** attempt)
      }
    }
  } finally {
    await agent?.close()
  }
  throw lastError instanceof Error ? lastError : new Error("Fetch failed")
}

export function createHttpClient(): HttpClient {
  return {
    get: (url, opts) => safeFetch(url, opts),
    post: (url, body, opts) => safeFetch(url, { ...opts, method: "POST", body }),
  }
}
