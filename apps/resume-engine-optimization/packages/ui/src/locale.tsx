"use client"

import { createContext, useContext, useMemo } from "react"
import { uiEn, uiPl, type UiCopyKey } from "./copy"
import { makeTranslator, type Locale, type Translate } from "./i18n"

/**
 * The interface language for every component below the provider. An app renders one
 * LocaleProvider at its root; the components of the packages read the same context.
 */
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

export type UiT = Translate<UiCopyKey>

/** The strings of this package's own components. */
export function useUiCopy(): { locale: Locale; t: UiT } {
  const locale = useLocale()
  return useMemo(() => ({ locale, t: makeTranslator(locale === "en" ? uiEn : uiPl) }), [locale])
}
