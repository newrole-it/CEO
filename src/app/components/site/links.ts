export const GITHUB_URL = "https://github.com/newrole-it/CEO"
export const GITHUB_ISSUES = `${GITHUB_URL}/issues/new`

/** Cookie with the time the person last opened /companies (for "new since last visit"). */
export const COMPANIES_SEEN_COOKIE = "nr-co-seen"

/** Set by "Skip for now" on /setup: / stops sending this browser to the checklist. */
export const SETUP_SKIP_COOKIE = "nr-setup-skip"

export type ShellUser = {
  id: number
  name: string | null
  email: string
  role: string
  imageUrl?: string | null
} | null
