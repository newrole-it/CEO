import { isIP } from "net"

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
  const normalized = ip
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
  const family = isIP(normalized)
  if (family === 4) return isBlockedIpv4(normalized)
  if (family === 6) return isBlockedIpv6(normalized)
  return true
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part))
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true
  }
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true
  return false
}

/**
 * Decided on the eight numeric groups, not on the spelling: ::7f00:1, ::ffff:0:7f00:1 and
 * 0:0:0:0:0:ffff:127.0.0.1 are all ways to write an address that ends up at 127.0.0.1.
 */
function isBlockedIpv6(ip: string): boolean {
  const g = ipv6Groups(ip)
  if (!g) return true
  // ::ffff:a.b.c.d, IPv4-mapped: exactly as safe as that IPv4 address.
  if (g.slice(0, 5).every((group) => group === 0) && g[5] === 0xffff) {
    return isBlockedIpv4(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`)
  }
  // Only 2000::/3 is global unicast. Everything else is loopback, unspecified, IPv4-compatible
  // (::/96), IPv4-translated (::ffff:0:0/96), NAT64 (64:ff9b::/96), discard (100::/64),
  // unique local (fc00::/7), link- and site-local (fe80::/10, fec0::/10) or multicast (ff00::/8).
  if ((g[0] & 0xe000) !== 0x2000) return true
  // 2001::/23 holds Teredo (2001::/32), which tunnels to an IPv4 address, and other IETF ranges.
  if (g[0] === 0x2001 && g[1] < 0x0200) return true
  // Documentation (2001:db8::/32, 3fff::/20) and 6to4 (2002::/16), which embeds an IPv4 address.
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true
  if (g[0] === 0x3fff && g[1] < 0x1000) return true
  if (g[0] === 0x2002) return true
  return false
}

/** The eight 16-bit groups of an IPv6 address, or null when it is not one. */
function ipv6Groups(ip: string): number[] | null {
  let value = ip.toLowerCase().split("%")[0]
  // A dotted IPv4 tail (::ffff:1.2.3.4) is the last two groups.
  const dotted = value.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (dotted) {
    const bytes = dotted.slice(2).map(Number)
    if (bytes.some((byte) => byte > 255)) return null
    const hi = ((bytes[0] << 8) | bytes[1]).toString(16)
    const lo = ((bytes[2] << 8) | bytes[3]).toString(16)
    value = `${dotted[1]}${hi}:${lo}`
  }
  const halves = value.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const filler = new Array<string>(halves.length === 2 ? missing : 0).fill("0")
  const groups = [...head, ...filler, ...tail]
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.map((group) => Number.parseInt(group, 16))
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
  const hostname = url.hostname
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError("Hostname is not allowed")
  }
  if (
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".localhost")
  ) {
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
