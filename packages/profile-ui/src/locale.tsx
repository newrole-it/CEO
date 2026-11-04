"use client"

import { useMemo } from "react"
import { useLocale } from "@newrole/ui/locale"
import type { Locale } from "@newrole/ui/i18n"
import { profileTranslator, type ProfileT } from "./copy"

/** The profile screens' strings in the language of the app's LocaleProvider (@newrole/ui/locale). */
export function useProfileCopy(): { locale: Locale; t: ProfileT } {
  const locale = useLocale()
  return useMemo(() => ({ locale, t: profileTranslator(locale) }), [locale])
}
