import { Prisma } from "@prisma/client"
import db from "db"
import { ROLES, rawWords, roleOf, tagKey, titleIsRole, titleWords } from "src/shared/title-tags"

export type TitleSuggestion = {
  title: string
  count: number
  /** The catalog role this title falls under, when one does. */
  role: string | null
}

/** Distinct titles read per query; the busiest come first, so the top of the list is in them. */
const TITLE_ROWS = 400
/** Level words dropped from either end of a title: the level filter covers them. */
const LEVEL_WORDS = new Set([
  "senior",
  "sr",
  "junior",
  "jr",
  "mid",
  "middle",
  "regular",
  "starszy",
  "starsza",
  "mlodszy",
  "mlodsza",
  "i",
  "ii",
  "iii",
  "iv",
  "1",
  "2",
  "3",
])

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\#]/g, "\\$&")
}

/**
 * The part of a title that holds every typed word, cut at the separators titles use for team and
 * place ("Head of Engineering, Rewards", "Co-Founder / Head of Engineering (100 % remote)"), without
 * a level word at either end. Null when no part holds them all.
 */
export function titleCore(title: string, typed: string[]): string | null {
  const parts = title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .split(/\s[-–—|·•]\s|:\s|[,;|]/)
    // "Co-Founder / Head of Engineering" is two titles, "AI / ML Engineer" one.
    .flatMap((part) => {
      const halves = part.split(/\s\/\s/)
      return halves.every((half) => half.trim().includes(" ")) ? halves : [part]
    })
    .map((part) => part.trim())
  for (const part of parts) {
    const words = titleWords(part)
    if (!typed.every((want) => words.some((word) => word.startsWith(want)))) continue
    const shown = part.split(/\s+/)
    while (shown.length && LEVEL_WORDS.has(titleWords(shown[0]!).join(" "))) shown.shift()
    while (shown.length && LEVEL_WORDS.has(titleWords(shown[shown.length - 1]!).join(" "))) {
      shown.pop()
    }
    const core = shown.join(" ").replace(/^[^\p{L}\p{N}.]+|[^\p{L}\p{N}+#]+$/gu, "")
    if (!core || shown.length > 7) return null
    return core
  }
  return null
}

/**
 * Titles open offers carry for what someone is typing, most offers first: the part of each title
 * holding the typed words, counted together across seniority and team suffixes. Words start a
 * title word ("eng" finds Engineering, not "Challenge"). Catalog roles are left out; the picker
 * lists those itself. Counts cover the whole index, every country.
 */
export async function suggestTitles(text: string, limit = 8): Promise<TitleSuggestion[]> {
  const typed = titleWords(text).slice(0, 5)
  const raw = rawWords(text).slice(0, 5)
  if (!typed.length || typed.join("").length < 2) return []
  const words = raw.map((word) => Prisma.sql`title ~* ${`\\m${escapeRegex(word)}`}`)
  const rows = await db.$queryRaw<{ title: string; count: number }[]>`
    SELECT title, COUNT(*)::int AS count
    FROM "Job"
    WHERE status IN ('ACTIVE', 'POSSIBLY_CLOSED') AND ${Prisma.join(words, " AND ")}
    GROUP BY title
    ORDER BY count DESC
    LIMIT ${TITLE_ROWS}`
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>()
  for (const row of rows) {
    const core = titleCore(row.title, typed)
    if (!core || roleOf(core)) continue
    const key = tagKey(core)
    const group = groups.get(key) ?? { count: 0, spellings: new Map<string, number>() }
    group.count += row.count
    group.spellings.set(core, (group.spellings.get(core) ?? 0) + row.count)
    groups.set(key, group)
  }
  return [...groups.values()]
    .map((group) => ({
      title: [...group.spellings].sort((a, b) => b[1] - a[1])[0]![0],
      count: group.count,
    }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((item) => ({
      ...item,
      role: ROLES.find((role) => titleIsRole(item.title, role))?.name ?? null,
    }))
}
