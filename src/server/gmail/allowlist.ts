import { fold } from "matching/text"
import { atsCompanySlug } from "src/server/autofill/job-extract"
import type { ScopedApp, Tier } from "./types"

/**
 * Which mail may be looked at. Gmail is searched only with these lists, so anything else never
 * leaves Google, and gate.ts checks the same lists again on the headers that come back.
 */

/** Recruiting systems, by the name a posting is on. They send mail about applications only. */
const ATS_SYSTEMS: Record<string, readonly string[]> = {
  greenhouse: ["greenhouse-mail.io", "greenhouse.io"],
  lever: ["lever.co"],
  ashby: ["ashbyhq.com"],
  workable: ["workablemail.com", "workable.com"],
  smartrecruiters: ["smartrecruiters.com"],
  teamtailor: ["teamtailor.com", "teamtailor-mail.com"],
  recruitee: ["recruitee.com"],
  breezy: ["breezy.hr", "breezyhr.com"],
  pinpoint: ["pinpointhq.com"],
  jobvite: ["jobvite.com"],
  icims: ["icims.com"],
  traffit: ["traffit.com"],
  erecruiter: ["erecruiter.pl"],
  taleo: ["taleo.net"],
  avature: ["avature.net"],
  jazz: ["jazzhr.com", "applytojob.com"],
  comeet: ["comeet-notifications.com"],
  zoho: ["zohorecruit.com"],
}

/** HR suites. They also send employees their payslips and leave requests. */
const HR_SYSTEMS: Record<string, readonly string[]> = {
  personio: ["personio.de", "personio.com"],
  bamboohr: ["bamboohr.com"],
  workday: ["myworkday.com", "workday.com", "myworkdayjobs.com"],
  successfactors: ["successfactors.com", "successfactors.eu"],
}

/** Job boards. They also send job alerts and marketing. */
const JOB_BOARDS = [
  "pracuj.pl",
  "justjoin.it",
  "nofluffjobs.com",
  "theprotocol.it",
  "bulldogjob.pl",
  "rocketjobs.pl",
  "solid.jobs",
  "indeed.com",
] as const

export const ATS_DOMAINS: readonly string[] = Object.values(ATS_SYSTEMS).flat()

/** One address, not a domain: linkedin.com also sends every social notification there is. */
export const ATS_ADDRESSES = ["jobs-noreply@linkedin.com"] as const

/** The subject has to be about an application as well. */
export const MIXED_DOMAINS: readonly string[] = [...Object.values(HR_SYSTEMS).flat(), ...JOB_BOARDS]

/** Never read, whatever the company name says: this is where personal mail comes from. */
export const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.de",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "fastmail.com",
  "hey.com",
  "yandex.com",
  "wp.pl",
  "o2.pl",
  "onet.pl",
  "interia.pl",
  "gazeta.pl",
  "tlen.pl",
  "op.pl",
  "vp.pl",
  "poczta.fm",
])

/** Services whose own mail says nothing about an employer, even for someone who applied there. */
const NOT_EMPLOYERS = new Set([
  "linkedin.com",
  "google.com",
  "forms.gle",
  "github.io",
  "github.com",
  "gitlab.io",
  "notion.site",
  "notion.so",
  "medium.com",
  "facebook.com",
  "glassdoor.com",
  "olx.pl",
])

/** Polish regional suffixes: anyone can register under them, so they are no organisation. */
const REGIONAL_PL = new Set([
  "waw",
  "warszawa",
  "krakow",
  "wroc",
  "wroclaw",
  "poznan",
  "gda",
  "gdansk",
  "lodz",
  "katowice",
  "szczecin",
  "lublin",
  "bydgoszcz",
  "slask",
  "mazowsze",
  "malopolska",
  "pomorze",
])

/**
 * "careers.acme.co.uk" → "acme.co.uk". A short label under a country code counts as a public
 * suffix (co.il, com.sg, com.pl). That also catches a real domain like "ab.pl" under a subdomain,
 * which only makes a match less likely, the safe direction for something this decides trust on.
 */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean)
  if (parts.length <= 2) return parts.join(".")
  const [second, top] = parts.slice(-2)
  const isSuffix =
    (top.length === 2 && second.length <= 3) || (top === "pl" && REGIONAL_PL.has(second))
  return parts.slice(isSuffix ? -3 : -2).join(".")
}

function isUnder(domain: string, list: readonly string[]): boolean {
  return list.some((entry) => domain === entry || domain.endsWith(`.${entry}`))
}

/** ats or mixed for a known system; null means the sender has to be an employer. */
export function systemTier(address: string, domain: string): Exclude<Tier, "company"> | null {
  if ((ATS_ADDRESSES as readonly string[]).includes(address)) return "ats"
  if (isUnder(domain, ATS_DOMAINS)) return "ats"
  if (isUnder(domain, MIXED_DOMAINS)) return "mixed"
  return null
}

/** Which recruiting system a host belongs to: "hire.lever.co" → "lever". */
export function systemOf(host: string | null): string | null {
  if (!host) return null
  const all = { ...ATS_SYSTEMS, ...HR_SYSTEMS }
  const found = Object.entries(all).find(([, domains]) => isUnder(host.toLowerCase(), domains))
  return found ? found[0] : null
}

export function isFreeMail(domain: string): boolean {
  return FREE_MAIL.has(registrableDomain(domain))
}

export function isEmployerDomain(domain: string): boolean {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return false
  if (isFreeMail(domain) || NOT_EMPLOYERS.has(domain)) return false
  return !isUnder(domain, ATS_DOMAINS) && !isUnder(domain, MIXED_DOMAINS)
}

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/** The first label of a registrable domain, letters and digits only: "acme-x.com" → "acmex". */
export function domainLabel(domain: string): string {
  return domain.split(".")[0].replace(/[^a-z0-9]/g, "")
}

/**
 * The employer's domains: the indexed company's, and the posting's host when its name fits the
 * company. A posting can sit anywhere (wellfound.com, acme.vercel.app), and a host that is not
 * the employer must not vouch for mail from everyone else there.
 */
export function employerDomains(app: {
  url: string | null
  company: string
  companyDomain: string | null
}): string[] {
  const key = companyKey(app.company)
  const fits = (domain: string) => {
    const label = domainLabel(domain)
    if (key.length >= 3 && key === label) return true
    if (key.length >= 4 && label.includes(key)) return true
    return label.length >= 3 && key.startsWith(label)
  }
  const indexed = app.companyDomain ? [registrableDomain(app.companyDomain)] : []
  const host = hostOf(app.url)
  const posting = host ? [registrableDomain(host)].filter(fits) : []
  return [...new Set([...indexed, ...posting].filter(isEmployerDomain))]
}

export function toScopedApp(row: {
  id: string
  company: string
  title: string
  status: string
  url: string | null
  appliedAt: Date
  statusChangedAt: Date
  job?: { sourceType?: string; company: { canonicalDomain: string | null } } | null
}): ScopedApp {
  const indexedSystem = row.job?.sourceType?.toLowerCase() ?? ""
  const known = indexedSystem in ATS_SYSTEMS || indexedSystem in HR_SYSTEMS
  return {
    id: row.id,
    company: row.company,
    title: row.title,
    status: row.status,
    appliedAt: row.appliedAt,
    statusChangedAt: row.statusChangedAt,
    domains: employerDomains({
      url: row.url,
      company: row.company,
      companyDomain: row.job?.company.canonicalDomain ?? null,
    }),
    slug: row.url ? atsCompanySlug(row.url) : null,
    ats: known ? indexedSystem : systemOf(hostOf(row.url)),
  }
}

const LEGAL_FORM =
  /\b(sp\.? ?z ?o\.? ?o\.?|sp\.? ?k\.?|s\.? ?a\.?|s\.? ?k\.? ?a\.?|inc\.?|llc|ltd\.?|limited|gmbh|ag|corp\.?|corporation|polska|poland|group|grupa)(?=\W|$)/g

/** "Acme Polska Sp. z o.o." → "acme": the name as words, for finding it in a line of text. */
export function companyWords(name: string): string {
  return fold(name)
    .replace(LEGAL_FORM, " ")
    .replace(/[^\p{L}\p{N}&+.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s.-]+$/, "")
    .trim()
}

/** "Acme Polska Sp. z o.o." → "acme", "Grand Hotel" → "grandhotel": for comparing with a domain. */
export function companyKey(name: string): string {
  return companyWords(name).replace(/[^a-z0-9]/g, "")
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** A phrase as whole words in folded text: "box" is not in "inbox". */
export function hasPhrase(foldedText: string, foldedPhrase: string): boolean {
  if (foldedPhrase.replace(/[^\p{L}\p{N}]/gu, "").length < 3) return false
  const pattern = escapeRegex(foldedPhrase)
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "u").test(foldedText)
}

export function mentions(foldedText: string, name: string): boolean {
  return hasPhrase(foldedText, companyWords(name))
}

/** The sender's name begins with the company: "Acme Hiring Team", not "Hiring for Acme". */
export function startsWithName(foldedName: string, name: string): boolean {
  const words = companyWords(name)
  if (companyKey(name).length < 3) return false
  return new RegExp(`^${escapeRegex(words)}(?![\\p{L}\\p{N}])`, "u").test(foldedName)
}

/**
 * Subject words the search asks for. Gmail matches whole words, so forms are spelled out. gate.ts
 * asks for more than this: these only keep the bulk of other mail from coming back at all.
 */
const SUBJECT_TERMS = [
  "application",
  "applying",
  "candidate",
  "candidacy",
  "interview",
  "recruitment",
  "recruiting",
  "recruiter",
  "hiring",
  "offer letter",
  "job offer",
  "aplikacja",
  "aplikacji",
  "aplikację",
  "aplikacje",
  "aplikowanie",
  "kandydat",
  "kandydatura",
  "kandydaturę",
  "kandydatury",
  "rekrutacja",
  "rekrutacji",
  "rekrutację",
  "rekrutacyjny",
  "rekrutacyjne",
  "rekrutacyjna",
  "rozmowa",
  "rozmowę",
  "rozmowy",
  "stanowisko",
  "stanowiska",
  "oferta pracy",
  "oferty pracy",
  "zgłoszenie",
  "zatrudnienie",
]

/**
 * A value from the tracker (or a scraped posting) inside a Gmail search, as a quoted phrase. Only
 * letters, digits and a few joiners survive, so a company called `x} OR in:anywhere` cannot widen
 * the search.
 */
export function searchPhrase(value: string): string | null {
  const clean = value
    .replace(/[^\p{L}\p{N} .&+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim()
  return companyKey(clean).length >= 3 ? `"${clean}"` : null
}

function subjectClause(extra: string[] = []): string {
  const terms = SUBJECT_TERMS.map((term) => (term.includes(" ") ? `"${term}"` : term))
  return `{${[...terms, ...extra].map((term) => `subject:${term}`).join(" ")}}`
}

const MAX_QUERY = 1800

/**
 * Every search one sync may run. Each has a `from:` list; there is no way to search the mailbox
 * in general. Sent mail, drafts and chats are out, and Gmail leaves out spam and trash by itself.
 * A company's name is in the list because its domain is often unknown. The gate will not accept
 * a sender on a name alone, so this can bring back headers, never a body.
 */
export function buildQueries(apps: ScopedApp[], after: Date): string[] {
  const base = `after:${Math.floor(after.getTime() / 1000)} -in:chats -in:drafts -in:sent -from:me`
  const from = (senders: readonly string[]) =>
    `{${senders.map((sender) => `from:${sender}`).join(" ")}}`
  const queries = [
    `${from([...ATS_DOMAINS, ...ATS_ADDRESSES])} ${base}`,
    `${from(MIXED_DOMAINS)} ${subjectClause()} ${base}`,
  ]
  const company = `${base} -category:promotions -category:social`
  const room = MAX_QUERY - subjectClause().length - company.length - 8
  let senders: string[] = []
  let roles: string[] = []
  const flush = () => {
    if (senders.length) queries.push(`${from(senders)} ${subjectClause(roles)} ${company}`)
    senders = []
    roles = []
  }
  for (const app of apps) {
    const name = searchPhrase(app.company)
    const appSenders = [...app.domains, ...(name ? [name] : [])]
    if (!appSenders.length) continue
    const role = searchPhrase(app.title)
    const appRoles = role ? [role] : []
    const size = [...senders, ...roles, ...appSenders, ...appRoles].join(" from:subject:").length
    if (size > room) flush()
    senders.push(...appSenders)
    roles.push(...appRoles)
  }
  flush()
  return queries
}
