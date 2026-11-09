import { uiEn, uiPl } from "@newrole/ui/copy"
import { makeTranslator, type Locale, type Translate } from "@newrole/ui/i18n"
import { cvEn, cvPl } from "./copy-cv"
import { lookEn, lookPl } from "./copy-look"
import { tailorEn, tailorPl } from "./copy-tailor"

/**
 * Every string the editor shows: the CV ("cv."), tailoring and versions ("tl."), the look panel
 * ("look.") and the shared components'. An app with its own dictionary spreads cvPl/cvEn,
 * tailorPl/tailorEn and lookPl/lookEn into it.
 */

export { cvEn, cvPl, lookEn, lookPl, tailorEn, tailorPl }

const pl = { ...uiPl, ...cvPl, ...tailorPl, ...lookPl }

export type CvCopyKey = keyof typeof pl

const en: Record<CvCopyKey, string> = { ...uiEn, ...cvEn, ...tailorEn, ...lookEn }

export type CvT = Translate<CvCopyKey>

export function cvTranslator(locale: Locale): CvT {
  return makeTranslator(locale === "en" ? en : pl)
}
