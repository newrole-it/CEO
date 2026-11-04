"use client"

import { useMemo } from "react"
import { useLocale } from "@newrole/ui/locale"
import { translator, type Locale, type T } from "./copy"

export type { T }
// One context for the app and the packages' components (@newrole/ui, @newrole/cv-editor).
export { LocaleProvider, useLocale } from "@newrole/ui/locale"

export function useCopy(): { locale: Locale; t: T } {
  const locale = useLocale()
  return useMemo(() => ({ locale, t: translator(locale) }), [locale])
}
