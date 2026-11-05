import { fold } from "@newrole/matching/text"
import type { JobVariant, ListedJob } from "../schemas"

const CITIES: Record<string, string> = {
  lodz: "lodz",
  warsaw: "warsaw",
  warszawa: "warsaw",
  krakow: "krakow",
  wroclaw: "wroclaw",
  gdansk: "gdansk",
  poznan: "poznan",
  katowice: "katowice",
}

function stemTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\bconsultant\b/g, " ")
    .replace(/\bengineer\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function contractKind(job: ListedJob): "b2b" | "employment" | "other" {
  const blob = `${job.employmentType ?? ""} ${job.salaryText ?? ""}`.toLowerCase()
  const title = job.title.toLowerCase()
  if (/\bb2b\b/.test(blob) || /\bconsultant\b/.test(title)) return "b2b"
  if (/employment|uop|umowa o prac/.test(blob)) return "employment"
  if (/\bengineer\b/.test(title) && !/\bconsultant\b/.test(title)) return "employment"
  return "other"
}

function variantOf(job: ListedJob, contract: string): JobVariant {
  return {
    title: job.title,
    contract,
    salaryText: job.salaryText,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    url: job.originalUrl,
    externalId: job.externalId,
  }
}

function contractLabel(job: ListedJob, kind: "b2b" | "employment" | "other"): string {
  if (job.employmentType) return job.employmentType
  if (kind === "b2b") return "B2B contract"
  if (kind === "employment") return "employment contract"
  return "unspecified"
}

/**
 * GFT posts the same role twice: an Engineer / employment-contract page and a
 * Consultant / B2B page. Keep both options on one job. Two pages of the same
 * contract are left separate.
 */
export function pairContractVariants(jobs: ListedJob[]): ListedJob[] {
  const groups = new Map<string, ListedJob[]>()
  const passthrough: ListedJob[] = []
  for (const job of jobs) {
    const stem = stemTitle(job.title)
    if (!stem) {
      passthrough.push(job)
      continue
    }
    const company = (job.companyName ?? "").toLowerCase().split(/\s+/)[0] ?? ""
    const key = `${company}|${stem}`
    const list = groups.get(key) ?? []
    list.push(job)
    groups.set(key, list)
  }

  const paired: ListedJob[] = []
  for (const group of groups.values()) {
    for (const cluster of placeClusters(group)) {
      paired.push(...pairCluster(cluster))
    }
  }
  return [...paired, ...passthrough]
}

function pairCluster(group: ListedJob[]): ListedJob[] {
  if (group.length < 2) return group
  const kinds = group.map((job) => contractKind(job))
  const distinct = new Set(kinds.filter((kind) => kind !== "other"))
  const titles = group.map((job) => job.title.toLowerCase())
  const consultantAndOther =
    titles.some((title) => /\bconsultant\b/.test(title)) &&
    titles.some((title) => !/\bconsultant\b/.test(title))
  if (distinct.size < 2 && !consultantAndOther) return group
  const primary =
    group.find((job) => !/\bconsultant\b/i.test(job.title)) ??
    group.find((job) => contractKind(job) === "employment") ??
    group[0]
  const variants = group.map((job) => variantOf(job, contractLabel(job, contractKind(job))))
  const salaryText = variants
    .map((item) => (item.salaryText ? `${item.contract}: ${item.salaryText}` : item.contract))
    .join(" | ")
  return [
    {
      ...primary,
      employmentType: variants.map((item) => item.contract).join(" / "),
      salaryText,
      variants,
    },
  ]
}

function placeClusters(jobs: ListedJob[]): ListedJob[][] {
  const clusters: ListedJob[][] = []
  for (const job of jobs) {
    const cluster = clusters.find((group) => group.some((other) => samePlace(job, other)))
    if (cluster) cluster.push(job)
    else clusters.push([job])
  }
  return clusters
}

function samePlace(left: ListedJob, right: ListedJob): boolean {
  const a = (left.locationText ?? "").trim()
  const b = (right.locationText ?? "").trim()
  if (!a || !b) return true
  if (fold(a) === fold(b)) return true
  const aCities = citySet(a)
  const bCities = citySet(b)
  for (const city of aCities) if (bCities.has(city)) return true
  return false
}

function citySet(location: string): Set<string> {
  const text = fold(location)
  const found = new Set<string>()
  for (const [alias, city] of Object.entries(CITIES)) {
    if (text.includes(alias)) found.add(city)
  }
  return found
}
