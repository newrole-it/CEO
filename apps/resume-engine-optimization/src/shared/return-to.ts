const BASE = "http://return-to.invalid"

/** Same-origin path only. Rejects protocol-relative and off-site targets. */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return null
  // URL parsing drops tabs and newlines, so "/\t/evil.example" would become "//evil.example".
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null
  try {
    // Whatever the browser makes of it has to stay on the page's own origin.
    if (new URL(value, BASE).origin !== BASE) return null
  } catch {
    return null
  }
  return value
}
