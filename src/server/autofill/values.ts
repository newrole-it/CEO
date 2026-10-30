import type { ApplicantInfo } from "src/shared/applicant"
import { fold, type FieldKind, type FormField } from "./fields"

/**
 * Deterministic values for standard fields from "Dane do formularzy" (E0.2): no model involved.
 * Selects and radios get the closest option, or null when nothing matches well enough.
 */

const PLACEHOLDER_OPTION =
  /^(select|wybierz|choose|please select|prosze wybrac|--+|-|none selected|brak wyboru)\b/

export function realOptions(options: string[] | undefined): string[] {
  return (options ?? []).filter((option) => {
    const folded = fold(option)
    return folded && !PLACEHOLDER_OPTION.test(folded)
  })
}

const SYNONYMS: string[][] = [
  ["tak", "yes", "y", "true"],
  ["nie", "no", "n", "false"],
  ["polska", "poland", "pl", "rzeczpospolita polska", "republic of poland"],
  ["niemcy", "germany", "deutschland", "de"],
  ["wielka brytania", "united kingdom", "uk", "great britain", "gb", "england"],
  ["stany zjednoczone", "united states", "usa", "us", "united states of america"],
  ["czechy", "czech republic", "czechia"],
  ["slowacja", "slovakia"],
  ["ukraina", "ukraine"],
  ["holandia", "niderlandy", "netherlands", "the netherlands"],
  ["hiszpania", "spain"],
  ["francja", "france"],
  ["wlochy", "italy"],
  ["portugalia", "portugal"],
  ["irlandia", "ireland"],
  ["szwajcaria", "switzerland"],
  ["szwecja", "sweden"],
  ["norwegia", "norway"],
  ["dania", "denmark"],
  ["finlandia", "finland"],
  ["belgia", "belgium"],
  ["litwa", "lithuania"],
  ["lotwa", "latvia"],
  ["estonia", "estonia"],
  ["wegry", "hungary"],
  ["rumunia", "romania"],
  ["austria", "austria"],
  ["kanada", "canada"],
  ["warszawa", "warsaw"],
  ["krakow", "cracow"],
  ["wroclaw", "breslau"],
  ["od zaraz", "immediately", "natychmiast", "asap", "available immediately", "now"],
]

function synonymsOf(value: string): string[] {
  const folded = fold(value)
  const group = SYNONYMS.find((items) => items.includes(folded))
  return group ?? [folded]
}

/** Days a notice period or start offset means: "1 miesiąc" → 30, "od zaraz" → 0, "2 weeks" → 14. */
export function durationDays(value: string): number | null {
  const text = fold(value)
  if (!text) return null
  if (/\b(od zaraz|immediately|natychmiast|asap|none|brak|0 days|right away|now)\b/.test(text))
    return 0
  const match =
    /(\d+(?:[.,]\d+)?)\s*(dni|dzien|days?|tyg\w*|weeks?|mies\w*|months?|mo|m|lat\w*|years?|rok\w*)?/.exec(
      text
    )
  if (!match) {
    if (/\b(miesiac|month)\b/.test(text)) return 30
    return null
  }
  const n = Number(match[1].replace(",", "."))
  const unit = match[2] ?? ""
  if (/^(dni|dzien|day)/.test(unit)) return n
  if (/^(tyg|week)/.test(unit)) return n * 7
  if (/^(lat|year|rok)/.test(unit)) return n * 365
  if (/^(mies|month|mo|m$)/.test(unit)) return n * 30
  return null
}

function tokens(value: string): Set<string> {
  return new Set(
    fold(value)
      .split(" ")
      .filter((token) => token.length > 1 || /\d/.test(token))
  )
}

function overlap(a: string, b: string): number {
  const left = tokens(a)
  const right = tokens(b)
  if (!left.size || !right.size) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  return shared / Math.max(left.size, right.size)
}

/** Numbers in "10 000 – 15 000 PLN", "15k-20k" → [10000, 15000]. */
export function numbersIn(value: string): number[] {
  const out: number[] = []
  const pattern = /(\d{1,3}(?:[  .,]\d{3})+|\d+(?:[.,]\d+)?)\s*(k\b|tys\.?)?/gi
  for (const match of value.matchAll(pattern)) {
    const raw = match[1]
      .replace(/[  ]/g, "")
      .replace(/[.,](?=\d{3}\b)/g, "")
      .replace(",", ".")
    let n = Number(raw)
    if (match[2]) n *= 1000
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

/** The option that best matches a value, or null. */
export function pickOption(
  value: string | null | undefined,
  options: string[] | undefined,
  kind?: FieldKind
): string | null {
  const list = realOptions(options)
  if (!value?.trim() || !list.length) return null
  const wanted = fold(value)
  const names = synonymsOf(value)

  // 1. Exact, or a synonym ("Polska" ↔ "Poland", "Tak" ↔ "Yes").
  for (const option of list) {
    const folded = fold(option)
    if (folded === wanted || names.includes(folded)) return option
  }
  for (const option of list) {
    const group = synonymsOf(option)
    if (group.some((name) => names.includes(name))) return option
  }
  // 2. One contains the other as whole words ("Poland (+48)", "Warszawa, Polska"), so that
  // "Niemcy" does not match the option "Nie".
  const spaced = (text: string) => ` ${text} `
  for (const option of list) {
    const folded = fold(option)
    if (
      folded.length >= 3 &&
      names.some(
        (name) =>
          name.length >= 3 &&
          (spaced(folded).includes(spaced(name)) || spaced(name).includes(spaced(folded)))
      )
    )
      return option
  }
  // 3. Durations: notice period and start date.
  if (kind === "noticePeriod" || kind === "availableFrom") {
    const days = durationDays(value)
    if (days != null) {
      let best: { option: string; diff: number } | null = null
      for (const option of list) {
        const optionDays = durationDays(option)
        if (optionDays == null) continue
        const diff = Math.abs(optionDays - days)
        if (!best || diff < best.diff) best = { option, diff }
      }
      if (best && best.diff <= 15) return best.option
    }
  }
  // 4. Salary: the range that contains the amount.
  if (kind === "salary") {
    const amount = numbersIn(value)[0]
    if (amount != null) {
      for (const option of list) {
        const range = numbersIn(option)
        if (range.length >= 2 && amount >= range[0] && amount <= range[1]) return option
        if (
          range.length === 1 &&
          /\+|above|powyzej|more than|ponad/.test(fold(option)) &&
          amount >= range[0]
        )
          return option
      }
    }
  }
  // 5. Word overlap.
  let best: { option: string; score: number } | null = null
  for (const option of list) {
    const score = overlap(value, option)
    if (!best || score > best.score) best = { option, score }
  }
  return best && best.score >= 0.5 ? best.option : null
}

const YES =
  /^(tak|yes|y|true|oczywiscie|of course|sure|chetnie|willing|open|jestem otwart\w*|i am open|i am willing)\b/
const NO = /^(nie|no|n|false|not|nie jestem|i am not|i'm not)\b/

/** "Tak" / "Yes" / "No" style answer for relocation and work authorization, or null when unsure. */
export function yesNoAnswer(
  kind: FieldKind,
  question: string,
  value: string | null | undefined
): "yes" | "no" | null {
  const text = fold(value)
  if (!text) return null
  const q = fold(question)
  if (kind === "relocation") {
    if (NO.test(text)) return "no"
    if (YES.test(text)) return "yes"
    return null
  }
  if (kind === "workAuthorization") {
    const noSponsor =
      /\b(bez sponsor\w*|no sponsor\w*|nie (wymagam|potrzebuje|bede wymagac)|not (require|need)|do not (require|need)|don t (require|need)|without sponsor\w*|obywatel\w*|citizen\w*|ue|eu|eea|staly pobyt|permanent resident\w*)\b/.test(
        text
      )
    const needsSponsor =
      /\b(wymagam sponsor\w*|potrzebuje wiz\w*|require sponsor\w*|need (a )?(visa|sponsor\w*)|requires? (a )?visa)\b/.test(
        text
      ) && !/\b(nie|not|don t|do not)\s+(wymagam|potrzebuje|require|need)\b/.test(text)
    if (/\b(sponsor\w*|visa|wiz\w*)\b/.test(q)) {
      if (needsSponsor) return "yes"
      if (noSponsor) return "no"
      return null
    }
    if (
      /\b(authori[sz]\w*|eligib\w*|right to work|legally|prawo do pracy|pozwoleni\w*|zezwoleni\w*|uprawnion\w*)\b/.test(
        q
      )
    ) {
      if (/\b(brak|nie mam|not authori[sz]ed|no right)\b/.test(text)) return "no"
      if (noSponsor || /\b(tak|yes|mam|have|authori[sz]ed|posiadam)\b/.test(text)) return "yes"
    }
    return null
  }
  return null
}

function pickYesNo(answer: "yes" | "no", options: string[]): string | null {
  const list = realOptions(options)
  const wanted = answer === "yes" ? /^(tak|yes|y)\b/ : /^(nie|no|n)\b/
  return list.find((option) => wanted.test(fold(option))) ?? null
}

/** "30.11.2026" or "2026-11-30" → "2026-11-30" for a date input; null for free text. */
export function isoDate(value: string | null | undefined): string | null {
  const text = (value ?? "").trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (iso) return text
  const pl = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text)
  if (pl) return `${pl[3]}-${pl[2].padStart(2, "0")}-${pl[1].padStart(2, "0")}`
  return null
}

const APPLICANT_KEY: Partial<Record<FieldKind, keyof ApplicantInfo>> = {
  firstName: "firstName",
  lastName: "lastName",
  email: "email",
  phone: "phone",
  city: "city",
  country: "country",
  linkedin: "linkedinUrl",
  github: "githubUrl",
  website: "websiteUrl",
  salary: "salaryExpectation",
  noticePeriod: "noticePeriod",
  availableFrom: "availableFrom",
  workAuthorization: "workAuthorization",
  relocation: "relocation",
}

/** The raw text a kind maps to in the applicant details, or null. */
export function applicantText(kind: FieldKind, applicant: ApplicantInfo): string | null {
  if (kind === "fullName") {
    const name = [applicant.firstName, applicant.lastName].filter(Boolean).join(" ").trim()
    return name || null
  }
  const key = APPLICANT_KEY[kind]
  return key ? applicant[key]?.trim() || null : null
}

/**
 * The value to put in a standard field, or null when this field needs a question answer
 * (or nothing). Choice fields get an option text; text fields are cut to maxLength.
 */
export function profileValue(
  field: FormField,
  kind: FieldKind,
  applicant: ApplicantInfo
): string | null {
  const text = applicantText(kind, applicant)
  if (!text) return null
  const type = (field.type || "text").toLowerCase()
  const options = realOptions(field.options)
  if (options.length) {
    if (kind === "relocation" || kind === "workAuthorization") {
      const answer = yesNoAnswer(kind, `${field.label} ${field.section ?? ""}`, text)
      if (answer) return pickYesNo(answer, options) ?? pickOption(text, options, kind)
      return pickOption(text, options, kind)
    }
    return pickOption(text, options, kind)
  }
  if (type === "checkbox" || type === "radio") return null
  if (type === "date") return isoDate(text)
  if (type === "number") {
    const n = numbersIn(text)[0]
    return n != null ? String(n) : null
  }
  return field.maxLength && field.maxLength > 0 ? text.slice(0, field.maxLength) : text
}
