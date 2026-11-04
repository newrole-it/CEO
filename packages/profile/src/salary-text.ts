/**
 * Salary expectations read from CV or profile text, in Polish or English, by rules only.
 * Amounts come back monthly, because that is what the profile stores and the review edits.
 */
import type { ProfileDraft } from "./schema"

export type SalaryFromText = Pick<
  ProfileDraft,
  "salaryFloor" | "salaryTarget" | "salaryCurrency" | "salaryPeriod" | "salaryContract"
>

type Currency = NonNullable<ProfileDraft["salaryCurrency"]>

const CURRENCY_WORDS: [RegExp, Currency][] = [
  [/^(pln|zł|zl|złotych|zlotych|złote)$/i, "PLN"],
  [/^(eur|€|euro)$/i, "EUR"],
  [/^(usd|\$|us\$|dollars?)$/i, "USD"],
  [/^(gbp|£|pounds?)$/i, "GBP"],
  [/^(chf)$/i, "CHF"],
]
const CURRENCY = String.raw`(pln|zł|zl|złotych|zlotych|złote|eur|€|euro|usd|us\$|\$|dollars?|gbp|£|pounds?|chf)`
// 25 000 · 25.000 · 25,000 · 25000 · 1,5 · 25 (the multiplier follows separately)
const NUMBER = String.raw`(\d{1,3}(?:[  .,]\d{3})+|\d+(?:[.,]\d{1,2})?)`
const MULT = String.raw`(k|tys\.?|tysięcy|tysiecy|thousand)?`
const AMOUNT = String.raw`${CURRENCY}?\s*${NUMBER}\s*${MULT}\s*${CURRENCY}?`
const RANGE = new RegExp(
  String.raw`(?:od\s+|from\s+|between\s+)?${AMOUNT}\s*(?:-|–|—|do|to|and)\s*${AMOUNT}`,
  "gi"
)
const SINGLE = new RegExp(AMOUNT, "gi")

const SALARY_WORDS =
  /\b(oczekiwan\w*|wynagrodzen\w*|pensj\w*|stawk\w*|zarob\w*|widełk\w*|salary|salaries|compensation|expectations?|expected|pay|rate|income|tc)\b/i
// A single amount is the floor ("od 25 000", "min. 20k") unless it is called a target.
const TARGET_WORDS = /\b(docelow\w*|target|ideal\w*|preferowan\w*|preferred)\b[^\d]{0,20}$/i
const YEAR_WORDS =
  /\b(rocznie|rok|roku|year|yearly|annual\w*|p\.?\s?a\.?|per annum)\b|\/\s*(rok|year|yr)\b/i
const MONTH_WORDS =
  /\b(miesięcznie|miesiecznie|mies\.?|m-c|mc|month|monthly|per month|pm)\b|\/\s*(mies|m-c|mc|month|mo)\b/i
const B2B_WORDS = /\b(b2b|faktur\w*|invoice|netto\s*\+\s*vat|contractor)\b/i
const UOP_WORDS =
  /\b(uop|umow\w* o pracę|umow\w* o prace|brutto|gross|employment contract|permanent)\b/i

function currencyOf(token: string | undefined): Currency | null {
  if (!token) return null
  for (const [pattern, currency] of CURRENCY_WORDS) if (pattern.test(token)) return currency
  return null
}

function numberOf(digits: string, multiplier: string | undefined): number | null {
  let text = digits.replace(/[  ]/g, "")
  // "25.000" and "25,000" are thousands, "1,5" and "25.5" are decimals.
  if (/^\d{1,3}([.,]\d{3})+$/.test(text)) text = text.replace(/[.,]/g, "")
  else text = text.replace(",", ".")
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) return null
  return multiplier ? value * 1000 : value
}

type Found = { min: number; max: number | null; currency: Currency | null; at: number; end: number }

/** Amounts with a currency next to them, or on a line that talks about pay. */
function candidates(line: string, lineTalksPay: boolean): Found[] {
  const found: Found[] = []
  const taken: [number, number][] = []
  for (const match of line.matchAll(RANGE)) {
    const [, c1, n1, m1, c2, c3, n2, m2, c4] = match
    // "25-30k": the multiplier written once covers both ends.
    const a = numberOf(n1, m1 || m2)
    const b = numberOf(n2, m2 || m1)
    const currency = currencyOf(c1) ?? currencyOf(c2) ?? currencyOf(c3) ?? currencyOf(c4)
    if (a == null || b == null || b < a) continue
    if (!currency && !lineTalksPay) continue
    const at = match.index ?? 0
    found.push({ min: a, max: b, currency, at, end: at + match[0].length })
    taken.push([at, at + match[0].length])
  }
  for (const match of line.matchAll(SINGLE)) {
    const at = match.index ?? 0
    if (taken.some(([from, to]) => at >= from && at < to)) continue
    const [, c1, n, m, c2] = match
    const value = numberOf(n, m)
    const currency = currencyOf(c1) ?? currencyOf(c2)
    if (value == null || (!currency && !lineTalksPay)) continue
    found.push({ min: value, max: null, currency, at, end: at + match[0].length })
  }
  // Years of experience, calendar years and small counts are not pay.
  return found.filter(
    (item) => item.min >= 1000 && !(item.min >= 1950 && item.min <= 2100 && !item.currency)
  )
}

/** Reads the first salary expectation in the text; null when there is none. */
export function salaryFromText(source: string): SalaryFromText | null {
  const lines = source.split(/\n+/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const talksPay = SALARY_WORDS.test(line)
    const found = candidates(line, talksPay)[0]
    if (!found) continue
    const context = `${line} ${lines[i + 1] ?? ""}`
    const before = line.slice(0, found.at)
    const after = line.slice(found.end)
    const currency =
      found.currency ?? currencyOf(context.match(new RegExp(CURRENCY, "i"))?.[1]) ?? null
    const big = Math.max(found.min, found.max ?? 0)
    const yearly =
      YEAR_WORDS.test(after) ||
      YEAR_WORDS.test(before) ||
      (!MONTH_WORDS.test(context) && big >= 100_000)
    const monthly = (value: number | null) =>
      value == null ? null : Math.round(yearly ? value / 12 : value)
    const isTarget = found.max == null && TARGET_WORDS.test(before)
    const contract = B2B_WORDS.test(context) ? "b2b" : UOP_WORDS.test(context) ? "uop" : null
    return {
      salaryFloor: isTarget ? null : monthly(found.min),
      salaryTarget: isTarget ? monthly(found.min) : monthly(found.max),
      salaryCurrency: currency,
      salaryPeriod: "month",
      salaryContract: contract,
    }
  }
  return null
}

/** Every amount written in the text, in whole units, for checking a model's numbers against. */
export function amountsInText(source: string): Set<number> {
  const amounts = new Set<number>()
  for (const line of source.split(/\n+/)) {
    for (const item of candidates(line, true)) {
      amounts.add(Math.round(item.min))
      if (item.max != null) amounts.add(Math.round(item.max))
    }
  }
  return amounts
}
