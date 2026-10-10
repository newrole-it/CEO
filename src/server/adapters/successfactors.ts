import type { ListedJob } from "src/shared/schemas"
import { htmlToText } from "src/server/jobs/text"
import { asDate, buildListedJob } from "./parse"
import { aiOptOut, excerpt } from "src/server/crawler/hygiene"

export function canonicalHref(html: string): string | undefined {
  const tag = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0]
  if (!tag) return undefined
  const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1]
  return href?.trim() || undefined
}

function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*(?:itemprop|property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:itemprop|property|name)=["']${key}["']`,
      "i"
    ),
  ]
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1]?.trim()
    if (value) return value
  }
  return undefined
}

function layoutValue(html: string, label: string): string | undefined {
  const pattern = new RegExp(
    `joblayouttoken-label">\\s*${label.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    )}[\\s\\S]*?</span>\\s*([^<]*)`,
    "i"
  )
  const value = html
    .match(pattern)?.[1]
    ?.replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return value || undefined
}

function descriptionBlock(html: string): string {
  const match = html.match(/itemprop=["']description["'][^>]*>([\s\S]*?)<\/span>/i)
  return match ? htmlToText(match[1]) : ""
}

function labeledLine(text: string, label: string): string | undefined {
  const pattern = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i")
  const value = text.match(pattern)?.[1]?.replace(/\s+/g, " ").trim()
  return value || undefined
}

export function parseSuccessFactorsJob(
  html: string,
  pageUrl: string,
  companyName?: string,
  boardId?: string
): ListedJob | null {
  let page: URL
  try {
    page = new URL(pageUrl)
  } catch {
    return null
  }
  const canonical = canonicalHref(html)
  const originalUrl = canonical || pageUrl
  const title =
    html
      .match(/itemprop=["']title["'][^>]*>\s*([^<]+)/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() || metaContent(html, "og:title")
  if (!title) return null
  const description = descriptionBlock(html)
  const contract = labeledLine(description, "Type of contract")
  const salaryText = labeledLine(description, "Salary range")
  const workplace = layoutValue(html, "Working place:")
  const location = layoutValue(html, "Location:")
  const posted = metaContent(html, "datePosted") || layoutValue(html, "Date:")
  const id = page.pathname.match(/(\d+)\/?$/)?.[1]
  const listed = buildListedJob({
    externalId: id,
    title,
    companyName: metaContent(html, "hiringOrganization") || companyName,
    locationText: location,
    employmentType: contract,
    workplaceType:
      workplace === "Hybrid" || workplace === "Remote" || workplace === "On-site"
        ? workplaceMap(workplace)
        : undefined,
    descriptionText: excerpt(description),
    salaryText,
    publishedAt: asDate(posted),
    originalUrl,
    sourceType: "SUCCESSFACTORS",
    sourceBoardId: boardId,
    needsHydration: false,
    llmOptOut: aiOptOut(html, page.hostname),
  })
  return listed
}

function workplaceMap(value: string): "HYBRID" | "REMOTE" | "ONSITE" {
  if (value === "Remote") return "REMOTE"
  if (value === "On-site") return "ONSITE"
  return "HYBRID"
}
