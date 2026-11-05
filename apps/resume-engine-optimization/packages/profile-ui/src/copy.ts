import { uiEn, uiPl } from "@newrole/ui/copy"
import { makeTranslator, type Locale, type Translate } from "@newrole/ui/i18n"
import { profileEn, profilePl } from "./copy-profile"

/** The profile screens' strings and the shared components'. An app spreads profilePl/profileEn. */

export { profileEn, profilePl }

const pl = { ...uiPl, ...profilePl }

export type ProfileCopyKey = keyof typeof pl

const en: Record<ProfileCopyKey, string> = { ...uiEn, ...profileEn }

export type ProfileT = Translate<ProfileCopyKey>

export function profileTranslator(locale: Locale): ProfileT {
  return makeTranslator(locale === "en" ? en : pl)
}
