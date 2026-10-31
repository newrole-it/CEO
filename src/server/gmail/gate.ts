import { fold } from "matching/text"
import {
  companyKey,
  domainLabel,
  hasPhrase,
  isEmployerDomain,
  isFreeMail,
  registrableDomain,
  systemTier,
} from "./allowlist"
import type { MailHeaders, ScopedApp, Sender, Tier } from "./types"

/**
 * The second check, on headers only. A message that fails is forgotten: its body is never
 * fetched and nothing about it is stored. Pure, so every rule is unit-tested.
 */

export type GateResult =
  | { pass: false; reason: GateReason }
  | { pass: true; tier: Tier; sender: Sender; authenticated: boolean }

export type GateReason =
  | "sender"
  | "label"
  | "self"
  | "private-subject"
  | "hiring-side"
  | "alert"
  | "subject"
  | "free-mail"
  | "bulk"
  | "not-allowed"

/** Headers come from strangers: everything below looks at a bounded piece of them. */
const MAX_HEADER = 1000

/** Never ours to read, even from an allowed sender. HR suites send contracts and payslips. */
const PRIVATE_SUBJECT =
  /\b(faktur\w*|invoice\w*|receipts?|rachun\w*|paragon\w*|zamowien\w*|orders?|przesylk\w*|shipment|delivery|dostaw\w*|platnos\w*|payments?|przelew\w*|hasl\w*|passwords?|kod\w* weryfik\w*|verification code|security alert|alert bezpieczenstwa|payslips?|payroll|compensation|wynagrodz\w*|wyplat\w*|pit-?\d*|umow\w*|aneks\w*|urlop\w*|leave request|time off|timesheet|ewidencj\w*|medicover|luxmed|newsletter\w*|kredyt\w*|pozyczk\w*|loans?|credit card|leasing\w*|ubezpiecz\w*|insurance)\b/

/**
 * What a recruiting system sends the people hiring: it is about other candidates, and someone
 * looking for a job may well use one at work.
 */
const HIRING_SIDE =
  /\b(scorecards?|feedback (due|needed|required|request\w*)|interview kit|new (applicant|candidate)s?|applicants?|requisitions?|approval (needed|required|request\w*)|offer approval|candidate (review|packet|feedback|summary)|ocen\w* kandydat\w*|nowy kandydat|nowa aplikacja|nowe aplikacje|nowe zgloszeni\w*)\b/

/** Job alerts mention offers and roles, but they say nothing about an application. */
const JOB_ALERT =
  /\b(job alerts?|alerty? o prac\w*|new jobs?|jobs? (you|for you|matching|that match)|recommended (jobs?|for you)|nowe oferty|ofert\w* dla (ciebie|was)|polecane oferty|digest|podsumowanie tygodnia|weekly)\b/

/**
 * Phrases, not words. "Aplikacja", "praca", "rola" and "job" turn up in mobile app updates,
 * contracts and everything else, and a subject like that is all it takes to read a body.
 */
const ABOUT_APPLICATION =
  /\b(recruit\w*|hiring|candidat\w*|candidacy|interviews?|applying|you('ve| have)? applied|job (application|offer)|offer letter|your application|application (for|to|received|status|update|submitted|confirmation)|rekrut\w*|kandyd\w*|stanowisk\w*|ofert\w* (pracy|zatrudnienia)|rozmow\w* (kwalifikacyjn|rekrutacyjn|techniczn|z rekruter|o prac)\w*|zatrudnieni\w*|twoj\w* aplikacj\w*|aplikacj\w* (do firmy|w firmie|o prace)|aplikowani\w*|dziekujemy za (aplikacj|zgloszeni)\w*)\b/

const HIDDEN_LABELS = new Set(["SENT", "DRAFT", "SPAM", "TRASH", "CHAT"])
const MARKETING_LABELS = new Set(["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"])

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

/**
 * Whether Gmail itself vouches for the From domain: DMARC, or DKIM from the same organisation.
 * Only the first Authentication-Results header counts: Gmail adds its own on top, and a sender
 * can write any header it likes below that one. SPF is left out because it says nothing about
 * From, and because Gmail repeats the sender's envelope address in that clause.
 */
export function isAuthenticated(authResults: string[], fromDomain: string): boolean {
  const first = authResults[0]?.slice(0, 4000)
  if (!first) return false
  const clean = first.replace(/\([^)]*\)/g, " ").replace(/"[^"]*"/g, " ")
  const [server, ...results] = clean.split(";")
  if (server.trim().toLowerCase() !== "mx.google.com") return false
  const sameOrganisation = (domain: string | undefined) =>
    Boolean(domain) && registrableDomain(domain!) === registrableDomain(fromDomain)
  return results.some((result) => {
    const text = result.trim().toLowerCase()
    if (/^dmarc=pass\b/.test(text)) {
      return sameOrganisation(/header\.from=([^\s;]+)/.exec(text)?.[1])
    }
    if (/^dkim=pass\b/.test(text)) {
      return sameOrganisation(/header\.(?:i=[^@\s]*@|d=)([^\s;]+)/.exec(text)?.[1])
    }
    return false
  })
}

/** Gmail ignores dots and anything after a plus, so me.x+jobs@gmail.com is mex@gmail.com. */
function canonicalAddress(address: string): string {
  const [local, domain] = address.toLowerCase().split("@")
  const base = local.split("+")[0]
  return domain === "gmail.com" || domain === "googlemail.com"
    ? `${base.replace(/\./g, "")}@gmail.com`
    : `${base}@${domain}`
}

/**
 * A real, signed rejection meant for someone else can be sent on to this mailbox and still pass
 * DKIM. The address it was written to is the difference.
 */
export function isAddressedTo(recipients: string[], mailbox: string): boolean {
  const wanted = canonicalAddress(mailbox)
  const found = recipients
    .join(" ")
    .slice(0, 4000)
    .match(/[^\s<>,;:"']{1,64}@[^\s<>,;:"']{1,255}/g)
  return (found ?? []).some((address) => canonicalAddress(address) === wanted)
}

/** Does the subject name this application's role? "Re: Head of Engineering" counts. */
function namesRole(subject: string, apps: ScopedApp[]): boolean {
  return apps.some((app) => hasPhrase(subject, fold(app.title).replace(/\s+/g, " ").trim()))
}

/** Only the domain opens the gate. Anyone can put a company's name in their display name. */
function employerMatches(sender: Sender, apps: ScopedApp[]): ScopedApp[] {
  const domain = registrableDomain(sender.domain)
  if (!isEmployerDomain(domain)) return []
  const label = domainLabel(domain)
  return apps.filter((app) => {
    const key = companyKey(app.company)
    return app.domains.includes(domain) || (key.length >= 3 && key === label)
  })
}

export function gateMessage(
  headers: MailHeaders,
  context: { mailbox: string; apps: ScopedApp[] }
): GateResult {
  const fail = (reason: GateReason): GateResult => ({ pass: false, reason })
  const sender = parseFrom(headers.from)
  if (!sender) return fail("sender")
  if (headers.labelIds.some((label) => HIDDEN_LABELS.has(label))) return fail("label")
  if (sender.address === context.mailbox.toLowerCase()) return fail("self")
  const subject = fold(headers.subject.slice(0, MAX_HEADER))
  if (PRIVATE_SUBJECT.test(subject)) return fail("private-subject")
  if (HIRING_SIDE.test(subject)) return fail("hiring-side")
  if (JOB_ALERT.test(subject)) return fail("alert")
  const authenticated =
    isAuthenticated(headers.authResults, sender.domain) &&
    isAddressedTo(headers.recipients, context.mailbox)

  const system = systemTier(sender.address, sender.domain)
  if (system === "ats") return { pass: true, tier: "ats", sender, authenticated }
  if (system === "mixed") {
    if (!ABOUT_APPLICATION.test(subject)) return fail("subject")
    return { pass: true, tier: "mixed", sender, authenticated }
  }

  if (isFreeMail(sender.domain)) return fail("free-mail")
  const employers = employerMatches(sender, context.apps)
  if (!employers.length) return fail("not-allowed")
  if (headers.listUnsubscribe || headers.precedence === "bulk") return fail("bulk")
  if (headers.labelIds.some((label) => MARKETING_LABELS.has(label))) return fail("bulk")
  // An order confirmation from a shop you also applied to stops here, with its body unread.
  if (!ABOUT_APPLICATION.test(subject) && !namesRole(subject, employers)) return fail("subject")
  return { pass: true, tier: "company", sender, authenticated }
}
