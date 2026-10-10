import {isIP} from "net"

const ALLOWED_PORTS = new Set(["", "80", "443"])

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.internal.",
])

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafeUrlError"
  }
}

export function isBlockedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase().replace(/^\[|\]$/g, "")
  const family = isIP(normalized)
  if (family === 4) return isBlockedIpv4(normalized)
  if (family === 6) return isBlockedIpv6(normalized)
  return true
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return true
  if (a >= 224) return true
  return false
}

function isBlockedIpv6(ip: string): boolean {
  const value = ip.toLowerCase()
  if (value === "::1" || value === "::" || value === "0:0:0:0:0:0:0:1") return true
  if (value.startsWith("fe80:") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) {
    return true
  }
  // Unique local fc00::/7 and link-local / multicast.
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("ff")) return true
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isBlockedIpv4(mapped[1])
  if (value.startsWith("::ffff:")) {
    const hex = value.slice("::ffff:".length)
    const v4 = ipv4FromMappedHex(hex)
    if (v4) return isBlockedIpv4(v4)
  }
  return false
}

function ipv4FromMappedHex(hex: string): string | null {
  const parts = hex.split(":")
  if (parts.length !== 2) return null
  const nums = parts.map((part) => Number.parseInt(part, 16))
  if (nums.some((num) => !Number.isFinite(num) || num < 0 || num > 0xffff)) return null
  const a = (nums[0] >> 8) & 0xff
  const b = nums[0] & 0xff
  const c = (nums[1] >> 8) & 0xff
  const d = nums[1] & 0xff
  return `${a}.${b}.${c}.${d}`
}

export function assertSafeUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeUrlError("URL is not parseable")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs are allowed")
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with credentials are not allowed")
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeUrlError("Only ports 80 and 443 are allowed")
  }
  const hostname = url.hostname.replace(/\.$/, "").toLowerCase()
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError("Hostname is not allowed")
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".localhost")) {
    throw new UnsafeUrlError("Local hostnames are not allowed")
  }
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new UnsafeUrlError("IP address is not public")
  }
  return url
}

export function assertPublicAddresses(addresses: string[]): void {
  if (addresses.length === 0) {
    throw new UnsafeUrlError("Hostname did not resolve")
  }
  for (const address of addresses) {
    if (isBlockedIp(address)) {
      throw new UnsafeUrlError("Hostname resolves to a non-public address")
    }
  }
}
