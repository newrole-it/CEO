import type { Sender } from "./types"

/** The From header of a message the person opened. It comes from a stranger. */

/** Everything below looks at a bounded piece of it. */
const MAX_HEADER = 1000

/** The real address, and a display name unless it pretends to be an address itself. */
export function parseFrom(value: string): Sender | null {
  const raw = value.trim().slice(0, MAX_HEADER)
  const angle = /^([^<>]*)<([^<>\s]+)>$/.exec(raw)
  const address = (angle ? angle[2] : raw).toLowerCase()
  const parts = /^[^\s@,;<>"]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/.exec(address)
  if (!parts) return null
  const name = angle
    ? angle[1]
        .replace(/^\s*["']|["']\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : ""
  return { address, domain: parts[1], name: /[@<>]/.test(name) ? "" : name }
}
