/**
 * Title tags for the offer search. A tag is a role from ROLE_GROUPS, matched by the title phrases
 * it lists, or free text, where every word has to be a whole word of the title or the employer's
 * name ("docplanner backend"). An offer matches a set of tags when it matches any one of them.
 *
 * Words are compared folded (case and diacritics dropped) and whole, so "cto" no longer matches
 * "Director" and "it" no longer matches "Security". Counted over the 208,812 open offers on
 * 2026-11-03: a substring "cto" was in 5,512 titles, the word in 238.
 *
 * Shared by the server (filtering) and the browser (the tag picker), so no server imports.
 */
import { fold } from "@newrole/matching/text"

export type Role = {
  /** The tag's text, shown on the chip and kept in the URL. */
  name: string
  /**
   * Title phrases, any of which matches: words in a row, "*" stands for any one word and "word*"
   * for any word starting so. Written lowercase, each with at least one word without diacritics
   * for the database to look for (see tagNeedles).
   */
  match: string[]
  /** Phrases that rule a title out even when a `match` phrase is in it. */
  not?: string[]
}

export type RoleGroupId =
  | "lead"
  | "dev"
  | "tech"
  | "arch"
  | "data"
  | "ops"
  | "qa"
  | "sec"
  | "product"
  | "it"

export type RoleGroup = { id: RoleGroupId; roles: Role[] }

/**
 * Checked on 2026-11-03 against the titles of the 209,233 open offers in the index: each English
 * phrase matched at least one, and each role's most common titles and a spread of its rare ones
 * were read for wrong hits, which the `not` lists remove ("Chief of Staff to the CTO", "CIO
 * Advisory", "Behavior Specialist - IOP/PHP"). Nine of the Polish phrases matched none that day,
 * Polish titles being rare in the index ("programista" was in 21); they are there for Polish boards.
 */
export const ROLE_GROUPS: RoleGroup[] = [
  {
    id: "lead",
    roles: [
      {
        name: "CTO",
        match: ["cto", "chief technology officer", "chief technical officer"],
        not: ["chief of staff", "assistant to", "to the cto", "cto office", "cto s"],
      },
      {
        name: "VP of Engineering",
        match: [
          "vp engineering",
          "vp * engineering",
          "vp of * engineering",
          "svp engineering",
          "vice president engineering",
          "vice president * engineering",
          "vice president of * engineering",
          "vp technology",
          "vp of technology",
        ],
        not: ["sales engineering", "solutions engineering"],
      },
      {
        name: "Head of Engineering",
        match: [
          "head of engineering",
          "head of * engineering",
          "head of software development",
          "head of development",
          "head of technology",
          "head of tech",
          "engineering head",
        ],
        not: ["sales engineering", "solutions engineering"],
      },
      {
        name: "Director of Engineering",
        match: [
          "director of engineering",
          "director of * engineering",
          "director * engineering",
          "director engineering",
          "engineering director",
          "director of software development",
          "software development director",
        ],
        not: ["sales engineering", "solutions engineering"],
      },
      {
        name: "Engineering Manager",
        match: [
          "engineering manager",
          "manager engineering",
          "manager of engineering",
          "manager * engineering",
          "manager of * engineering",
          "software development manager",
          "development manager",
        ],
        not: [
          "sales engineering",
          "solutions engineering",
          "solution engineering",
          "business development",
          "program manager",
          "project manager",
        ],
      },
      {
        name: "Tech Lead",
        match: [
          "tech lead",
          "technical lead",
          "technical team lead",
          "lead developer",
          "development lead",
          "engineering lead",
          "lider techniczny",
        ],
      },
      {
        name: "Team Lead",
        match: ["team lead", "team leader", "lider zespołu", "kierownik zespołu"],
        not: ["delivery operations"],
      },
      {
        name: "Head of IT / CIO",
        match: [
          "head of it",
          "head of information technology",
          "it director",
          "director of it",
          "director of information technology",
          "it manager",
          "cio",
          "chief information officer",
          "dyrektor it",
          "kierownik it",
        ],
        not: ["cio advisory"],
      },
      {
        name: "Head of Data / AI",
        match: [
          "head of data",
          "head of ai",
          "head of analytics",
          "head of machine learning",
          "director of data",
          "director of ai",
          "director of analytics",
          "data director",
          "chief data officer",
          "chief ai officer",
          "vp data",
          "vp of data",
          "vp of ai",
        ],
        not: ["chief of staff"],
      },
    ],
  },
  {
    id: "dev",
    roles: [
      {
        name: "Software Engineer",
        match: [
          "software engineer",
          "software developer",
          "software development engineer",
          "application developer",
          "web developer",
          "product engineer",
          "founding engineer",
          "programista",
          "programistka",
          "inżynier oprogramowania",
        ],
      },
      { name: "Backend Developer", match: ["backend", "back end"] },
      { name: "Frontend Developer", match: ["frontend", "front end"] },
      { name: "Full Stack Developer", match: ["full stack", "fullstack"] },
      {
        name: "Mobile Developer",
        match: [
          "mobile developer",
          "mobile engineer",
          "mobile * developer",
          "mobile * engineer",
          "ios",
          "android",
          "react native",
          "flutter",
        ],
        not: ["mobile network"],
      },
      { name: "Embedded Developer", match: ["embedded", "firmware"] },
      {
        name: "Game Developer",
        match: [
          "game developer",
          "game programmer",
          "game engineer",
          "gameplay",
          "unity developer",
          "unreal",
        ],
      },
      {
        name: "Staff / Principal Engineer",
        match: [
          "staff engineer",
          "staff * engineer",
          "principal engineer",
          "principal * engineer",
          "distinguished engineer",
        ],
      },
      { name: "Forward Deployed Engineer", match: ["forward deployed"] },
    ],
  },
  {
    id: "tech",
    roles: [
      { name: "Java", match: ["java"] },
      { name: "Python", match: ["python", "django"] },
      { name: ".NET / C#", match: ["net developer", "net engineer", "dotnet", "c#", "asp net"] },
      { name: "JavaScript / TypeScript", match: ["javascript", "typescript"] },
      { name: "React", match: ["react", "reactjs"] },
      { name: "Angular", match: ["angular"] },
      { name: "Node.js", match: ["node", "nodejs"] },
      { name: "PHP", match: ["php", "laravel", "symfony"], not: ["behavior*"] },
      { name: "Go", match: ["golang", "go developer", "go engineer"] },
      { name: "Ruby", match: ["ruby", "rails"] },
      { name: "C++", match: ["c++"] },
      { name: "Rust", match: ["rust"] },
      { name: "Scala", match: ["scala"] },
      { name: "Kotlin", match: ["kotlin"] },
      { name: "Salesforce", match: ["salesforce"] },
      { name: "SAP", match: ["sap"] },
      { name: "ServiceNow", match: ["servicenow"] },
    ],
  },
  {
    id: "arch",
    roles: [
      {
        name: "Software Architect",
        match: [
          "software architect",
          "application architect",
          "applications architect",
          "java architect",
          "frontend architect",
          "backend architect",
          "architekt oprogramowania",
        ],
      },
      { name: "Solution Architect", match: ["solution architect", "solutions architect"] },
      { name: "Enterprise Architect", match: ["enterprise architect"] },
      {
        name: "Cloud Architect",
        match: [
          "cloud architect",
          "cloud * architect",
          "aws architect",
          "aws * architect",
          "azure architect",
          "azure * architect",
          "gcp architect",
        ],
      },
      {
        name: "Data Architect",
        match: ["data architect", "data * architect"],
        not: ["data center"],
      },
      {
        name: "Security Architect",
        match: ["security architect", "cybersecurity architect", "cyber security architect"],
      },
      {
        name: "AI Architect",
        match: [
          "ai architect",
          "ai * architect",
          "ml architect",
          "machine learning architect",
          "llm architect",
          "large language model architect",
        ],
      },
      {
        name: "Technical Architect",
        match: [
          "technical architect",
          "technology architect",
          "it architect",
          "system architect",
          "systems architect",
          "platform architect",
          "infrastructure architect",
          "integration architect",
          "network architect",
          "architekt it",
        ],
      },
    ],
  },
  {
    id: "data",
    roles: [
      {
        name: "Data Engineer",
        match: [
          "data engineer",
          "data engineering",
          "data platform engineer",
          "big data",
          "etl developer",
          "etl engineer",
          "analytics engineer",
        ],
      },
      { name: "Data Scientist", match: ["data scientist", "data science"] },
      {
        name: "Data Analyst / BI",
        match: [
          "data analyst",
          "analityk danych",
          "bi analyst",
          "bi developer",
          "bi engineer",
          "business intelligence",
          "power bi",
        ],
      },
      {
        name: "AI / ML Engineer",
        match: [
          "machine learning engineer",
          "ml engineer",
          "ai engineer",
          "ai * engineer",
          "ai ml engineer",
          "ml ai engineer",
          "mlops",
          "llm engineer",
          "computer vision",
          "applied scientist",
        ],
      },
    ],
  },
  {
    id: "ops",
    roles: [
      { name: "DevOps Engineer", match: ["devops", "devsecops"] },
      { name: "Site Reliability Engineer", match: ["site reliability", "sre"] },
      { name: "Platform Engineer", match: ["platform engineer", "platform engineering"] },
      {
        name: "Cloud Engineer",
        match: [
          "cloud engineer",
          "cloud * engineer",
          "aws engineer",
          "azure engineer",
          "gcp engineer",
        ],
      },
      {
        name: "Infrastructure Engineer",
        match: ["infrastructure engineer", "infrastructure engineering"],
      },
    ],
  },
  {
    id: "qa",
    roles: [
      {
        name: "QA / Tester",
        match: [
          "qa",
          "quality assurance",
          "quality engineer",
          "quality engineering",
          "tester",
          "testerka",
          "test engineer",
          "test analyst",
        ],
      },
      {
        name: "QA Automation / SDET",
        match: [
          "sdet",
          "test automation",
          "automation tester",
          "automation test",
          "qa automation",
          "automation qa",
          "software development engineer in test",
        ],
      },
    ],
  },
  {
    id: "sec",
    roles: [
      {
        name: "Security Engineer",
        match: [
          "security engineer",
          "application security",
          "appsec",
          "product security",
          "cybersecurity engineer",
          "cyber security engineer",
          "penetration tester",
          "pentester",
          "offensive security",
        ],
      },
      {
        name: "Security Analyst / SOC",
        match: [
          "security analyst",
          "soc analyst",
          "soc engineer",
          "cybersecurity analyst",
          "cyber security analyst",
          "threat intelligence",
          "incident response",
          "security operations",
        ],
      },
      {
        name: "CISO / Head of Security",
        match: [
          "ciso",
          "chief information security officer",
          "head of security",
          "head of information security",
          "head of cybersecurity",
          "head of cyber security",
          "director of security",
          "director of information security",
          "security director",
          "vp security",
          "vp of security",
        ],
      },
    ],
  },
  {
    id: "product",
    roles: [
      { name: "Product Manager", match: ["product manager", "product management"] },
      { name: "Product Owner", match: ["product owner"] },
      {
        name: "Head of Product",
        match: [
          "head of product",
          "director of product",
          "product director",
          "vp product",
          "vp of product",
          "chief product officer",
          "cpo",
        ],
        not: ["product marketing", "product design"],
      },
      {
        name: "UX / Product Designer",
        match: ["product designer", "ux", "ui designer", "user experience", "interaction designer"],
        not: ["ux study"],
      },
      {
        name: "Project Manager",
        match: [
          "project manager",
          "program manager",
          "programme manager",
          "delivery manager",
          "kierownik projektu",
        ],
      },
      { name: "Scrum Master / Agile Coach", match: ["scrum master", "agile coach"] },
      { name: "Technical Writer", match: ["technical writer"] },
      {
        name: "Business Analyst",
        match: [
          "business analyst",
          "system analyst",
          "systems analyst",
          "functional analyst",
          "it analyst",
          "analityk biznesowy",
          "analityk systemowy",
        ],
      },
      {
        name: "Solutions / Sales Engineer",
        match: [
          "solutions engineer",
          "solution engineer",
          "sales engineer",
          "presales",
          "pre sales",
          "solutions consultant",
          "technical account manager",
        ],
      },
    ],
  },
  {
    id: "it",
    roles: [
      {
        name: "System Administrator",
        match: [
          "system administrator",
          "systems administrator",
          "sysadmin",
          "linux administrator",
          "windows administrator",
          "it administrator",
          "administrator systemów",
        ],
      },
      {
        name: "Network Engineer",
        match: ["network engineer", "network administrator", "administrator sieci"],
      },
      { name: "Systems Engineer", match: ["systems engineer", "system engineer"] },
      {
        name: "Database Administrator",
        match: ["database administrator", "dba", "database engineer"],
      },
      {
        name: "IT Support / Helpdesk",
        match: [
          "it support",
          "helpdesk",
          "help desk",
          "service desk",
          "technical support",
          "desktop support",
          "application support",
          "support engineer",
        ],
      },
    ],
  },
]

export const ROLES: Role[] = ROLE_GROUPS.flatMap((group) => group.roles)

/** At most this many tags; each keeps its first TAG_LENGTH characters. */
export const MAX_TAGS = 12
export const TAG_LENGTH = 80

/** Folded words: lowercase, no diacritics, split at anything but letters, digits, + and #. */
export function titleWords(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}+#]+/u)
    .map((word) => word.replace(/^[+#]+/, ""))
    .filter(Boolean)
}

/** Words as typed, only lowercased: what a database LIKE is given. */
export function rawWords(text: string): string[] {
  return text
    .toLocaleLowerCase("pl")
    .split(/[^\p{L}\p{N}+#]+/u)
    .map((word) => word.replace(/^[+#]+/, ""))
    .filter(Boolean)
}

/** The form two tags are compared in: "Head of  engineering" and "head of Engineering" are one. */
export function tagKey(tag: string): string {
  return titleWords(tag).join(" ")
}

const ROLE_BY_KEY = new Map(ROLES.map((role) => [tagKey(role.name), role]))

/** The catalog role a tag names, or null for free text. */
export function roleOf(tag: string): Role | null {
  return ROLE_BY_KEY.get(tagKey(tag)) ?? null
}

/** The group a catalog role is in. */
export function groupOf(role: Role): RoleGroupId {
  return ROLE_GROUPS.find((group) => group.roles.includes(role))!.id
}

/** Tags from the URL or a caller: trimmed, cut to length, one of each, at most MAX_TAGS. */
export function cleanTags(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const value of values) {
    const tag = (value ?? "").replace(/\s+/g, " ").trim().slice(0, TAG_LENGTH)
    const key = tagKey(tag)
    if (!key || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= MAX_TAGS) break
  }
  return tags
}

/** null is "*", any one word. */
type PhraseWord = { text: string; prefix: boolean } | null

function parsePhrase(phrase: string): PhraseWord[] {
  const words: PhraseWord[] = []
  for (const part of phrase.trim().split(/\s+/)) {
    if (part === "*") {
      words.push(null)
      continue
    }
    const prefix = part.endsWith("*")
    const pieces = titleWords(prefix ? part.slice(0, -1) : part)
    pieces.forEach((text, index) =>
      words.push({ text, prefix: prefix && index === pieces.length - 1 })
    )
  }
  return words
}

function phraseIn(words: string[], phrase: PhraseWord[]): boolean {
  if (!phrase.length) return false
  for (let start = 0; start + phrase.length <= words.length; start += 1) {
    let all = true
    for (let index = 0; index < phrase.length && all; index += 1) {
      const want = phrase[index]
      const word = words[start + index]!
      if (want && (want.prefix ? !word.startsWith(want.text) : word !== want.text)) all = false
    }
    if (all) return true
  }
  return false
}

type CompiledRole = { match: PhraseWord[][]; not: PhraseWord[][] }
const compiled = new Map<Role, CompiledRole>()

function compileRole(role: Role): CompiledRole {
  let entry = compiled.get(role)
  if (!entry) {
    entry = { match: role.match.map(parsePhrase), not: (role.not ?? []).map(parsePhrase) }
    compiled.set(role, entry)
  }
  return entry
}

/** Whether a title is one of a catalog role's: any of its phrases, none of its exclusions. */
export function titleIsRole(title: string, role: Role): boolean {
  const words = titleWords(title)
  const { match, not } = compileRole(role)
  return (
    match.some((phrase) => phraseIn(words, phrase)) &&
    !not.some((phrase) => phraseIn(words, phrase))
  )
}

export type TaggedOffer = {
  title: string
  normalizedTitle?: string | null
  company?: string | null
}

/**
 * A test for offers against a set of tags: any tag matching is enough. A catalog role looks at the
 * title only; free text looks at the title and the employer's name together. No tags keep all.
 */
export function tagMatcher(tags: string[]): (offer: TaggedOffer) => boolean {
  const tests = cleanTags(tags).map((tag): ((offer: TaggedOffer) => boolean) => {
    const role = roleOf(tag)
    if (role) {
      return (offer) =>
        titleIsRole(offer.title, role) ||
        Boolean(offer.normalizedTitle && titleIsRole(offer.normalizedTitle, role))
    }
    const wanted = titleWords(tag)
    return (offer) => {
      const have = new Set([
        ...titleWords(offer.title),
        ...titleWords(offer.normalizedTitle ?? ""),
        ...titleWords(offer.company ?? ""),
      ])
      return wanted.every((word) => have.has(word))
    }
  })
  if (!tests.length) return () => true
  return (offer) => tests.some((test) => test(offer))
}

/**
 * For the database: the ways a tag can match, each as words that must all be in the title (or, for
 * free text, the employer's name). A row the tag matches contains them, so a LIKE on them narrows
 * the rows without losing any. Catalog words with diacritics are left to tagMatcher, since a title
 * may spell them without. Null when a way has no word to look for.
 */
export function tagNeedles(tag: string): { words: string[]; company: boolean }[] | null {
  const role = roleOf(tag)
  if (!role) {
    const words = rawWords(tag)
    return words.length ? [{ words, company: true }] : null
  }
  const ways: { words: string[]; company: boolean }[] = []
  for (const phrase of role.match) {
    // "*" and a prefix's star go; a prefix is still a substring of the words it matches.
    const words = rawWords(phrase.replace(/\*/g, " ")).filter((word) => /^[a-z0-9+#]+$/.test(word))
    if (!words.length) return null
    ways.push({ words, company: false })
  }
  return ways
}

/**
 * Catalog roles for what someone is typing: every typed word starts a word of the role's name or of
 * one of its phrases, so "head" finds Head of Engineering and CISO / Head of Security. Roles whose
 * name holds the words come first.
 */
export function suggestRoles(text: string, limit = 6): Role[] {
  const typed = titleWords(text)
  if (!typed.length) return []
  const covers = (words: string[]) =>
    typed.every((want) => words.some((word) => word.startsWith(want)))
  const byName: Role[] = []
  const byPhrase: Role[] = []
  for (const role of ROLES) {
    if (covers(titleWords(role.name))) byName.push(role)
    else if (role.match.some((phrase) => covers(titleWords(phrase.replace(/\*/g, " "))))) {
      byPhrase.push(role)
    }
  }
  return [...byName, ...byPhrase].slice(0, limit)
}
