"use client"

import { useMemo } from "react"
import { useLocale } from "@newrole/ui/locale"
import type { Locale } from "@newrole/ui/i18n"
import { cvTranslator, type CvT } from "./copy"

/** The editor's strings in the language of the app's LocaleProvider (@newrole/ui/locale). */
export function useCvCopy(): { locale: Locale; t: CvT } {
  const locale = useLocale()
  return useMemo(() => ({ locale, t: cvTranslator(locale) }), [locale])
}
