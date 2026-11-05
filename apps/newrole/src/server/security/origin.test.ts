import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { isAppHost, isAppHostRequest, isSameAppRequest } from "./origin"

function post(headers: Record<string, string>) {
  return new Request("http://127.0.0.1:43123/api/profile/import", { method: "POST", headers })
}

describe("same-app request checks", () => {
  const saved = process.env.APP_ORIGIN
  beforeEach(() => {
    process.env.APP_ORIGIN = "https://jobs.example.com"
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.APP_ORIGIN
    else process.env.APP_ORIGIN = saved
  })

  it("knows the app's own hosts", () => {
    expect(isAppHost("jobs.example.com")).toBe(true)
    expect(isAppHost("127.0.0.1:43123")).toBe(true)
    expect(isAppHost("localhost:43123")).toBe(true)
    expect(isAppHost("[::1]:43123")).toBe(true)
    expect(isAppHost("evil.example:43123")).toBe(false)
    expect(isAppHost("jobs.example.com.evil.example")).toBe(false)
    expect(isAppHost("127.0.0.1@evil.example")).toBe(false)
    expect(isAppHost(null)).toBe(false)
  })

  it("accepts the app's pages", () => {
    expect(
      isSameAppRequest(post({ host: "jobs.example.com", origin: "https://jobs.example.com" }))
    ).toBe(true)
    expect(
      isSameAppRequest(
        post({
          host: "127.0.0.1:43123",
          origin: "http://127.0.0.1:43123",
          "sec-fetch-site": "same-origin",
        })
      )
    ).toBe(true)
  })

  it("refuses a DNS-rebinding page, which is same-origin with the Host it chose", () => {
    expect(
      isSameAppRequest(
        post({ host: "rebind.evil.example:43123", origin: "http://rebind.evil.example:43123" })
      )
    ).toBe(false)
    expect(
      isAppHostRequest(new Request("http://x/", { headers: { host: "rebind.evil.example" } }))
    ).toBe(false)
  })

  it("refuses other sites, a missing Origin and an opaque one", () => {
    expect(
      isSameAppRequest(post({ host: "127.0.0.1:43123", origin: "https://evil.example" }))
    ).toBe(false)
    expect(
      isSameAppRequest(post({ host: "127.0.0.1:43123", origin: "http://localhost:3000" }))
    ).toBe(false)
    expect(isSameAppRequest(post({ host: "127.0.0.1:43123" }))).toBe(false)
    expect(isSameAppRequest(post({ host: "127.0.0.1:43123", origin: "null" }))).toBe(false)
    expect(
      isSameAppRequest(
        post({
          host: "127.0.0.1:43123",
          origin: "http://127.0.0.1:43123",
          "sec-fetch-site": "cross-site",
        })
      )
    ).toBe(false)
  })
})
