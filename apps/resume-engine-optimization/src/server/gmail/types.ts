/** Shapes shared by the Gmail modules. No database or network here. */

/** Stored in GmailLink.lastErrorCode; the settings screen translates them. Never holds Google's text. */
export const GMAIL_ERROR_CODES = ["reconnect", "key", "rate-limit", "network", "http"] as const
export type GmailErrorCode = (typeof GMAIL_ERROR_CODES)[number]

export function isGmailErrorCode(value: unknown): value is GmailErrorCode {
  return typeof value === "string" && (GMAIL_ERROR_CODES as readonly string[]).includes(value)
}

export type Sender = {
  address: string
  domain: string
  /** Display name; empty when it is missing or looks like a forged address */
  name: string
}

/**
 * ats: recruiting systems, which send nothing else. mixed: systems that also send other mail
 * (payslips, job alerts). company: an employer the person applied to.
 */
export type Tier = "ats" | "mixed" | "company"

/** An open application: what the matching is allowed to look for. */
export type ScopedApp = {
  id: string
  company: string
  title: string
  status: string
  appliedAt: Date
  statusChangedAt: Date
  /** Registrable domains of the employer, e.g. "acme.com". Never an ATS, a job board or free mail. */
  domains: string[]
  /** Company slug in an ATS link, e.g. jobs.lever.co/acme → "acme" */
  slug: string | null
  /** The recruiting system the posting is on, e.g. "lever" */
  ats: string | null
}
