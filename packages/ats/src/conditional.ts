import type { HttpClient, HttpResponse } from "./host"

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

function remember(state: ConditionalState, response: HttpResponse) {
  if (response.headers?.etag) state.etag = response.headers.etag
  if (response.headers?.["last-modified"]) state.lastModified = response.headers["last-modified"]
}

/**
 * Sends validators and turns HTTP 304 into NotModifiedError before an adapter parses the body.
 * Only the first list request the server answers (2xx or 304) carries validators, and only its
 * validators are kept. A board stores one etag, so it describes that request alone: sent to a
 * child sitemap or a later page, a 304 would only mean that one file is unchanged, not the board.
 */
export function conditionalHttp(
  inner: HttpClient,
  prior: { etag?: string | null; lastModified?: string | null }
): { client: HttpClient; state: ConditionalState } {
  const state: ConditionalState = {}
  let answered = false
  const headersFor = (extra?: Record<string, string>) => {
    const headers = { ...extra }
    if (prior.etag) headers["If-None-Match"] = prior.etag
    if (prior.lastModified) headers["If-Modified-Since"] = prior.lastModified
    return headers
  }
  const client: HttpClient = {
    get: async (url, opts) => {
      const send = !answered && validatorsApply(url)
      const headers = send ? headersFor(opts?.headers) : opts?.headers
      const response = await inner.get(url, { ...opts, headers })
      // A 404 feed probe before the sitemap is not the board's answer; keep looking.
      if (!send || (response.status !== 304 && (response.status < 200 || response.status >= 300))) {
        return response
      }
      answered = true
      remember(state, response)
      if (response.status === 304) throw new NotModifiedError(response.headers)
      return response
    },
    post: (url, body, opts) => inner.post(url, body, opts),
  }
  return { client, state }
}
