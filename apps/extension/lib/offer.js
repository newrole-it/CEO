/**
 * What the open page says about the offer on it, for the check whether the person already applied.
 * Plain DOM, no chrome.*, so a jsdom test runs it as well as the content script. Nothing here
 * clicks or loads more.
 */
import { clean, fold, knownAts } from "./form.js"
import { formatDate } from "./page.js"

const LINKEDIN_HOST = /(^|\.)linkedin\.com$/
const LINKEDIN_VIEW = /\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/
/** Seen in LinkedIn's public offer page, 2026-10-31. The signed-in page has not been checked. */
const LINKEDIN_ROLE = ".top-card-layout__title"
const LINKEDIN_COMPANY = ".topcard__org-name-link"
const MAX_FACT = 300

/** The offer a LinkedIn address shows: /jobs/view/…-123, or ?currentJobId=123 on any job list. */
export function linkedInJobId(href) {
  try {
    const url = new URL(href)
    if (!LINKEDIN_HOST.test(url.hostname)) return null
    const current = url.searchParams.get("currentJobId")
    if (current && /^\d+$/.test(current)) return current
    return LINKEDIN_VIEW.exec(url.pathname)?.[1] ?? null
  } catch (_error) {
    return null
  }
}

function postingsIn(value) {
  if (Array.isArray(value)) return value.flatMap(postingsIn)
  if (!value || typeof value !== "object") return []
  if (value["@graph"]) return postingsIn(value["@graph"])
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]]
  return types.includes("JobPosting") ? [value] : []
}

/** A single-page site can leave the first offer's data behind while it shows another offer. */
function shownOnPage(doc, title) {
  const wanted = fold(title)
  if (fold(doc.title).includes(wanted)) return true
  return Array.from(doc.querySelectorAll("h1")).some((heading) => {
    const text = fold(heading.textContent)
    return text.length >= 3 && (text.includes(wanted) || wanted.includes(text))
  })
}

/** Company and role from schema.org JobPosting: justjoin.it, No Fluff Jobs, many career pages. */
export function jobPosting(doc) {
  for (const script of doc.querySelectorAll("script[type='application/ld+json']")) {
    let data
    try {
      data = JSON.parse(script.textContent)
    } catch (_error) {
      continue
    }
    for (const posting of postingsIn(data)) {
      const organization = posting.hiringOrganization
      const company = clean(typeof organization === "string" ? organization : organization?.name)
      const title = clean(posting.title)
      if (company && title && shownOnPage(doc, title)) return { company, title }
    }
  }
  return null
}

/**
 * LinkedIn's markup is not an API, so the window title backs it up. "Rola | Firma | LinkedIn" is an
 * assumption, not confirmed on a signed-in page; it only fits what the tracker stored from one. If
 * it is wrong nothing matches here, and the address still works.
 */
export function linkedInFacts(doc) {
  const title = clean(doc.querySelector(LINKEDIN_ROLE)?.textContent)
  const company = clean(doc.querySelector(LINKEDIN_COMPANY)?.textContent)
  if (title && company) return { company, title }
  const parts = clean(doc.title)
    .replace(/^\(\d+\+?\)\s*/, "")
    .split(/\s+\|\s+/)
  return parts.length === 3 && /linkedin/i.test(parts[2])
    ? { company: parts[1], title: parts[0] }
    : null
}

/** What to ask about this page; null where nothing is asked: LinkedIn pages that are no offers. */
export function readOffer(doc, href) {
  const hostname = new URL(href).hostname
  const onLinkedIn = LINKEDIN_HOST.test(hostname)
  if (onLinkedIn && !linkedInJobId(href)) return null
  const facts = jobPosting(doc) ?? (onLinkedIn ? linkedInFacts(doc) : null)
  if (facts) {
    return {
      url: href,
      company: facts.company.slice(0, MAX_FACT),
      title: facts.title.slice(0, MAX_FACT),
    }
  }
  // A window title means something only where the page is known to be about a job.
  if (!knownAts(hostname)) return { url: href }
  const site = clean(doc.querySelector("meta[property='og:site_name']")?.getAttribute("content"))
  return {
    url: href,
    pageTitle: clean(doc.title).slice(0, MAX_FACT),
    ...(site ? { siteName: site.slice(0, MAX_FACT) } : {}),
  }
}

/** One offer per key: LinkedIn shows it under many addresses, others under path and query. */
export function offerKey(href) {
  const id = linkedInJobId(href)
  if (id) return `linkedin:${id}`
  const url = new URL(href)
  return `${url.pathname}${url.search}`
}

/** The answer in one line, for the popup, the form panel and the icon's tooltip. */
export function statusLine(data) {
  const applied = data?.applied
  if (applied) {
    const lead = applied.match === "role" ? "Prawdopodobnie już aplikowano" : "Już aplikowano"
    return `${lead} ${formatDate(applied.appliedAt)}. Status: ${
      applied.statusLabel || applied.status
    }.`
  }
  const other = data?.sameCompany?.[0]
  if (other) return `W tej firmie już aplikowano: ${other.title}. Status: ${other.statusLabel}.`
  return ""
}
