import type { CvLocale } from "./blank"

/**
 * The consent clause written into a CV, in the CV's own language, not the interface's: the
 * general one, and the one that names the company the CV is sent to ({company}). Polish is the
 * source; every other language is typed from it.
 */
export const consentPl = {
  plain:
    "Wyrażam zgodę na przetwarzanie moich danych osobowych zawartych w tym dokumencie w celu realizacji procesu rekrutacji, zgodnie z Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. (RODO).",
  company:
    "Wyrażam zgodę na przetwarzanie przez {company} moich danych osobowych zawartych w tym dokumencie w celu realizacji procesu rekrutacji, zgodnie z Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. (RODO).",
}

export const consentEn: typeof consentPl = {
  plain:
    "I consent to the processing of my personal data contained in this document for the purposes of the recruitment process, in accordance with Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 (GDPR).",
  company:
    "I consent to {company} processing my personal data contained in this document for the purposes of the recruitment process, in accordance with Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 (GDPR).",
}

export const CONSENT_COPY: Record<CvLocale, typeof consentPl> = { pl: consentPl, en: consentEn }
