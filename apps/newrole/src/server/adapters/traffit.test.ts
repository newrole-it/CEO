import { describe, expect, it } from "vitest"
import type { HttpClient } from "src/server/security/safe-fetch"
import { listTraffit } from "./traffit"

const posts = (page: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: page * 1000 + index,
    url: `https://acme.traffit.com/public/an/${page * 1000 + index}`,
    advert: { name: `Role ${page}-${index}` },
  }))

/** Pages from `pages` by X-Request-Current-Page; a number is a status with no body. */
function traffitHttp(pages: Record<number, unknown[] | number>, totalPages: number): HttpClient {
  return {
    async post() {
      throw new Error("post is unused")
    },
    async get(url, opts) {
      const page = Number(opts?.headers?.["X-Request-Current-Page"] ?? "1")
      const reply = pages[page] ?? 404
      if (typeof reply === "number")
        return { url, status: reply, body: "", contentType: "text/plain" }
      return {
        url,
        status: 200,
        body: JSON.stringify(reply),
        contentType: "application/json",
        headers: { "x-result-total-pages": String(totalPages) },
      }
    },
  }
}

describe("Traffit pages", () => {
  it("fails the board when a later page fails, instead of returning page 1 as the whole list", async () => {
    for (const status of [503, 404]) {
      const http = traffitHttp({ 1: posts(1, 50), 2: status }, 3)
      await expect(listTraffit("acme", http, "Acme")).rejects.toThrow(`returned ${status}`)
    }
  })

  it("does not count a list cut at the page limit as complete", async () => {
    const http = traffitHttp(
      { 1: posts(1, 50), 2: posts(2, 50), 3: posts(3, 50), 4: posts(4, 50) },
      6
    )
    const listed = await listTraffit("acme", http, "Acme")
    expect(listed.proven).toBe(true)
    expect(listed.jobs).toHaveLength(200)
    expect(listed.complete).toBe(false)
  })

  it("reads a short board in full", async () => {
    const listed = await listTraffit(
      "acme",
      traffitHttp({ 1: posts(1, 50), 2: posts(2, 3) }, 2),
      "Acme"
    )
    expect(listed.jobs).toHaveLength(53)
    expect(listed.complete).toBe(true)
  })
})
