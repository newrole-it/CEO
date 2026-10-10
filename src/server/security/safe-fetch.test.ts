import { describe, expect, it } from "vitest"
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
})
