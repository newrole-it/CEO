import { describe, expect, it } from "vitest"
import { createOriginGuard } from "./origin"

function request(headers: Record<string, string>): Request {
  return new Request("http://127.0.0.1:43124/api/documents", { method: "POST", headers })
}

describe("createOriginGuard", () => {
  const local = createOriginGuard(() => null)
  const named = createOriginGuard(() => "https://cv.example.com")

  it("knows loopback names and the app's own origin, and nothing else", () => {
    expect(local.isAppHost("127.0.0.1:43124")).toBe(true)
    expect(local.isAppHost("localhost:43124")).toBe(true)
    expect(local.isAppHost("evil.example:43124")).toBe(false)
    expect(local.isAppHost("cv.example.com")).toBe(false)
    expect(named.isAppHost("cv.example.com")).toBe(true)
  })

  it("accepts a write from the app's own page only", () => {
    const own = { host: "127.0.0.1:43124", origin: "http://127.0.0.1:43124" }
    expect(local.isSameAppRequest(request(own))).toBe(true)
    expect(local.isSameAppRequest(request({ ...own, "sec-fetch-site": "cross-site" }))).toBe(false)
    expect(local.isSameAppRequest(request({ host: own.host }))).toBe(false)
    expect(local.isSameAppRequest(request({ ...own, origin: "http://evil.example" }))).toBe(false)
    // a DNS-rebinding page comes in under its own name
    const rebound = { host: "evil.example:43124", origin: "http://evil.example:43124" }
    expect(local.isSameAppRequest(request(rebound))).toBe(false)
  })
})
