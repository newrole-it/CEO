/** Same-origin path only. Rejects protocol-relative and off-site targets. */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return null
  if (value.includes("\\") || value.includes("\n") || value.includes("\r")) return null
  return value
}
