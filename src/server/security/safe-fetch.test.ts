import { describe, expect, it } from "vitest"
import { conditionalHttp, NotModifiedError } from "src/server/index/conditional"
import { pinnedLookup, safeFetch } from "./safe-fetch"

describe("safeFetch policy on redirects", () => {
  it("drops custom headers when the host changes and blocks a disallowed hop", async () => {
    const seen: Array<{ url: string; token: string | null }> = []
    const fetchImpl = async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      seen.push({ url, token: headers.get("x-careers-sites-token") })
      if (url.includes("example.com")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://jobs.sap.com/job/1" },
        })
      }
      return new Response("ok", { status: 200 })
    }
    await expect(
      safeFetch("https://example.com/jobs", {
        fetchImpl: fetchImpl as typeof fetch,
        lookupImpl: async () => ["8.8.8.8"],
        headers: { "X-Careers-Sites-Token": "secret" },
      })
    ).rejects.toThrow(/link_only|Source policy/i)
    expect(seen).toHaveLength(1)
    expect(seen[0].token).toBe("secret")
  })

  it("does not forward caller headers onto the next host", async () => {
    const seen: Array<{ url: string; token: string | null; accept: string | null }> = []
    const fetchImpl = async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      seen.push({ url, token: headers.get("x-careers-sites-token"), accept: headers.get("accept") })
      if (url.includes("example.com")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://example.org/jobs" },
        })
      }
      return new Response("ok", { status: 200 })
    }
    const response = await safeFetch("https://example.com/jobs", {
      fetchImpl: fetchImpl as typeof fetch,
      lookupImpl: async () => ["1.1.1.1"],
      headers: { "X-Careers-Sites-Token": "secret" },
    })
    expect(response.status).toBe(200)
    expect(seen[1].token).toBeNull()
    expect(seen[1].accept).toBeTruthy()
    expect(seen[1].url).toContain("example.org")
  })

  it("hands a 304 back to the caller: it is not a redirect and has no location", async () => {
    const etag = 'W/"unchanged"'
    const seen: Array<string | null> = []
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("if-none-match"))
      return new Response(null, { status: 304, headers: { etag } })
    }
    const { client } = conditionalHttp(
      {
        get: (url, opts) =>
          safeFetch(url, {
            ...opts,
            fetchImpl: fetchImpl as typeof fetch,
            lookupImpl: async () => ["1.1.1.1"],
          }),
        post: () => Promise.reject(new Error("not used")),
      },
      { etag }
    )
    await expect(client.get("https://boards-api.greenhouse.io/v1/boards/acme/jobs")).rejects.toBeInstanceOf(
      NotModifiedError
    )
    expect(seen).toEqual([etag])
  })
})

describe("pinned DNS lookup", () => {
  it("returns an address object when the runtime asks for every record", () => {
    const hits: Array<{ address: string; family: number }> = []
    pinnedLookup("93.184.216.34")("jobs.gft.com", { all: true }, (error, address) => {
      expect(error).toBeNull()
      if (Array.isArray(address)) hits.push(...address)
    })
    expect(hits).toEqual([{ address: "93.184.216.34", family: 4 }])
  })

  it("pins every redirect hop to the address that was checked, not only the first", async () => {
    const original = globalThis.fetch
    const hops: Array<{ url: string; pinned: boolean }> = []
    globalThis.fetch = (async (url: string, init?: RequestInit & { dispatcher?: unknown }) => {
      hops.push({ url, pinned: Boolean(init?.dispatcher) })
      if (url.includes("example.com")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://example.org/jobs" },
        })
      }
      return new Response("ok", { status: 200 })
    }) as typeof fetch
    try {
      const response = await safeFetch("https://example.com/jobs", {
        lookupImpl: async () => ["93.184.216.34"],
        minIntervalMs: 0,
      })
      expect(response.status).toBe(200)
    } finally {
      globalThis.fetch = original
    }
    expect(hops.map((hop) => hop.url)).toEqual([
      "https://example.com/jobs",
      "https://example.org/jobs",
    ])
    expect(hops.every((hop) => hop.pinned)).toBe(true)
  })
})
