import type {QueryExpansion, Seniority, WorkplaceType, WorkMode} from "src/shared/schemas"
import {inferSeniority, titleTokens} from "src/server/jobs/normalize"

export type ScoreInput = {
  title: string
  description: string
  locationText?: string
  workplaceType: WorkplaceType
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
  publishedAt?: Date | null
  expansion: QueryExpansion
  locationHint?: string
  workMode?: WorkMode
  now?: Date
}

export type ScorePart = {
  key: "title" | "seniority" | "skills" | "location" | "salary" | "freshness"
  label: string
  weight: number
  earned: number
  available: boolean
  detail: string
}

export type ScoreResult = {
  score: number
  excluded: boolean
  breakdown: ScorePart[]
  reason: string
  matchedTitle?: string
}

const WEIGHTS = {
  title: 30,
  seniority: 20,
  skills: 20,
  location: 15,
  salary: 10,
  freshness: 5,
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let inter = 0
  for (const token of setA) if (setB.has(token)) inter++
  return inter / (setA.size + setB.size - inter)
}

function containsAll(haystack: string[], needles: string[]): boolean {
  const set = new Set(haystack)
  return needles.every((token) => set.has(token))
}

export function titleMatch(title: string, expansion: QueryExpansion): {points: number; matchedTitle?: string; detail: string} {
  const jobTokens = titleTokens(title)
  const jobNorm = jobTokens.join(" ")
  let best = 0
  let matched: string | undefined
  for (const candidate of expansion.titles) {
    const target = titleTokens(candidate)
    const targetNorm = target.join(" ")
    if (!targetNorm) continue
    if (jobNorm === targetNorm) {
      return {points: WEIGHTS.title, matchedTitle: candidate, detail: `Exact title match for “${candidate}”.`}
    }
    let similarity = jaccard(jobTokens, target)
    if (containsAll(jobTokens, target) || containsAll(target, jobTokens)) similarity = Math.max(similarity, 0.9)
    if (similarity > best) {
      best = similarity
      matched = candidate
    }
  }
  const points = Math.round(best * WEIGHTS.title)
  return {
    points,
    matchedTitle: matched,
    detail: matched ? `Closest title is “${matched}” (${points}/${WEIGHTS.title}).` : "No title overlap.",
  }
}

function excludedBy(title: string, description: string, exclusions: string[]): string | null {
  const blob = `${title}\n${description.slice(0, 400)}`.toLowerCase()
  for (const term of exclusions) {
    const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(blob)) return term
  }
  return null
}

function seniorityPoints(job: Seniority, wanted: string[]): {earned: number; detail: string} {
  const targets = new Set(wanted.map((item) => item.toLowerCase()))
  if (job === "intern" || job === "junior") return {earned: 0, detail: `Seniority ${job} is below this search.`}
  if (targets.has(job)) return {earned: WEIGHTS.seniority, detail: `Seniority ${job} matches the search.`}
  const adjacent: Record<string, string[]> = {
    executive: ["director"],
    director: ["executive", "manager"],
    manager: ["director", "senior"],
    principal: ["staff", "senior"],
    staff: ["principal", "senior"],
    senior: ["staff", "mid", "manager"],
    mid: ["senior"],
    unspecified: [],
  }
  if ((adjacent[job] ?? []).some((item) => targets.has(item))) {
    return {earned: 12, detail: `Seniority ${job} is adjacent to the search.`}
  }
  if (job === "unspecified") return {earned: 10, detail: "Seniority was not stated, so it is not penalized fully."}
  return {earned: 6, detail: `Seniority ${job} is a weaker fit.`}
}

function skillPoints(description: string, skills: string[]): {earned: number; available: boolean; detail: string} {
  if (skills.length === 0) {
    return {earned: 0, available: false, detail: "No skill terms were part of this search."}
  }
  if (!description.trim()) {
    return {earned: 0, available: false, detail: "No description was available to check skills."}
  }
  const blob = description.toLowerCase()
  const hits = skills.filter((skill) => blob.includes(skill.toLowerCase()))
  const earned = Math.round((hits.length / skills.length) * WEIGHTS.skills)
  return {
    earned,
    available: true,
    detail: hits.length ? `Skills mentioned: ${hits.join(", ")}.` : "None of the skill terms appeared in the description.",
  }
}

function locationPoints(input: ScoreInput): {earned: number; available: boolean; detail: string} {
  const mode = input.workMode ?? "ANY"
  const hint = input.locationHint?.trim()
  if (mode === "ANY" && !hint) {
    return {earned: WEIGHTS.location, available: true, detail: "No location or work-mode constraint."}
  }
  let earned = 0
  const notes: string[] = []
  const modeWeight = hint ? 8 : WEIGHTS.location
  const placeWeight = mode === "ANY" ? WEIGHTS.location : 7
  if (mode !== "ANY") {
    const fit =
      input.workplaceType === mode
        ? modeWeight
        : input.workplaceType === "UNKNOWN"
          ? Math.round(modeWeight * 0.6)
          : mode === "REMOTE" && input.workplaceType === "HYBRID"
            ? Math.round(modeWeight * 0.55)
            : mode === "HYBRID" && (input.workplaceType === "REMOTE" || input.workplaceType === "ONSITE")
              ? Math.round(modeWeight * 0.5)
              : 1
    earned += fit
    notes.push(`Work mode ${input.workplaceType} versus ${mode}.`)
  }
  if (hint) {
    const blob = `${input.locationText ?? ""} ${input.description.slice(0, 500)}`.toLowerCase()
    const hit = blob.includes(hint.toLowerCase()) || (hint.toLowerCase() === "poland" && /\b(pl|polska|warsaw|warszawa|remote)\b/.test(blob))
    earned += hit || input.workplaceType === "REMOTE" ? placeWeight : 2
    notes.push(hit ? `Location mentions ${hint}.` : `Location does not mention ${hint}.`)
  }
  return {
    earned: Math.min(WEIGHTS.location, earned),
    available: true,
    detail: notes.join(" "),
  }
}

function freshnessPoints(publishedAt: Date | null | undefined, now: Date): {earned: number; detail: string} {
  if (!publishedAt) return {earned: 2, detail: "No publish date was available."}
  const days = (now.getTime() - publishedAt.getTime()) / 86_400_000
  if (days < 0) return {earned: WEIGHTS.freshness, detail: "Published date is in the future or today."}
  if (days <= 14) return {earned: 5, detail: `Published ${Math.max(0, Math.round(days))} days ago.`}
  if (days <= 45) return {earned: 4, detail: `Published ${Math.round(days)} days ago.`}
  if (days <= 120) return {earned: 3, detail: `Published ${Math.round(days)} days ago.`}
  return {earned: 1, detail: `Published ${Math.round(days)} days ago.`}
}

export function scoreJob(input: ScoreInput): ScoreResult {
  const exclusion = excludedBy(input.title, input.description, input.expansion.exclusions)
  const title = titleMatch(input.title, input.expansion)
  const seniority = seniorityPoints(inferSeniority(input.title), input.expansion.seniority)
  const skills = skillPoints(input.description, input.expansion.skills)
  const location = locationPoints(input)
  const salaryAvailable = input.salaryMin != null || input.salaryMax != null
  const freshness = freshnessPoints(input.publishedAt, input.now ?? new Date())

  const breakdown: ScorePart[] = [
    {key: "title", label: "Title", weight: WEIGHTS.title, earned: title.points, available: true, detail: title.detail},
    {
      key: "seniority",
      label: "Seniority",
      weight: WEIGHTS.seniority,
      earned: seniority.earned,
      available: true,
      detail: seniority.detail,
    },
    {
      key: "skills",
      label: "Skills",
      weight: WEIGHTS.skills,
      earned: skills.earned,
      available: skills.available,
      detail: skills.detail,
    },
    {
      key: "location",
      label: "Location",
      weight: WEIGHTS.location,
      earned: location.earned,
      available: location.available,
      detail: location.detail,
    },
    {
      key: "salary",
      label: "Salary",
      weight: WEIGHTS.salary,
      earned: salaryAvailable ? WEIGHTS.salary : 0,
      available: salaryAvailable,
      detail: salaryAvailable
        ? `Salary is disclosed${input.salaryCurrency ? ` in ${input.salaryCurrency}` : ""}, and this search has no salary floor.`
        : "Salary was not disclosed, so it is left out of the score.",
    },
    {
      key: "freshness",
      label: "Freshness",
      weight: WEIGHTS.freshness,
      earned: freshness.earned,
      available: true,
      detail: freshness.detail,
    },
  ]

  if (exclusion) {
    return {
      score: 0,
      excluded: true,
      breakdown,
      reason: `Excluded because the listing matches “${exclusion}”.`,
      matchedTitle: title.matchedTitle,
    }
  }

  const available = breakdown.filter((part) => part.available)
  const weight = available.reduce((sum, part) => sum + part.weight, 0)
  const earned = available.reduce((sum, part) => sum + part.earned, 0)
  const score = weight === 0 ? 0 : Math.round((earned / weight) * 100)
  const reason = [
    title.detail,
    seniority.detail,
    location.detail,
    freshness.detail,
    salaryAvailable ? breakdown.find((part) => part.key === "salary")?.detail : "",
  ]
    .filter(Boolean)
    .join(" ")

  return {score, excluded: false, breakdown, reason, matchedTitle: title.matchedTitle}
}

export function passesThreshold(result: ScoreResult): boolean {
  if (result.excluded) return false
  const title = result.breakdown.find((part) => part.key === "title")
  return result.score >= 50 && (title?.earned ?? 0) >= 12
}
