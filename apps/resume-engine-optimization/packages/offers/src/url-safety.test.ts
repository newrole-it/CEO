import { describe, expect, it } from "vitest"
import { assertPublicAddresses, assertSafeUrl, isBlockedIp, UnsafeUrlError } from "./url-safety"

describe("url safety", () => {
  it("allows public https URLs", () => {
    const url = assertSafeUrl("https://boards-api.greenhouse.io/v1/boards/gitlab/jobs")
    expect(url.hostname).toBe("boards-api.greenhouse.io")
  })

  it("rejects non-http schemes, credentials, odd ports, and local names", () => {
    expect(() => assertSafeUrl("file:///etc/passwd")).toThrow(UnsafeUrlError)
    expect(() => assertSafeUrl("https://user:pass@example.com/jobs")).toThrow(UnsafeUrlError)
    expect(() => assertSafeUrl("https://example.com:8080/jobs")).toThrow(UnsafeUrlError)
    expect(() => assertSafeUrl("http://localhost/jobs")).toThrow(UnsafeUrlError)
    expect(() => assertSafeUrl("http://metadata.google.internal/computeMetadata/v1/")).toThrow(
      UnsafeUrlError
    )
    expect(() => assertSafeUrl("http://printer.local/jobs")).toThrow(UnsafeUrlError)
  })

  it("blocks private, loopback, link-local, and metadata addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.1.9",
      "172.16.0.4",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isBlockedIp(ip)).toBe(true)
    }
    for (const ip of [
      "198.18.0.1",
      "198.19.255.1",
      "64:ff9b::8.8.8.8",
      "2002:abcd::1",
      "fec0::1",
      "::127.0.0.1",
    ]) {
      expect(isBlockedIp(ip)).toBe(true)
    }
    expect(() => assertSafeUrl("http://[::1]/")).toThrow(UnsafeUrlError)
    expect(isBlockedIp("8.8.8.8")).toBe(false)
    expect(isBlockedIp("1.1.1.1")).toBe(false)
    expect(() => assertPublicAddresses(["8.8.8.8", "10.0.0.1"])).toThrow(UnsafeUrlError)
    expect(() => assertSafeUrl("http://169.254.169.254/latest/meta-data")).toThrow(UnsafeUrlError)
  })

  it("blocks IPv6 spellings that carry a private IPv4 address", () => {
    for (const ip of [
      "::7f00:1",
      "::a9fe:a9fe",
      "::ffff:0:7f00:1",
      "::ffff:0:127.0.0.1",
      "0:0:0:0:0:ffff:7f00:1",
      "0000:0000:0000:0000:0000:ffff:127.0.0.1",
      "::ffff:a9fe:a9fe",
      "2001::1",
      "2001:0:4136:e378:8000:63bf:3fff:fdd2",
      "2001:db8::1",
      "64:ff9b:1::a00:1",
      "100::1",
      "::",
      "fe80::1%en0",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true)
    }
    expect(() => assertSafeUrl("http://[::7f00:1]/")).toThrow(UnsafeUrlError)
    expect(() => assertSafeUrl("http://[::ffff:0:7f00:1]/")).toThrow(UnsafeUrlError)
    expect(() => assertPublicAddresses(["2001::5efe:a00:1"])).toThrow(UnsafeUrlError)
  })

  it("still allows public IPv6 and IPv4-mapped public addresses", () => {
    for (const ip of ["2606:4700:4700::1111", "2a00:1450:4001:82a::200e", "::ffff:8.8.8.8"]) {
      expect(isBlockedIp(ip), ip).toBe(false)
    }
  })
})
