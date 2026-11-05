import type { Seniority, WorkplaceType } from "./schemas"
import { htmlToText } from "@newrole/offers/text"

const STOP = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "for",
  "to",
  "in",
  "at",
  "on",
  "ds",
  "do",
])

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function normalizeCompanyName(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|gmbh|sa|sp z o o|corp|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function titleTokens(value: string): string[] {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP.has(token))
}

export function inferSeniority(title: string): Seniority {
  const value = ` ${title.toLowerCase()} `
  if (/\b(intern|internship|praktykant|stazysta|stażysta|trainee)\b/.test(value)) return "intern"
  if (/\b(junior|jr|graduate)\b/.test(value)) return "junior"
  if (
    /\b(cto|chief technology|chief technical|vp\b|vice president|head of|dyrektor|szef)\b/.test(
      value
    )
  ) {
    return "executive"
  }
  if (/\b(director)\b/.test(value)) return "director"
  if (/\b(manager|kierownik)\b/.test(value)) return "manager"
  if (/\b(principal)\b/.test(value)) return "principal"
  if (/\b(staff)\b/.test(value)) return "staff"
  if (/\b(senior|sr|lead)\b/.test(value)) return "senior"
  if (/\b(engineer|developer|inżynier|inzynier)\b/.test(value)) return "mid"
  return "unspecified"
}

export function normalizeTitle(raw: string): {
  normalized: string
  seniority: Seniority
  confident: boolean
} {
  const normalized = normalizeWhitespace(raw).replace(/\s+[-|–—]\s+(remote|hybrid|onsite).*$/i, "")
  const seniority = inferSeniority(normalized)
  return {
    normalized,
    seniority,
    confident: seniority !== "unspecified",
  }
}

const COUNTRIES: Record<string, string> = {
  poland: "PL",
  polska: "PL",
  warsaw: "PL",
  warszawa: "PL",
  krakow: "PL",
  kraków: "PL",
  wroclaw: "PL",
  wrocław: "PL",
  gdansk: "PL",
  gdańsk: "PL",
  germany: "DE",
  deutschland: "DE",
  berlin: "DE",
  france: "FR",
  paris: "FR",
  netherlands: "NL",
  amsterdam: "NL",
  spain: "ES",
  madrid: "ES",
  barcelona: "ES",
  ireland: "IE",
  dublin: "IE",
  "united kingdom": "GB",
  uk: "GB",
  london: "GB",
  "united states": "US",
  usa: "US",
  "u.s.": "US",
  "new york": "US",
  "san francisco": "US",
  seattle: "US",
  remote: "",
  sweden: "SE",
  stockholm: "SE",
  portugal: "PT",
  lisbon: "PT",
  czechia: "CZ",
  prague: "CZ",
  austria: "AT",
  vienna: "AT",
}

export function inferCountryCode(location: string | undefined): string | undefined {
  if (!location) return undefined
  const value = location.toLowerCase()
  const keys = Object.keys(COUNTRIES).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (key && value.includes(key) && COUNTRIES[key]) return COUNTRIES[key]
  }
  return undefined
}

export function inferWorkplace(
  explicit: string | undefined,
  location: string | undefined,
  description: string | undefined
): WorkplaceType {
  const blob = `${explicit ?? ""} ${location ?? ""}`.toLowerCase()
  if (/\b(hybrid|hybryd)/.test(blob)) return "HYBRID"
  if (/\b(remote|zdaln|work from home|wfh|distributed)/.test(blob)) return "REMOTE"
  if (/\b(on[- ]?site|onsite|in[- ]office|stacjonarn)/.test(blob)) return "ONSITE"
  const text = (description ?? "").toLowerCase().slice(0, 800)
  if (/\b(fully remote|100% remote|remote-first)\b/.test(text)) return "REMOTE"
  if (/\bhybrid\b/.test(text)) return "HYBRID"
  return "UNKNOWN"
}

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  zł: "PLN",
  zl: "PLN",
}

export function parseSalary(text: string | undefined): {
  min?: number
  max?: number
  currency?: string
} {
  if (!text) return {}
  const compact = text.replace(/\u00a0/g, " ")
  const range = compact.match(
    /(?:(USD|EUR|GBP|PLN|CHF|SEK|CAD|AUD)|([$€£]|zł|zl))?\s*(\d{2,3}(?:[.,\s]\d{3})+|\d{2,7}(?:\.\d+)?)(\s*[kK])?\s*(?:-|–|—|to)\s*(?:(USD|EUR|GBP|PLN|CHF|SEK|CAD|AUD)|([$€£]|zł|zl))?\s*(\d{2,3}(?:[.,\s]\d{3})+|\d{2,7}(?:\.\d+)?)(\s*[kK])?/i
  )
  if (!range) {
    const single = compact.match(
      /(?:(USD|EUR|GBP|PLN|CHF|SEK|CAD|AUD)|([$€£]|zł|zl))\s*(\d{2,3}(?:[.,\s]\d{3})+|\d{2,7}(?:\.\d+)?)(\s*[kK])?/i
    )
    if (!single) return {}
    const amount = amountValue(single[3], single[4])
    return { min: amount, max: amount, currency: currencyOf(single[1], single[2]) }
  }
  const currency =
    currencyOf(range[1] || range[5], range[2] || range[6]) || trailingCurrency(compact)
  return {
    min: amountValue(range[3], range[4]),
    max: amountValue(range[7], range[8]),
    currency,
  }
}

function trailingCurrency(text: string): string | undefined {
  const code = text.match(/\b(USD|EUR|GBP|PLN|CHF|SEK|CAD|AUD)\b/i)?.[1]
  if (code) return code.toUpperCase()
  // "20 000 - 27 000 zł": Polish postings put the symbol after the amount.
  return currencyOf(undefined, text.match(/zł|\bzl\b/i)?.[0])
}

function currencyOf(code: string | undefined, symbol: string | undefined): string | undefined {
  if (code) return code.toUpperCase()
  if (!symbol) return undefined
  return CURRENCY_BY_SYMBOL[symbol.toLowerCase()] || CURRENCY_BY_SYMBOL[symbol]
}

function amountValue(raw: string, kilo: string | undefined): number {
  // A dot with one or two digits after it is a decimal ("$140.8K", "120000.50"). Dropping it read
  // Ashby's "$140.8K – $231K" as 1 408 000–231 000. Three digits ("140.800") are thousands.
  const decimal = /^\d+\.\d{1,2}$/.test(raw)
  const value = Number(decimal ? raw : raw.replace(/[^\d]/g, ""))
  if (!Number.isFinite(value)) return 0
  return Math.round(/k/i.test(kilo ?? "") ? value * 1000 : value)
}

export function cleanDescription(input: string | undefined): string {
  if (!input) return ""
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(input)
  const text = looksLikeHtml ? htmlToText(input) : input
  return text.replace(/\s+\n/g, "\n").trim()
}

export function normalizeEmployment(value: string | undefined): string | undefined {
  if (!value) return undefined
  const key = value.toLowerCase().replace(/[_-]+/g, " ")
  if (key.includes("b2b")) return "B2B"
  if (key.includes("employment") || key.includes("uop") || key.includes("umowa o prac"))
    return "Employment contract"
  if (key.includes("full")) return "Full-time"
  if (key.includes("part")) return "Part-time"
  if (key.includes("contract") || key.includes("contractor")) return "Contract"
  if (key.includes("intern")) return "Internship"
  if (key.includes("temp")) return "Temporary"
  return normalizeWhitespace(value)
}
