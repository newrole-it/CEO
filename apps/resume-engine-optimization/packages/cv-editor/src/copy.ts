import { uiEn, uiPl } from "@newrole/ui/copy"
import { makeTranslator, type Locale, type Translate } from "@newrole/ui/i18n"
import { cvEn, cvPl } from "./copy-cv"
import { tailorEn, tailorPl } from "./copy-tailor"

/**
 * Every string the editor shows: the CV ("cv."), tailoring and versions ("tl.") and the shared
 * components'. An app with its own dictionary spreads cvPl/cvEn and tailorPl/tailorEn into it.
 */

export { cvEn, cvPl, tailorEn, tailorPl }

const pl = { ...uiPl, ...cvPl, ...tailorPl }

export type CvCopyKey = keyof typeof pl

const en: Record<CvCopyKey, string> = { ...uiEn, ...cvEn, ...tailorEn }

export type CvT = Translate<CvCopyKey>

export function cvTranslator(locale: Locale): CvT {
  return makeTranslator(locale === "en" ? en : pl)
}
