import type { HttpClient, HttpResponse } from "src/server/security/safe-fetch"

export class NotModifiedError extends Error {
  readonly etag?: string
  readonly lastModified?: string

  constructor(headers: Record<string, string> | undefined) {
    super("Not modified")
    this.name = "NotModifiedError"
    this.etag = headers?.etag
    this.lastModified = headers?.["last-modified"]
  }
}

export type ConditionalState = {
  etag?: string
  lastModified?: string
}

function validatorsApply(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return (
      path.includes("sitemap") ||
      path.endsWith(".xml") ||
      path.endsWith(".gz") ||
      path.endsWith("/jobs.feed.json") ||
      /\/jobs\/?$/.test(path)
    )
  } catch {
    return false
  }
}

function remember(state: ConditionalState, url: string, response: HttpResponse) {
  if (!validatorsApply(url)) return
  if (response.headers?.etag) state.etag = response.headers.etag
  if (response.headers?.["last-modified"]) state.lastModified = response.headers["last-modified"]
}

/** Sends validators and turns HTTP 304 into NotModifiedError before an adapter parses the body. */
export function conditionalHttp(
  inner: HttpClient,
  prior: { etag?: string | null; lastModified?: string | null }
): { client: HttpClient; state: ConditionalState } {
  const state: ConditionalState = {}
  const headersFor = (extra?: Record<string, string>) => {
    const headers = { ...extra }
    if (prior.etag) headers["If-None-Match"] = prior.etag
    if (prior.lastModified) headers["If-Modified-Since"] = prior.lastModified
    return headers
  }
  const client: HttpClient = {
    get: async (url, opts) => {
      const headers = validatorsApply(url) ? headersFor(opts?.headers) : opts?.headers
      const response = await inner.get(url, { ...opts, headers })
      remember(state, url, response)
      if (response.status === 304) throw new NotModifiedError(response.headers)
      return response
    },
    post: (url, body, opts) => inner.post(url, body, opts),
  }
  return { client, state }
}
