import { fold } from "matching/text"

/** Canonical skill id → aliases. Short aliases are matched on word boundaries. */
const SYNONYMS: Record<string, string[]> = {
  kubernetes: ["kubernetes", "k8s"],
  javascript: ["javascript", "js"],
  typescript: ["typescript", "ts"],
  golang: ["golang", "go"],
  python: ["python"],
  java: ["java"],
  kotlin: ["kotlin"],
  rust: ["rust"],
  react: ["react", "react.js", "reactjs"],
  nodejs: ["node.js", "nodejs", "node"],
  postgresql: ["postgresql", "postgres", "psql"],
  mysql: ["mysql"],
  mongodb: ["mongodb", "mongo"],
  redis: ["redis"],
  kafka: ["kafka"],
  spark: ["spark"],
  airflow: ["airflow"],
  docker: ["docker"],
  terraform: ["terraform"],
  aws: ["aws", "amazon web services"],
  gcp: ["gcp", "google cloud"],
  azure: ["azure"],
  graphql: ["graphql"],
  sql: ["sql"],
  csharp: ["c#", "csharp"],
  cpp: ["c++", "cpp"],
}

const LABELS: Record<string, string> = {
  kubernetes: "Kubernetes",
  javascript: "JavaScript",
  typescript: "TypeScript",
  golang: "Go",
  python: "Python",
  java: "Java",
  kotlin: "Kotlin",
  rust: "Rust",
  react: "React",
  nodejs: "Node.js",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  redis: "Redis",
  kafka: "Kafka",
  spark: "Spark",
  airflow: "Airflow",
  docker: "Docker",
  terraform: "Terraform",
  aws: "AWS",
  gcp: "GCP",
  azure: "Azure",
  graphql: "GraphQL",
  sql: "SQL",
  csharp: "C#",
  cpp: "C++",
}

const REQUIRED =
  /wymagan|requirements|must[- ]have|obowiazk|required skills|what you.ll (need|bring)|qualifications/i
const NICE =
  /nice to have|nice-to-have|mile widziane|dobrze widziane|good to have|plus if|preferred|opcjonaln|bonus/i

export type SkillZone = "required" | "nice" | "mentioned"

export type SkillHit = {
  id: string
  label: string
  zone: SkillZone
}

const ALIASES = Object.entries(SYNONYMS).flatMap(([id, aliases]) =>
  aliases.map((alias) => ({ id, alias: fold(alias) }))
)

export function canonicalSkill(skill: string): { id: string; label: string } | null {
  const folded = fold(skill).trim()
  if (folded.length < 2) return null
  const known = ALIASES.find((item) => item.alias === folded)
  if (known) return { id: known.id, label: LABELS[known.id] ?? skill.trim() }
  if (folded.length < 3) return null
  return { id: folded, label: skill.trim() }
}

function pattern(alias: string): RegExp {
  const body = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, "i")
}

function isSectionHeading(line: string): boolean {
  if (line.length >= 80) return false
  if (!(REQUIRED.test(line) || NICE.test(line))) return false
  const rest = line
    .replace(REQUIRED, " ")
    .replace(NICE, " ")
    .replace(/[:\-–—./]+/g, " ")
    .trim()
  return rest.length === 0
}

function zoneForLine(line: string, current: SkillZone): SkillZone {
  if (REQUIRED.test(line)) return "required"
  if (NICE.test(line)) return "nice"
  return current
}

function findIn(text: string, zone: SkillZone, ids: Set<string>): SkillHit[] {
  const folded = fold(text)
  const hits: SkillHit[] = []
  for (const item of ALIASES) {
    if (!ids.has(item.id)) continue
    if (!pattern(item.alias).test(folded)) continue
    hits.push({ id: item.id, label: LABELS[item.id] ?? item.id, zone })
  }
  for (const id of ids) {
    if (ALIASES.some((item) => item.id === id)) continue
    if (id.length < 3) continue
    if (!pattern(id).test(folded)) continue
    hits.push({ id, label: id, zone })
  }
  return hits
}

/** Overlap between profile skills and required / nice-to-have / mentioned skills in the posting. */
export function skillOverlap(
  profileSkills: string[],
  title: string,
  description: string
): { delta: number; hits: SkillHit[]; missingRequired: SkillHit[] } {
  const profile = new Map<string, string>()
  for (const skill of profileSkills) {
    const canonical = canonicalSkill(skill)
    if (canonical) profile.set(canonical.id, canonical.label)
  }
  const profileIds = new Set(profile.keys())
  const lexiconIds = new Set(Object.keys(SYNONYMS))
  const best = new Map<string, SkillHit>()
  const rank: Record<SkillZone, number> = { required: 3, nice: 2, mentioned: 1 }
  const consider = (hit: SkillHit) => {
    const prev = best.get(hit.id)
    if (!prev || rank[hit.zone] > rank[prev.zone]) best.set(hit.id, hit)
  }
  for (const hit of findIn(title, "required", new Set([...profileIds, ...lexiconIds])))
    consider(hit)
  let zone: SkillZone = "mentioned"
  for (const line of description.split(/\n+/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const heading = isSectionHeading(trimmed)
    zone = zoneForLine(trimmed, zone)
    if (heading && trimmed.split(/\s+/).length < 6) continue
    for (const hit of findIn(trimmed, zone, new Set([...profileIds, ...lexiconIds]))) consider(hit)
  }
  const hits = [...best.values()].filter((hit) => profileIds.has(hit.id))
  const missingRequired = [...best.values()].filter(
    (hit) => hit.zone === "required" && !profileIds.has(hit.id)
  )
  const points = hits.reduce((sum, hit) => {
    if (hit.zone === "required") return sum + 3
    if (hit.zone === "nice") return sum + 1
    return sum + 2
  }, 0)
  return { delta: Math.min(8, points), hits, missingRequired: missingRequired.slice(0, 2) }
}
