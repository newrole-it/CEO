import { fmt, type Locale } from "src/app/i18n/copy"
import { privacyCopy } from "src/app/i18n/copy-privacy"
import type { Operator } from "src/server/operator"

/** Shown when someone runs this as a service for others (OPERATOR_NAME and OPERATOR_CONTACT set). */
export type ServiceSection = { title: string; lines: string[] }

export function servicePrivacy(locale: Locale, who: Operator): ServiceSection[] {
  const vars = { name: who.name, contact: who.contact }
  return privacyCopy[locale].service.map((section) => ({
    title: section.title,
    lines: section.lines.map((line) => fmt(line, vars)),
  }))
}

export function serviceHost(locale: Locale, who: Operator): string {
  const page = privacyCopy[locale]
  return fmt(page.serviceHost, { processors: who.processors || page.processorsMissing })
}

export function noModelLine(locale: Locale): string {
  return privacyCopy[locale].noModel
}
