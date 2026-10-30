/** The header the app's own fetch sends. A cross-site form cannot set it without a preflight. */
export const BROWSER_IMPORT_HEADER = "x-nowarola-import"

export const LINKEDIN_BROWSER_STAGES = ["connecting", "opening", "reading", "analyzing"] as const
