/** The header the app's own fetch sends. A cross-site form cannot set it without a preflight. */
export const BROWSER_IMPORT_HEADER = "x-newrole-import"
/** The same header under the name before the rename, from a tab opened on an older build. */
export const LEGACY_BROWSER_IMPORT_HEADER = "x-nowarola-import"

/** True when the request carries the header under either name. */
export function hasBrowserImportHeader(headers: Headers): boolean {
  return (
    headers.get(BROWSER_IMPORT_HEADER) === "1" || headers.get(LEGACY_BROWSER_IMPORT_HEADER) === "1"
  )
}

export const LINKEDIN_BROWSER_STAGES = ["connecting", "opening", "reading", "analyzing"] as const
