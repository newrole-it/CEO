import { fmt, type Locale } from "src/app/i18n/copy"
import { termsCopy } from "src/app/i18n/copy-terms"
import type { Operator } from "src/server/operator"

/** Shown when someone runs this as a service for others (OPERATOR_NAME and OPERATOR_CONTACT set). */
export function serviceTerms(locale: Locale, who: Operator): { title: string; text: string }[] {
  const vars = { name: who.name, contact: who.contact }
  return termsCopy[locale].service.map((item) => ({
    title: item.title,
    text: fmt(item.text, vars),
  }))
}
