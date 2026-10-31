/** What a job-related e-mail says and what Nowa Rola did about it (src/server/gmail). */

/** Where a person revokes the app's access. Here because the settings screen is a client bundle. */
export const GOOGLE_PERMISSIONS = "https://myaccount.google.com/permissions"

export const MAIL_SIGNALS = [
  "CONFIRMATION",
  "NEXT_STAGE",
  "SCREENING",
  "INTERVIEW",
  "TASK",
  "FINAL",
  "OFFER",
  "REJECTED",
  "OTHER",
] as const

export type MailSignal = (typeof MAIL_SIGNALS)[number]

/**
 * APPLIED changed a status, CREATED added an application, NOTED only put the message on the
 * timeline, PENDING waits for the person, IGNORED was not about an application.
 */
export const MAIL_OUTCOMES = [
  "APPLIED",
  "CREATED",
  "NOTED",
  "PENDING",
  "IGNORED",
  "DISMISSED",
  "UNDONE",
] as const

export type MailOutcome = (typeof MAIL_OUTCOMES)[number]

export function isMailSignal(value: unknown): value is MailSignal {
  return typeof value === "string" && (MAIL_SIGNALS as readonly string[]).includes(value)
}

export function isMailOutcome(value: unknown): value is MailOutcome {
  return typeof value === "string" && (MAIL_OUTCOMES as readonly string[]).includes(value)
}
