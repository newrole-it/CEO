import { createHash } from "crypto"
import type { CvContent } from "@newrole/cv-core/schema"

/** What a store needs to keep a CV's history: telling whether two contents are the same. */

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    const fields = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, field]) => `${JSON.stringify(key)}:${canonical(field)}`)
    return `{${fields.join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

/** sha256 of the content, stable across key order (Postgres stores JSON with its keys reordered). */
export function contentHash(content: CvContent): string {
  return createHash("sha256").update(canonical(content)).digest("hex")
}
