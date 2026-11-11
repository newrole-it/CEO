import type { ListedJob } from "../schemas"
import { htmlToText } from "@newrole/offers/text"
import { asDate, buildListedJob } from "./parse"
import { aiOptOut, excerpt } from "@newrole/offers/hygiene"

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
    )}[\\s\\S]*?</span>([\\s\\S]{0,1500})`,
    "i"
  )
  const chunk = html.match(pattern)?.[1]
  if (!chunk) return undefined
  const trimmed = chunk.replace(/^\s+/, "")
  const raw = trimmed.startsWith("<") ? elementInner(trimmed) : (trimmed.split("<")[0] ?? "")
  const value = raw
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return value || undefined
}

function elementInner(fragment: string): string {
  const open = fragment.match(/^<([a-zA-Z0-9]+)\b[^>]*>/)
  if (!open) return htmlToText(fragment.slice(0, 400))
  const tag = open[1].toLowerCase()
  const re = new RegExp(`</?${tag}\\b[^>]*>`, "gi")
  re.lastIndex = open[0].length
  let depth = 1
  let match: RegExpExecArray | null
  while ((match = re.exec(fragment))) {
    if (match[0].startsWith("</")) depth -= 1
    else if (!match[0].endsWith("/>")) depth += 1
    if (depth === 0) return htmlToText(fragment.slice(open[0].length, match.index))
  }
  return htmlToText(fragment.slice(open[0].length, open[0].length + 500))
}

function descriptionBlock(html: string): string {
  const marker = html.match(/itemprop=["']description["'][^>]*>/i)
  if (!marker || marker.index == null) return ""
  const fragment = html.slice(marker.index + marker[0].length)
  const re = /<\/?span\b[^>]*>/gi
  let depth = 1
  let match: RegExpExecArray | null
  while ((match = re.exec(fragment))) {
    if (match[0].startsWith("</")) depth -= 1
    else if (!match[0].endsWith("/>")) depth += 1
    if (depth === 0) return htmlToText(fragment.slice(0, match.index))
  }
  return htmlToText(fragment.slice(0, 8000))
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
  boardId?: string,
  opts?: { fullText?: boolean }
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
  const location =
    layoutValue(html, "Working Location:") ||
    layoutValue(html, "Location:") ||
    metaContent(html, "streetAddress")
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
    descriptionText: opts?.fullText ? description : excerpt(description),
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
