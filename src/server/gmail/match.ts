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
  // An ATS's domain is shared and its sender name is free text, so the name alone proves nothing.
  // It counts only on the system this very posting is on, which an impostor has to match too.
  if (
    args.tier !== "company" &&
    app.ats &&
    app.ats === systemOf(args.sender.domain) &&
    (startsWithName(name, app.company) || Boolean(app.slug && startsWithName(name, app.slug)))
  ) {
    return { score: 85, certain: true }
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
  message: { sender: Sender; tier: Tier; subject: string; text: string; receivedAt: Date },
  apps: ScopedApp[]
): MatchResult {
  const subject = fold(message.subject)
  const head = fold(message.text.slice(0, HEAD_CHARS))
  const haystack = `${subject}\n${head}`
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
      return [
        { app, certain: company.certain, score: company.score + roleScore(app.title, haystack) },
      ]
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
