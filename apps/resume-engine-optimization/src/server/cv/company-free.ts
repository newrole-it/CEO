import { fold } from "@newrole/matching/text"
import { consentCompanyOf, defaultConsent, type CvLocale } from "@newrole/cv-core/blank"
import type { CvContent } from "@newrole/cv-core/schema"
import { cvPlainText } from "@newrole/cv-core/text"
import type { GeneralCvCheck } from "@newrole/cv-core/views"
import { companyWords, hasPhrase } from "src/server/gmail/allowlist"

/**
 * A CV written for one offer, made fit to be a general CV ("Zapisz jako ogólne", saveToGeneralCv
 * in ./tailor.ts). A consent clause that names the offer's company is replaced here; lines of the
 * text that name it are listed for the person, who rewrites them or keeps them. A company the
 * person's own CV names (one they worked for) is their data, not the offer's, and is not listed.
 */

/** The most lines the check lists; the person fixes those and checks again. */
const MAX_LINES = 8

/** The CV's text line by line, hidden sections too: they go into the general CV as well. */
function textLines(content: CvContent): string[] {
  const sections = content.sections.map((section) => ({ ...section, hidden: false }))
  return cvPlainText({ ...content, sections })
    .split("\n")
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean)
}

export function companyFree(input: {
  content: CvContent
  language: CvLocale
  /** The offer's company (CvDocument.targetCompany) */
  company: string | null
  /** The general CV it goes into, as it is now; null for a new one */
  general: { content: CvContent | null; language: CvLocale } | null
  /** The person's own CV before it was written for the offer */
  own: CvContent | null
}): { content: CvContent; check: GeneralCvCheck } {
  const { content, language, general } = input
  const named = consentCompanyOf(content.consent)
  // the general CV's own clause, hidden one included, unless it names a company or is in another
  // language; else the plain one
  const kept = general?.content?.consent
  const consent = !named
    ? content.consent
    : general?.content && general.language === language && !consentCompanyOf(kept)
      ? (kept ?? null)
      : defaultConsent(language)
  const clean = { ...content, consent }

  const ownText = input.own ? fold(cvPlainText(input.own)) : ""
  const phrases = [
    ...new Set([input.company, named].map((name) => (name ? companyWords(name) : ""))),
  ].filter((phrase) => phrase && !hasPhrase(ownText, phrase))
  const lines = phrases.length
    ? [...textLines(clean), clean.consent?.trim() ?? ""].filter(
        (line) => line && phrases.some((phrase) => hasPhrase(fold(line), phrase))
      )
    : []
  return {
    content: clean,
    check: {
      company: input.company?.trim() || named || "",
      consent: Boolean(named),
      lines: [...new Set(lines)].slice(0, MAX_LINES),
    },
  }
}
