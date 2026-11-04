"use client"

import { useMemo } from "react"
import { useLocale } from "@newrole/ui/locale"
import { translator, type T } from "./copy"

export function useCopy(): { locale: "pl" | "en"; t: T } {
  const locale = useLocale()
  return useMemo(() => ({ locale, t: translator(locale) }), [locale])
}
