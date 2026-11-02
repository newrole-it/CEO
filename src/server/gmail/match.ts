import { fold } from "matching/text"
import {
  companyKey,
  domainLabel,
  mentions,
  registrableDomain,
  startsWithName,
  systemOf,
} from "./allowlist"
import type { ScopedApp, Sender, Tier } from "./types"

/** Which application a message is about. Pure; `certain` is what allows a status to change alone. */

export type MatchResult = {
  application: ScopedApp | null
  /** The sender itself proves it, not just a name anyone could have typed */
  certain: boolean
  /** Everything it could be, best first, for the person to choose from */
  candidates: ScopedApp[]
}

const DAY = 86_400_000
const HEAD_CHARS = 2000
/** Below this gap two roles at one company are too close to call */
const CLEAR_LEAD = 15

function titleWords(title: string): string[] {
  return fold(title)
    .split(/[^\p{L}\p{N}+#.]+/u)
    .filter((word) => word.length > 1)
}

function roleScore(title: string, haystack: string): number {
  const whole = fold(title).replace(/\s+/g, " ").trim()
  if (whole.length >= 3 && haystack.includes(whole)) return 40
  const words = titleWords(title)
  if (!words.length) return 0
  const hits = words.filter((word) => haystack.includes(word)).length
  return Math.round((30 * hits) / words.length)
}

/** Words every title has, which say nothing about which role it is. */
const GENERIC_ROLE_WORDS = new Set([
  "senior",
  "junior",
  "mid",
  "regular",
  "lead",
  "principal",
  "staff",
  "intern",
  "trainee",
  "engineer",
  "developer",
  "specialist",
  "manager",
  "expert",
  "position",
  "role",
  "job",
  "opening",
  "vacancy",
  "the",
  "this",
  "that",
  "your",
  "our",
  "an",
  "of",
  "and",
  "for",
  "in",
  "at",
  "to",
  "on",
  "with",
  "open",
  "inzynier",
  "programista",
  "programistka",
  "specjalista",
  "specjalistka",
  "starszy",
  "mlodszy",
  "stanowisko",
])

/** "Application for the Data Engineer role", "na stanowisko Tester": the role a message names. */
const ROLE_NAMED: RegExp[] = [
  /\b(?:application|applying|applied|candidacy|interest)\s+for\s+(?:the\s+|our\s+|an?\s+)?(?:(?:position|role)\s+(?:of\s+)?)?(.{2,80}?)(?:\s+(?:position|role|opening|vacancy|job)\b|\s+(?:at|with|in)\s|\s+[-–|]\s|\s*[,.;:!?\n(]|$)/,
  /\bfor the (.{2,80}?) (?:position|role|opening|vacancy)\b/,
  /\bna stanowisk\w*:?\s+(.{2,80}?)(?:\s+w\s|\s+[-–|]\s|\s*[,.;:!?\n(]|$)/,
  /\b(?:position|role|stanowisko)\s*:\s*(.{2,80}?)(?:\s+[-–|]\s|\s*[,.;!?\n(]|$)/,
]

function rolesNamed(subject: string, head: string): string[] {
  const found: string[] = []
  for (const text of [subject, head]) {
    for (const pattern of ROLE_NAMED) {
      const role = pattern.exec(text)?.[1]?.trim()
      if (role) found.push(role)
    }
  }
  return found
}

function distinctWords(title: string, company: string[]): string[] {
  return titleWords(title).filter(
    (word) => !GENERIC_ROLE_WORDS.has(word) && !company.includes(word)
  )
}

/**
 * The message names a role and none of it is this application's: "Data Engineer" against
 * "Platform Engineer". A rejection for the other role must not close this one alone.
 */
function namesOtherRole(app: ScopedApp, named: string[]): boolean {
  const company = titleWords(`${app.company} ${app.slug ?? ""}`)
  const own = distinctWords(app.title, company)
  if (!own.length) return false
  const others = named
    .map((role) => distinctWords(role, company))
    .filter((words) => words.length > 0)
  if (!others.length) return false
  return !others.some((words) => words.some((word) => own.includes(word)))
}

function companyEvidence(
  app: ScopedApp,
  args: { sender: Sender; tier: Tier; subject: string; head: string }
): { score: number; certain: boolean } | null {
  const domain = registrableDomain(args.sender.domain)
  const key = companyKey(app.company)
  const name = fold(args.sender.name)
  // The employer's own domain, known from the index or from the posting.
  if (app.domains.includes(domain)) return { score: 100, certain: true }
  // Spelling the company proves little: anyone can register acme.xyz. Worth asking, though.
  if (key.length >= 3 && key === domainLabel(domain)) return { score: 90, certain: false }
  // An ATS's domain is shared and its sender name is free text: anyone with an account on the same
  // system can type "Acme Hiring". On the posting's own system it finds the application, and the
  // person confirms the change.
  if (
    args.tier !== "company" &&
    app.ats &&
    app.ats === systemOf(args.sender.domain) &&
    (startsWithName(name, app.company) || Boolean(app.slug && startsWithName(name, app.slug)))
  ) {
    return { score: 85, certain: false }
  }
  // A common word in a subject is no proof: "Next steps…" is not about a company called Next.
  const named =
    mentions(name, app.company) ||
    mentions(args.subject, app.company) ||
    Boolean(app.slug && (mentions(name, app.slug) || mentions(args.subject, app.slug)))
  if (named) return { score: 70, certain: false }
  if (mentions(args.head, app.company)) return { score: 50, certain: false }
  return null
}

export function matchApplication(
  message: {
    sender: Sender
    tier: Tier
    subject: string
    text: string
    receivedAt: Date
    /** The role as the model read it, when it did */
    title?: string | null
  },
  apps: ScopedApp[]
): MatchResult {
  const subject = fold(message.subject)
  const head = fold(message.text.slice(0, HEAD_CHARS))
  const haystack = `${subject}\n${head}`
  const named = rolesNamed(subject, head)
  if (message.title) named.push(fold(message.title))
  const scored = apps
    // Mail from before the application is about an earlier process at that company.
    .filter((app) => message.receivedAt.getTime() >= app.appliedAt.getTime() - DAY)
    .flatMap((app) => {
      const company = companyEvidence(app, {
        sender: message.sender,
        tier: message.tier,
        subject,
        head,
      })
      if (!company) return []
      const certain = company.certain && !namesOtherRole(app, named)
      return [{ app, certain, score: company.score + roleScore(app.title, haystack) }]
    })
    .sort((a, b) => b.score - a.score)
  const candidates = scored.map((item) => item.app)
  const [top, second] = scored
  if (!top) return { application: null, certain: false, candidates: [] }
  if (second && top.score - second.score < CLEAR_LEAD) {
    return { application: null, certain: false, candidates }
  }
  return { application: top.app, certain: top.certain, candidates }
}
