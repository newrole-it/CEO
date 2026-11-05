import { z } from "zod"
import { CITY_ALIASES } from "@newrole/matching/normalization"
import { fold } from "@newrole/matching/text"
import { isPlatformName, readCompanyName } from "src/server/companies/names"
import { hostOf, isAggregatorHost } from "@newrole/ats/careers-detect"
import { decodeEntities } from "@newrole/offers/text"
import { createLlmClient } from "src/server/llm/client"
import { wrapUntrusted } from "@newrole/llm/common"

/**
 * Company, role and location of the posting behind an application page (E5.3):
 * the Job index by URL first, then rules (the page's own data, its address, title patterns), then
 * the model.
 */

export type ExtractedJob = { company: string; title: string; location: string | null }
export type PageInput = {
  url: string
  title?: string | null
  text?: string | null
  siteName?: string | null
  /** The hiring company and role in the page's schema.org JobPosting, read by the extension */
  company?: string | null
  role?: string | null
}

type JobFacts = { company: string | null; title: string | null; location: string | null }
/**
 * company rests on evidence. companyGuess is only where a window title usually keeps a company, as
 * in "Staff Engineer - Warsaw", so the page's reading by the model goes first.
 */
export type RuleFacts = JobFacts & { companyGuess?: string }
export type ModelFacts = JobFacts & { salaryText: string | null }

// ---------------------------------------------------------------- ATS URL slugs

const SUBDOMAIN_ATS: { host: RegExp; skip?: RegExp }[] = [
  { host: /^([a-z0-9-]+)\.teamtailor\.com$/ },
  { host: /^([a-z0-9-]+)\.recruitee\.com$/ },
  { host: /^([a-z0-9-]+)\.jobs\.personio\.(?:de|com)$/ },
  { host: /^([a-z0-9-]+)\.bamboohr\.com$/ },
  { host: /^([a-z0-9-]+)\.breezy\.hr$/ },
  { host: /^([a-z0-9-]+)\.pinpointhq\.com$/ },
  { host: /^([a-z0-9-]+)\.traffit\.com$/ },
  { host: /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/ },
  { host: /^([a-z0-9-]+)\.myworkdayjobs\.com$/ },
  { host: /^(?:careers-)?([a-z0-9-]+)\.icims\.com$/ },
]

const PATH_ATS: RegExp[] = [
  /^(?:boards|job-boards|job-boards\.eu)\.greenhouse\.io$/,
  /^jobs(?:\.eu)?\.lever\.co$/,
  /^jobs\.ashbyhq\.com$/,
  /^apply\.workable\.com$/,
  /^jobs\.smartrecruiters\.com$/,
  /^jobs\.jobvite\.com$/,
]

/** Recruitment software on hosts the lists above leave out; see platformKeyForHost in config. */
const VENDOR_HOST =
  /(^|\.)(?:greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|jobvite\.com|erecruiter\.pl|taleo\.net|successfactors\.(?:com|eu)|sapsf\.(?:com|eu)|oraclecloud\.com|avature\.net|phenom\.com|hibob\.com|peopleforce\.io|join\.com)$/

/** A job board's or recruitment software's address: what it spells is not the employer. */
function onPlatformHost(rawUrl: string): boolean {
  const host = hostOf(rawUrl)?.replace(/^www\./, "")
  if (!host) return false
  return (
    isAggregatorHost(host) ||
    VENDOR_HOST.test(host) ||
    SUBDOMAIN_ATS.some(({ host: pattern }) => pattern.test(host)) ||
    PATH_ATS.some((pattern) => pattern.test(host))
  )
}

/** LinkedIn's feed, its tracker, a search with no offer open: no one job for a model to read. */
function aboutNoOffer(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (!/(^|\.)linkedin\.com$/.test(url.hostname)) return false
    return !url.searchParams.has("currentJobId") && !url.pathname.includes("/jobs/view/")
  } catch {
    return false
  }
}

const GENERIC_SLUGS = new Set([
  "embed",
  "job_app",
  "jobs",
  "j",
  "o",
  "careers",
  "apply",
  "en",
  "pl",
  "de",
  "www",
])

/** The company slug an ATS URL carries, e.g. jobs.lever.co/acme/… → "acme". */
export function atsCompanySlug(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  for (const { host: pattern } of SUBDOMAIN_ATS) {
    const match = pattern.exec(host)
    if (match && !GENERIC_SLUGS.has(match[1])) return match[1]
  }
  if (/greenhouse\.io$/.test(host)) {
    const forParam = url.searchParams.get("for")
    if (forParam) return forParam.toLowerCase()
  }
  if (PATH_ATS.some((pattern) => pattern.test(host))) {
    const first = url.pathname.split("/").filter(Boolean)[0]
    if (first && !GENERIC_SLUGS.has(first.toLowerCase())) {
      // a malformed escape ("%E0") must not fail the Gmail sync or the extension
      try {
        return decodeURIComponent(first)
      } catch {
        return null
      }
    }
  }
  return null
}

/** Role and location some ATS URLs spell out (SmartRecruiters, Workday). */
export function atsUrlFacts(rawUrl: string): { title: string | null; location: string | null } {
  try {
    const url = new URL(rawUrl)
    const host = url.hostname.toLowerCase()
    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part))
    if (host === "jobs.smartrecruiters.com" && parts[1]) {
      // /Acme/743999912345678-senior-backend-engineer
      const slug = parts[1].replace(/^\d+-?/, "")
      return { title: slug ? unslug(slug) : null, location: null }
    }
    if (/myworkdayjobs\.com$/.test(host)) {
      // /en-US/External/job/Warsaw-Poland/Senior-Engineer_R12345
      const at = parts.indexOf("job")
      if (at >= 0 && parts[at + 2]) {
        const title = parts[at + 2].replace(/_[A-Z]*-?\d[\w-]*$/, "")
        return { title: unslug(title), location: unslug(parts[at + 1]) }
      }
    }
  } catch {}
  return { title: null, location: null }
}

function unslug(slug: string): string {
  const words = slug
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return words.replace(
    /(^|\s)(\p{Ll})/gu,
    (_all, space: string, letter: string) => space + letter.toUpperCase()
  )
}

// ---------------------------------------------------------------- job board links

/** What "(he/she)" or "(k/m)" leaves behind in a slug. */
const GENDER_SLUG =
  /-(?:he-she|she-he|f-m(?:-[dx])?|m-f(?:-[dx])?|k-m(?:-[xn])?|m-k(?:-[xn])?|m-w|w-m|w-a)(?=-|$)/g

const LEVEL_WORD = /^(?:senior|sr|junior|jr|mid|regular|lead|principal|staff|expert|trainee)$/

/** Words that open a role when it has no level: "acme-java-developer". */
const TITLE_WORD =
  /^(?:java|javascript|js|typescript|ts|python|php|ruby|golang|go|rust|scala|kotlin|swift|android|ios|react|angular|vue|node|dotnet|cpp|data|software|cloud|ml|ai|machine|automation|test|security|embedded|mobile|ux|ui|salesforce|sap|aws|azure|gcp)$/

const NO_FACTS: JobFacts = { company: null, title: null, location: null }

function slugWords(slug: string): string[] {
  return fold(decodeURIComponent(slug)).replace(GENDER_SLUG, "-").split("-").filter(Boolean)
}

function placeOf(word: string): string | null {
  if (word === "remote" || word === "zdalnie") return "Remote"
  return CITY_ALIASES[word]?.[0] ?? null
}

function placeIndexes(words: string[]): number[] {
  return words.flatMap((word, index) => (placeOf(word) ? [index] : []))
}

function wordsLabel(words: string[]): string | null {
  if (!words.length) return null
  return unslug(words.join(" ")).replace(/\bSp Z O O\b/, "sp. z o.o.")
}

/** justjoin.it: company, then role. A level word is the safest place to tell them apart. */
function splitCompanyRole(words: string[]): { company: string | null; title: string | null } {
  let at = words.findIndex((word) => LEVEL_WORD.test(word))
  if (at < 0) at = words.findIndex((word) => TITLE_WORD.test(word) || ROLE_WORDS.test(word))
  if (at <= 0) return { company: null, title: wordsLabel(words) }
  return { company: wordsLabel(words.slice(0, at)), title: wordsLabel(words.slice(at)) }
}

/**
 * Company, role and city a job board's link spells out. Boards are never fetched, so this reads
 * the URL alone, and it is a guess for the person to check. Shapes seen on the live sites,
 * 2026-10-30. nofluffjobs could not be checked and returns nothing.
 */
export function boardUrlFacts(rawUrl: string): JobFacts {
  try {
    const url = new URL(rawUrl)
    const host = url.hostname.toLowerCase().replace(/^www\./, "")
    const path = url.pathname

    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
      // /jobs/view/3912345678/?companyName=Acme+Corp, how LinkedIn's own lists link to an offer
      const named = url.searchParams.get("companyName")?.trim() || null
      // /jobs/view/senior-engineer-at-acme-corp-3912345678
      const match = /\/jobs\/view\/(.+)-at-(.+)-\d+\/?$/.exec(path)
      if (!match) return { ...NO_FACTS, company: named }
      return {
        company: named ?? wordsLabel(slugWords(match[2])),
        title: wordsLabel(slugWords(match[1])),
        location: null,
      }
    }
    if (host === "pracuj.pl" || host.endsWith(".pracuj.pl") || host === "theprotocol.it") {
      // /praca/senior-java-developer-warszawa-prosta-68,oferta,1005123928
      const match = /\/praca\/([^/,]+),oferta,/.exec(path)
      if (!match) return NO_FACTS
      const words = slugWords(match[1])
      const [first] = placeIndexes(words)
      if (first === undefined) return { ...NO_FACTS, title: wordsLabel(words) }
      return {
        company: null,
        title: wordsLabel(words.slice(0, first)),
        location: placeOf(words[first]),
      }
    }
    if (host === "bulldogjob.pl" || host === "bulldogjob.com") {
      // /companies/jobs/218225-senior-java-developer-warszawa-teamquest
      const match = /\/companies\/jobs\/\d+-([^/]+)\/?$/.exec(path)
      if (!match) return NO_FACTS
      const words = slugWords(match[1])
      const places = placeIndexes(words)
      if (!places.length) return { ...NO_FACTS, title: wordsLabel(words) }
      return {
        company: wordsLabel(words.slice(places[places.length - 1] + 1)),
        title: wordsLabel(words.slice(0, places[0])),
        location: places.map((index) => placeOf(words[index])).join(", "),
      }
    }
    if (host === "justjoin.it") {
      // /job-offer/jit-team-senior-java-developer-warszawa-java-6ba701d7
      const match = /\/(?:job-offer|offers)\/([^/]+)\/?$/.exec(path)
      if (!match) return NO_FACTS
      const words = slugWords(match[1])
      const places = placeIndexes(words)
      const last = places[places.length - 1]
      if (last === undefined) return { ...NO_FACTS, ...splitCompanyRole(words) }
      return { ...splitCompanyRole(words.slice(0, last)), location: placeOf(words[last]) }
    }
  } catch {}
  return NO_FACTS
}

function squash(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

/** "acme-corp" → "Acme Corp", or the spelling the page uses ("ACME Corp.") when it has one. */
export function companyFromSlug(slug: string, hints: string[] = []): string {
  const target = squash(slug)
  if (target) {
    for (const hint of hints) {
      for (const piece of splitTitle(hint)) {
        if (squash(piece) === target) return piece
      }
      // A run of words in the hint that spells the slug: "Join Acme Corp today" → "Acme Corp".
      const words = hint.split(/\s+/)
      for (let start = 0; start < words.length; start++) {
        let built = ""
        for (let end = start; end < Math.min(words.length, start + 5); end++) {
          built += squash(words[end])
          if (built === target)
            return words
              .slice(start, end + 1)
              .join(" ")
              .replace(/[,.:;|]+$/, "")
          if (!target.startsWith(built)) break
        }
      }
    }
  }
  return unslug(slug)
}

// ---------------------------------------------------------------- title patterns

const SUFFIXES =
  /\s*[|\-–—·•:]\s*(greenhouse|lever|ashby|workable|teamtailor|recruitee|smartrecruiters|personio|workday|bamboohr|breezy( hr)?|pinpoint|traffit|jobvite|icims|erecruiter|linkedin|pracuj\.pl|just join it|justjoin\.it|no fluff jobs|nofluffjobs|the ?protocol(\.it)?|bulldogjob|careers?|jobs?|kariera|praca|oferty pracy|job board|apply|application)\s*$/i

const ROLE_WORDS =
  /\b(engineer|engineering|developer|programmer|architect|manager|lead|leader|head|director|vp|chief|cto|cio|designer|analyst|scientist|specialist|consultant|administrator|admin|devops|sre|tester|qa|owner|officer|intern|internship|staż|stażysta|inżynier|programista|kierownik|dyrektor|specjalista|projektant|analityk|tester|koordynator|coordinator|recruiter|product|marketing|sales|support|frontend|backend|fullstack|full-stack|senior|junior|mid|principal|staff)\b/i

function splitTitle(title: string): string[] {
  return title
    .split(/\s+[|\-–—·•]\s+|\s+@\s+|\s+at\s+|\s+w\s+(?=[A-ZŁŚŻŹĆŃÓ])/)
    .map((piece) => piece.trim())
    .filter(Boolean)
}

/** A page title that names the site's section rather than a job. */
export const GENERIC_TITLE =
  /^(?:home|strona główna|kariera|careers?|jobs?|praca|oferty? pracy|welcome)$/i

/** Title parts that name no company. "(f/m/x)" marks a part of a role, whatever else it says. */
const NOT_A_COMPANY =
  /^(?:home|strona główna|apply(?: now)?|aplikuj|kariera|careers?|jobs?|job offers?(?: .*)?|praca|oferty? pracy|remote|hybrid|zdalnie|hybrydowo|polska|poland)$|\((?:[a-z]+\/)+[a-z]+\)/i

function couldBeCompany(name: string, url: string): boolean {
  return !NOT_A_COMPANY.test(name) && !placeOf(fold(name)) && !isPlatformName(name, url)
}

/** og:site_name, when it names the employer: a board's names the board, and software its maker. */
function siteCompany(page: PageInput): string | null {
  const name = page.siteName?.trim()
  const host = hostOf(page.url)
  if (!name || !host || isAggregatorHost(host)) return null
  const company = readCompanyName(name)
  return couldBeCompany(company, page.url) ? company : null
}

export function cleanTitle(raw: string): string {
  // "(3) Rola | Firma": LinkedIn counts unread notifications in the window title.
  let title = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\(\d+\+?\)\s*/, "")
  for (let i = 0; i < 3; i++) title = title.replace(SUFFIXES, "").trim()
  return title.replace(
    /^(job application for|application for|apply for|apply to|aplikuj na|aplikuj:|oferta pracy:?)\s+/i,
    ""
  )
}

/** Company and role from a page title, using the ATS slug or site name to tell them apart. */
export function parseTitle(rawTitle: string, companyHint?: string | null): JobFacts {
  const out: JobFacts = { company: null, title: null, location: null }
  if (!rawTitle?.trim()) return out
  const title = cleanTitle(rawTitle)

  // Greenhouse: "Job Application for Senior Engineer at Acme"; Ashby: "Senior Engineer @ Acme"
  const at = /^(.+?)\s+(?:at|@|w firmie)\s+(.+)$/i.exec(title)
  if (at && !(companyHint && squash(at[1]) === squash(companyHint))) {
    out.title = at[1].trim()
    out.company = at[2].replace(SUFFIXES, "").trim()
    return out
  }

  const pieces = title
    .split(/\s+[|\-–—·•]\s+/)
    .map((piece) => piece.trim())
    .filter(Boolean)
  if (pieces.length < 2) {
    if (companyHint) {
      // "Acme Senior Backend Engineer" (SmartRecruiters) → strip the company prefix.
      const words = title.split(/\s+/)
      for (let n = 1; n < Math.min(words.length, 5); n++) {
        if (squash(words.slice(0, n).join("")) === squash(companyHint)) {
          out.company = words.slice(0, n).join(" ")
          out.title = words.slice(n).join(" ") || null
          return out
        }
      }
    }
    out.title = title
    return out
  }
  if (companyHint) {
    const hint = squash(companyHint)
    const index = pieces.findIndex(
      (piece) => squash(piece) === hint || squash(piece).startsWith(hint)
    )
    if (index >= 0) {
      out.company = pieces[index]
      out.title = pieces.find((_piece, i) => i !== index) ?? null
      return out
    }
  }
  const [first, second] = pieces
  const firstRole = ROLE_WORDS.test(first)
  const secondRole = ROLE_WORDS.test(second)
  if (firstRole && !secondRole) return { company: second, title: first, location: null }
  if (secondRole && !firstRole) return { company: first, title: second, location: null }
  // Most ATS put the role first: "Senior Engineer - Acme".
  return { company: second, title: first, location: null }
}

/** "careers.acme.com" → "Acme" when nothing better is known. */
export function companyFromHost(rawUrl: string): string | null {
  if (onPlatformHost(rawUrl)) return null
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "")
    const parts = host
      .split(".")
      .filter(
        (part) =>
          !/^(careers?|jobs?|kariera|praca|apply|join|work|hire|recruiting|talent|boards?|en|pl)$/.test(
            part
          )
      )
    // "acme.co.uk", "acme.com.pl": the label before the suffix is the name, not "co".
    if (parts.length >= 3 && /^(co|com|org|net)$/.test(parts[parts.length - 2])) parts.pop()
    const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0]
    return name && name.length > 1 ? unslug(name) : null
  } catch {
    return null
  }
}

/**
 * Rules only: what the page states, its address and title patterns. No database, no model. Only a
 * source that names the employer fills company: the second part of a window title is often a city,
 * a site section or the board, so it stays a guess, and the model is asked.
 */
export function extractJobByRules(page: PageInput): RuleFacts {
  // Lever's JSON-LD names "Job&amp;Talent", escaped twice (read 2026-11-01).
  const given = decodeEntities(page.company ?? "").trim() || null
  const stated = given && !isPlatformName(given, page.url) ? given : null
  const role = decodeEntities(page.role ?? "").trim() || null
  const slug = atsCompanySlug(page.url)
  const hints = [page.siteName ?? "", page.title ?? ""].filter(Boolean)
  const slugCompany = slug ? companyFromSlug(slug, hints) : null
  const siteName = siteCompany(page)
  const hostCompany = companyFromHost(page.url)
  const parsed = parseTitle(page.title ?? "", stated ?? siteName ?? slugCompany ?? hostCompany)
  const fromUrl = atsUrlFacts(page.url)
  const board = boardUrlFacts(page.url)
  // "SRE at TikTok" names the company outright, which beats a slug like "tiktok-eu". Elsewhere the
  // slug wins: in "Staff Engineer - Warsaw" the second part is not a company.
  const explicit =
    /\s(?:at|@|w firmie)\s/i.test(cleanTitle(page.title ?? "")) &&
    parsed.company &&
    couldBeCompany(parsed.company, page.url)
      ? parsed.company
      : null
  const spelled = slug && explicit ? squash(explicit).includes(squash(slug)) : false
  // A part of the title that the address spells too: "Web & SEO Manager | Job offers in IT |
  // Comarch" on career.comarch.com, where the second part is not the company.
  const inTitleAndHost =
    parsed.company && hostCompany && squash(parsed.company).startsWith(squash(hostCompany))
      ? parsed.company
      : null
  const company =
    stated ??
    board.company ??
    siteName ??
    (spelled ? slugCompany : explicit) ??
    slugCompany ??
    inTitleAndHost
  const guess =
    !company &&
    parsed.company &&
    !aboutNoOffer(page.url) &&
    !ROLE_WORDS.test(parsed.company) &&
    couldBeCompany(parsed.company, page.url)
      ? parsed.company
      : null
  let title = parsed.title
  if (title && company && squash(title) === squash(company)) title = null
  if (title && (GENERIC_TITLE.test(title) || isPlatformName(title, page.url))) title = null
  return {
    company: company || null,
    title: role || fromUrl.title || title || board.title || null,
    location: fromUrl.location ?? board.location ?? null,
    ...(guess ? { companyGuess: guess } : {}),
  }
}

// ---------------------------------------------------------------- model

const ModelSchema = z.object({
  company: z.string().max(160).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  salary: z.string().max(200).nullable().optional(),
})

const SYSTEM = [
  "You read a job application page and name the hiring company, the job title, the job location and the pay.",
  'Return JSON: {"company": string|null, "title": string|null, "location": string|null, "salary": string|null}.',
  "Use the exact spelling from the page. Use null when the page does not say. company is the employer: never a job board or the recruitment software the page runs on, such as LinkedIn, Pracuj.pl, Workable, BambooHR or eRecruiter, and never a city, a workplace (an office, a warehouse, a logistics centre) or a section of the site. A careers site on its own domain belongs to the employer, so the domain helps tell the employer from a workplace.",
  'salary is the pay for this job as the page writes it, with the currency and period, e.g. "20 000 - 28 000 PLN brutto / mies.". Null for anything else, such as a bonus or a benefit.',
].join("\n")

const MONEY = /\d.*(?:PLN|zł|EUR|€|USD|\$|GBP|£|CHF)|(?:PLN|EUR|€|USD|\$|GBP|£|CHF).*\d/i

/** The text sent to the model is cut at 4000 characters, and pay is often further down. */
function payLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => line.length < 200 && MONEY.test(line))
    .slice(0, 8)
    .join("\n")
}

export async function extractJobByModel(page: PageInput): Promise<ModelFacts | null> {
  const client = createLlmClient()
  if (!client) return null
  const pay = payLines(page.text ?? "")
  const user = [
    wrapUntrusted("page_url", page.url.slice(0, 500)),
    wrapUntrusted("page_title", (page.title ?? "").slice(0, 300)),
    ...(page.siteName ? [wrapUntrusted("page_site_name", page.siteName.slice(0, 200))] : []),
    wrapUntrusted("page_text", (page.text ?? "").slice(0, 4000)),
    ...(pay ? [wrapUntrusted("page_pay_lines", pay)] : []),
  ].join("\n")
  try {
    const result = await client.completeJson({
      purpose: "job-extract",
      system: SYSTEM,
      user,
      schema: ModelSchema,
      maxTokens: 200,
    })
    if (!result) return null
    const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() || null
    const company = clean(result.data.company)
    return {
      company: company && couldBeCompany(company, page.url) ? company : null,
      title: clean(result.data.title),
      location: clean(result.data.location),
      salaryText: clean(result.data.salary),
    }
  } catch (error) {
    console.error("job-extract failed", error instanceof Error ? error.message : error)
    return null
  }
}

// ---------------------------------------------------------------- index

/**
 * The posting behind an application page, so the form and the job description count as one
 * application: /apply and /application go, and a Greenhouse embed becomes its board URL
 * (urlKey drops `for` and `token`, so every embed would otherwise look like the same posting).
 */
export function normalizePostingUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    url.hash = ""
    if (/greenhouse\.io$/.test(url.hostname) && /\/embed\/job_app/.test(url.pathname)) {
      const board = url.searchParams.get("for")
      const token = url.searchParams.get("token")
      if (board && token) return `https://boards.greenhouse.io/${board}/jobs/${token}`
    }
    // Google Careers sends /jobs/recommendations/<id> to a Google sign-in; /jobs/results/<id> is
    // the same posting in public (both read 2026-11-04).
    if (url.hostname === "www.google.com") {
      url.pathname = url.pathname.replace(
        /^\/about\/careers\/applications\/jobs\/recommendations\//,
        "/about/careers/applications/jobs/results/"
      )
    }
    url.pathname = url.pathname.replace(
      /\/(apply(\/[^/]*)?|application|applications\/new|apply-now|aplikuj)\/?$/i,
      ""
    )
    return url.toString()
  } catch {
    return rawUrl
  }
}

/** The page URL as sent, then the posting it belongs to. */
export function postingUrlCandidates(rawUrl: string): string[] {
  return [...new Set([rawUrl, normalizePostingUrl(rawUrl)])]
}

type IndexLookup = (
  url: string
) => Promise<{ company: { name: string }; title: string; locationText: string | null } | null>

async function defaultLookup(url: string) {
  const { findJobByUrl } = await import("src/server/applications/service")
  return findJobByUrl(url)
}

export async function extractJobFromIndex(
  url: string,
  lookup: IndexLookup = defaultLookup
): Promise<ExtractedJob | null> {
  for (const candidate of postingUrlCandidates(url)) {
    const job = await lookup(candidate).catch(() => null)
    if (job) return { company: job.company.name, title: job.title, location: job.locationText }
  }
  return null
}

export function isComplete(value: JobFacts | null): boolean {
  return Boolean(value?.company && value?.title)
}

/** The model reads the page only for what the rules lack, and only a page about one job. */
export function needsModel(page: PageInput, rules: JobFacts): boolean {
  return !isComplete(rules) && !aboutNoOffer(page.url)
}

/** Rules first, the model fills the gaps. */
export function mergeFacts(rules: RuleFacts, model: RuleFacts | null): RuleFacts {
  if (!model) return rules
  const companyGuess = rules.companyGuess ?? model.companyGuess
  return {
    company: rules.company ?? model.company,
    title: rules.title ?? model.title,
    location: rules.location ?? model.location,
    ...(companyGuess ? { companyGuess } : {}),
  }
}

/**
 * Falls back to the host name, a guess from the title and the page title. Null without a company,
 * so a board's or an ATS vendor's name never stands in for the employer.
 */
export function finishJob(page: PageInput, facts: RuleFacts): ExtractedJob | null {
  const company = facts.company ?? companyFromHost(page.url) ?? facts.companyGuess
  const title = facts.title ?? (page.title ? cleanTitle(page.title) : null)
  if (!company || !title) return null
  return {
    company: company.slice(0, 160),
    title: title.slice(0, 200),
    location: facts.location?.slice(0, 160) ?? null,
  }
}

/**
 * Company, role and location for a page. The index wins; then rules; the model fills what
 * the rules miss (skipped with useModel: false).
 */
export async function extractJob(
  input: PageInput & { userId?: number; useModel?: boolean }
): Promise<ExtractedJob | null> {
  const indexed = await extractJobFromIndex(input.url)
  if (indexed) return indexed
  const rules = extractJobByRules(input)
  const model =
    needsModel(input, rules) && input.useModel !== false ? await extractJobByModel(input) : null
  return finishJob(input, mergeFacts(rules, model))
}
