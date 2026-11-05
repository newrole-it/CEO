import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("src/server/applications/service", () => {
  class ApplicationError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }
  return { ApplicationError }
})
vi.mock("src/server/auth/api-tokens", () => ({ authenticateRequest: vi.fn() }))

import { ApplicationError } from "src/server/applications/service"
import { authenticateRequest } from "src/server/auth/api-tokens"
import {
  corsHeaders,
  defaultTokenName,
  FillBodySchema,
  isSameOrigin,
  LIMITS,
  preflight,
  readJson,
  SubmittedBodySchema,
  withToken,
} from "./http"

const EXT = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
const URL_ = "http://127.0.0.1:43123/api/ext/me"

function request(headers: Record<string, string> = {}, init: RequestInit = {}) {
  return new Request(URL_, { ...init, headers })
}

function post(body: unknown) {
  return new Request(URL_, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  ;(authenticateRequest as unknown as ReturnType<typeof vi.fn>).mockReset()
})

describe("CORS", () => {
  it("echoes chrome-extension origins and no other scheme", () => {
    expect(corsHeaders(request({ Origin: EXT }))["Access-Control-Allow-Origin"]).toBe(EXT)
    for (const origin of [
      "https://evil.example",
      "moz-extension://abc",
      "chrome-extension://abc.evil.example",
      "null",
    ]) {
      expect(
        corsHeaders(request({ Origin: origin }))["Access-Control-Allow-Origin"]
      ).toBeUndefined()
    }
    expect(corsHeaders(request()).Vary).toBe("Origin")
  })

  it("answers preflight", () => {
    const response = preflight(request({ Origin: EXT }))
    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization")
    expect(response.headers.get("Vary")).toBe("Origin")
  })
})

describe("withToken", () => {
  const handler = withToken(async (req, auth) => Response.json({ userId: auth.userId }))

  it("gives 401 and a JSON error without a valid token", async () => {
    ;(authenticateRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const response = await handler(request({ Origin: EXT }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Missing or invalid token." })
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(EXT)
  })

  it("passes the person to the handler", async () => {
    ;(authenticateRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: 2,
      tokenId: "t",
    })
    expect(await (await handler(request())).json()).toEqual({ userId: 2 })
  })

  it("maps errors to statuses and hides internal messages", async () => {
    ;(authenticateRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: 2,
      tokenId: "t",
    })
    const failing = (error: Error) =>
      withToken(async () => {
        throw error
      })(request())
    const Err = ApplicationError as unknown as new (code: string, message: string) => Error
    expect((await failing(new Err("not-found", "Gone"))).status).toBe(404)
    expect((await failing(new Err("missing-fields", "Need company"))).status).toBe(400)
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const hidden = await failing(new Error("db password leaked"))
    log.mockRestore()
    expect(hidden.status).toBe(500)
    expect(await hidden.json()).toEqual({ error: "Something went wrong." })
  })
})

describe("readJson and schemas", () => {
  const page = { url: "https://jobs.lever.co/acme/1", title: "T", text: "x" }

  it("rejects bad JSON, bad URLs and too many fields with a 400 message", async () => {
    await expect(readJson(post("{"), FillBodySchema)).rejects.toThrow("Invalid JSON")
    await expect(
      readJson(post({ page: { ...page, url: "javascript:alert(1)" }, fields: [] }), FillBodySchema)
    ).rejects.toThrow("page.url")
    const fields = Array.from({ length: LIMITS.fields + 1 }, (_item, i) => ({
      key: `k${i}`,
      label: "L",
      type: "text",
    }))
    await expect(readJson(post({ page, fields }), FillBodySchema)).rejects.toThrow("fields")
  })

  it("cuts long labels, values and page text instead of failing the form", async () => {
    const body = await readJson(
      post({
        page: { ...page, text: "x".repeat(20_000), title: null },
        fields: [{ label: "L".repeat(900), value: "V".repeat(11_000) }],
      }),
      SubmittedBodySchema
    )
    expect(body.page.text).toHaveLength(LIMITS.pageText)
    expect(body.page.title).toBe("")
    expect(body.fields[0].label).toHaveLength(LIMITS.label)
    expect(body.fields[0].value).toHaveLength(LIMITS.value)
  })

  it("takes the company and role the page's own data names, and works without them", async () => {
    const named = await readJson(
      post({ page: { ...page, company: "Acme", role: "R".repeat(500) }, fields: [] }),
      FillBodySchema
    )
    expect(named.page.company).toBe("Acme")
    expect(named.page.role).toHaveLength(200)
    const bare = await readJson(post({ page, fields: [] }), FillBodySchema)
    expect(bare.page.company).toBeUndefined()
  })

  it("refuses an oversized body", async () => {
    await expect(readJson(post("x".repeat(LIMITS.body + 1)), FillBodySchema)).rejects.toThrow(
      "too large"
    )
  })

  it("fills in field defaults", async () => {
    const body = await readJson(post({ page, fields: [{ key: "a" }] }), FillBodySchema)
    expect(body.fields[0]).toMatchObject({ key: "a", label: "", type: "text" })
  })
})

describe("isSameOrigin", () => {
  const check = (headers: Record<string, string>) =>
    isSameOrigin(request(headers, { method: "POST" }))

  it("accepts the app's own pages", () => {
    expect(check({ Origin: "http://127.0.0.1:43123", "Sec-Fetch-Site": "same-origin" })).toBe(true)
    expect(check({ Origin: "http://127.0.0.1:43123" })).toBe(true)
    expect(check({ "Sec-Fetch-Site": "same-origin" })).toBe(true)
  })

  it("refuses other sites, extensions and requests that prove nothing", () => {
    expect(check({ Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" })).toBe(false)
    expect(check({ Origin: "https://evil.example" })).toBe(false)
    expect(check({ "Sec-Fetch-Site": "same-site" })).toBe(false)
    expect(check({ Origin: EXT, "Sec-Fetch-Site": "none" })).toBe(false)
    expect(check({ Origin: EXT })).toBe(false)
    expect(check({})).toBe(false)
  })

  it("refuses a DNS-rebinding page, which looks same-origin under its own host name", () => {
    const rebound = {
      Host: "attacker.example:43123",
      Origin: "http://attacker.example:43123",
      "Sec-Fetch-Site": "same-origin",
    }
    expect(check(rebound)).toBe(false)
    expect(check({ Host: "attacker.example:43123", "Sec-Fetch-Site": "same-origin" })).toBe(false)
    expect(check({ Host: "localhost:43123", Origin: "http://localhost:43123" })).toBe(true)
  })
})

describe("defaultTokenName", () => {
  it("names the token with the date", () => {
    expect(defaultTokenName(new Date(2026, 9, 3))).toBe("Chrome (03.10.2026)")
  })
})
