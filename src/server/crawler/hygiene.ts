import { publicAppUrl } from "src/server/site-url"

export const EXCERPT_CHARS = 300

/** CRAWLER_NOTE says who runs this crawler and why, when that is not one person's own job search. */
export function fetchUserAgent(): string {
  const note = process.env.CRAWLER_NOTE?.trim() || "personal non-commercial job search"
  return `NewRoleBot/0.1 (+${publicAppUrl()}/bot; ${note})`
}

/**
 * Drop emails, phone numbers, and labeled recruiter names before anything is stored.
 * A 00 right after a number is its thousands, not a dialling prefix: "22 000 - 30 000 PLN".
 */
export function stripPersonalData(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/(?<!\d)(?:\+\d|(?<!\d[\s.,])00\d)[\d\s().-]{6,}\d/g, "")
    .replace(
      /\b(?:recruiter|hiring manager|talent partner|kontakt)\s*:\s*[A-ZŁŚŻŹĆŃ][\p{L}'-]+(?:\s+[A-ZŁŚŻŹĆŃ][\p{L}'-]+){0,2}/giu,
      ""
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Drops lone UTF-16 surrogates: half an emoji left by a cut, or by a broken feed. Postgres and the
 * Prisma engine refuse such a string, and the whole board's write fails with it.
 */
export function wellFormed(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
}

export function excerpt(text: string): string {
  const clean = wellFormed(stripPersonalData(text)).replace(/\s+/g, " ").trim()
  if (clean.length <= EXCERPT_CHARS) return clean
  return `${wellFormed(clean.slice(0, EXCERPT_CHARS - 1)).trimEnd()}…`
}

const TDM_HOSTS = new Set(["jobs.sap.com", "careers.phenom.com", "jobs.siemens.com"])

/** True when the page or host reserves TDM or opts out of AI input or training. */
export function aiOptOut(html: string, hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "")
  if (TDM_HOSTS.has(host) || host.endsWith(".phenom.com")) return true
  const sample = html.slice(0, 40_000).toLowerCase()
  if (/ai-input\s*=\s*no/.test(sample)) return true
  if (/ai-train\s*=\s*no/.test(sample)) return true
  if (/tdm-reservation|tdmreservation/.test(sample)) return true
  if (/content-signal[^>\n]*\btdm\b/.test(sample)) return true
  return false
}
