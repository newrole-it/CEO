"use client"

import { createContext, useContext } from "react"
import { copy, type CopyKey, type Locale } from "./copy"

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

export function useCopy() {
  const locale = useLocale()
  const dict = copy(locale)
  return { locale, t: (key: CopyKey) => dict[key] }
}
