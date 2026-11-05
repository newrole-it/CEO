/**
 * What an offer must be to enter the index: a real posting, an IT role, and a place. Every board
 * read goes through this, so nothing is stored that a search would have to hide later.
 */
import { classifyTechRole } from "src/server/classify/role"
import { fold } from "@newrole/matching/text"
import { hasPlace, type JobCountries } from "src/server/geo/countries"

export type GateReason = "junk_title" | "bad_url" | "not_it" | "no_country" | "blocked_country"

/** Test posts and candidate pools. They are not an opening anyone is hiring for. */
const JUNK_TITLE: RegExp[] = [
  /^(test|testing|tbd|tba|n\/?a|xxx+|asdf\w*|dummy|placeholder|sample|untitled|new job|job title)$/,
  /\b(test (job|posting|position|role|opening|vacancy)|do not apply|dont apply|lorem ipsum)\b/,
  /\b(dummy|placeholder|sample) (job|posting|position|role)\b/,
  /\b(general application|open application|spontaneous application|unsolicited application)\b/,
  /\b(talent (pool|community|network)|future opportunit(y|ies)|expressions? of interest)\b/,
  /^eoi\b/,
  /\b(submit your (cv|resume)|send (us )?your (cv|resume)|talent finder|find your perfect job)\b/,
  /\b(candidature spontanee|aplikacja otwarta|initiativbewerbung|sollicitatie open)\b/,
  // Pools and standing posts seen in the index, 2026-11-03: "Talent Pipeline", "(Evergreen)",
  // "Future Openings 2026", "Open Applications", "Spontanansökan", "(Internal Only)".
  /\b(talent pipeline|speculative|evergreen (req|requisition|posting|role|opening)|future (openings?|roles?|positions?|vacancies|hires?)|open applications|spontaneous|candidatura (spontanea|espontanea)|spontanansokan|spontanbewerbung|internal (only|candidates only|applicants only))\b/,
  /(\(evergreen\)|\[evergreen\]|^evergreen\b)/,
]

export function isJunkTitle(title: string): boolean {
  const text = fold(title).trim()
  if (text.length < 3 || text.length > 250) return true
  if (!/[a-z\p{L}]/u.test(text)) return true
  return JUNK_TITLE.some((pattern) => pattern.test(text))
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

/**
 * Undecided roles that an IT board fills with IT work: projects, delivery, implementation, product,
 * research, the company's own leadership. Other undecided titles stay out even there: on boards
 * that are half IT, about 17 in 60 of them were IT (accounting, shipping, physical security...;
 * catalog sample, 2026-11-03). This list raised that to about 45 in 60.
 * "Engineer" alone is here too: on boards at least half IT it is mostly software ("Staff Engineer"
 * at Showpad), on the others mostly civil, mechanical and plant work (catalog sample, 2026-11-03).
 */
const IT_CAPABLE_ROLE =
  /\b(project|projects|program|programme|portfolio|pmo|delivery|release|change|implementation|deployment|integration|configuration|solutions?|technology|research scientist|researcher|applied scientist|product|ceo|coo|founder|co-?founder|general manager|managing director|engineer|engineers|engineering|inzynier\w*|ingenieur\w*|ingeniero|ingeniera|ingegnere|engenheir\w*)\b/

/**
 * A definite IT title is in, a definite other one is out. An undecided one is in only on an IT
 * board, and only when it names a role such a board fills with IT work.
 */
export function isItRole(title: string, boardIsTech: boolean): boolean {
  const verdict = classifyTechRole(title)
  if (verdict === true) return true
  if (verdict === false) return false
  return boardIsTech && IT_CAPABLE_ROLE.test(fold(title))
}

/**
 * Share of all the board's titles that are plainly IT. Undecided titles ("Associate", "Team Lead")
 * count only when at least half the board is. They count against the share too: measured over
 * decided titles alone, a dental chain with one IT administrator and thirty "Zahnarzt" posts
 * read as 100% IT (catalog sample, 2026-11-03).
 */
export const TECH_BOARD_SHARE = 0.5

export function boardIsTech(titles: string[]): boolean {
  if (titles.length === 0) return false
  let tech = 0
  for (const title of titles) if (classifyTechRole(title) === true) tech += 1
  return tech / titles.length >= TECH_BOARD_SHARE
}

export function gateJob(
  job: { title: string; originalUrl: string },
  place: JobCountries,
  context: { boardIsTech: boolean }
): GateReason | null {
  if (isJunkTitle(job.title)) return "junk_title"
  if (!isHttpUrl(job.originalUrl)) return "bad_url"
  if (!isItRole(job.title, context.boardIsTech)) return "not_it"
  if (!hasPlace(place)) return place.blocked.length ? "blocked_country" : "no_country"
  return null
}

export type GateCounts = Partial<Record<GateReason, number>>

export function describeRejections(counts: GateCounts): string {
  const parts = Object.entries(counts)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([reason, count]) => `${reason} ${count}`)
  return parts.length ? `Left out: ${parts.join(", ")}` : ""
}
