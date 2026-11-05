import { describe, expect, it } from "vitest"
import { clientIpFrom, trustsProxy } from "./client-ip"

const spoofed = new Headers({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "7.7.7.7" })

describe("client IP for rate limits", () => {
  it("ignores forwarding headers unless TRUST_PROXY is on", () => {
    expect(clientIpFrom(spoofed, {})).toBe("local")
    expect(clientIpFrom(spoofed, { TRUST_PROXY: "0" })).toBe("local")
    expect(trustsProxy({ TRUST_PROXY: "1" })).toBe(true)
  })

  it("behind a proxy takes the address the proxy appended, not what the client sent", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })
    expect(clientIpFrom(headers, { TRUST_PROXY: "1" })).toBe("203.0.113.9")
    expect(clientIpFrom(new Headers({ "x-real-ip": "203.0.113.5" }), { TRUST_PROXY: "1" })).toBe(
      "203.0.113.5"
    )
    expect(clientIpFrom(new Headers(), { TRUST_PROXY: "true" })).toBe("local")
  })
})
