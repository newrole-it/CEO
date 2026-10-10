import type { JobVariant, ListedJob } from "src/shared/schemas"

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
    const key = `${company}|${(job.locationText ?? "").toLowerCase()}|${stem}`
    const list = groups.get(key) ?? []
    list.push(job)
    groups.set(key, list)
  }

  const paired: ListedJob[] = []
  for (const group of groups.values()) {
    if (group.length < 2) {
      paired.push(group[0])
      continue
    }
    const kinds = group.map((job) => contractKind(job))
    const distinct = new Set(kinds.filter((kind) => kind !== "other"))
    const titles = group.map((job) => job.title.toLowerCase())
    const consultantAndOther =
      titles.some((title) => /\bconsultant\b/.test(title)) &&
      titles.some((title) => !/\bconsultant\b/.test(title))
    if (distinct.size < 2 && !consultantAndOther) {
      paired.push(...group)
      continue
    }
    const primary =
      group.find((job) => !/\bconsultant\b/i.test(job.title)) ??
      group.find((job) => contractKind(job) === "employment") ??
      group[0]
    const variants = group.map((job) => variantOf(job, contractLabel(job, contractKind(job))))
    const salaryText = variants
      .map((item) => (item.salaryText ? `${item.contract}: ${item.salaryText}` : item.contract))
      .join(" | ")
    paired.push({
      ...primary,
      employmentType: variants.map((item) => item.contract).join(" / "),
      salaryText,
      variants,
    })
  }
  return [...paired, ...passthrough]
}
