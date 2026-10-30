"use client"

import { createContext, useContext, useMemo } from "react"
import { translator, type Locale, type T } from "./copy"

export type { T }

const LocaleContext = createContext<Locale>("pl")

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

export function useCopy(): { locale: Locale; t: T } {
  const locale = useLocale()
  return useMemo(() => ({ locale, t: translator(locale) }), [locale])
}
