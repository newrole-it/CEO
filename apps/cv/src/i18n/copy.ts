import { cvEn, cvPl, tailorEn, tailorPl } from "@newrole/cv-editor/copy"
import { uiEn, uiPl } from "@newrole/ui/copy"
import { makeTranslator, type Locale, type Translate } from "@newrole/ui/i18n"

/**
 * newrole CV's own strings ("app."), on top of the editor's and the shared components'. Polish
 * uses the informal, capitalised "Ty". Every key in appPl must exist in appEn.
 */
const appPl = {
  "app.name": "newrole CV",
  "app.tagline":
    "Wklej link do oferty pracy, a dostaniesz CV i list motywacyjny pod nią. Firmy, stanowiska, daty i dane kontaktowe zostają bez zmian.",
  "app.offer.title": "Oferta",
  "app.offer.link": "Link do oferty",
  "app.offer.linkHint":
    "Strona oferty u pracodawcy albo w jego systemie rekrutacyjnym. LinkedIn i portale z ogłoszeniami nie są czytane.",
  "app.offer.read": "Przeczytaj ofertę",
  "app.offer.reading": "Czytam ofertę…",
  "app.offer.byHand": "Wpiszę firmę i stanowisko sam",
  "app.offer.byLink": "Podam link",
  "app.offer.company": "Firma",
  "app.offer.role": "Stanowisko",
  "app.offer.location": "Lokalizacja (opcjonalnie)",
  "app.offer.add": "Dodaj ofertę",
  "app.offer.change": "Zmień ofertę",
  "app.offer.stored":
    "Na dysku zostaje tylko krótki fragment oferty. Pełną treść czytamy ze strony w chwili pisania.",
  "app.offer.linkOnly":
    "Tej strony nie czytamy: {reason} Wpisz firmę i stanowisko, a najważniejsze wymagania wklej we wskazówkach.",
  "app.offer.failed": "Nie udało się przeczytać oferty: {reason}",
  "app.docs.title": "Twoje dokumenty",
  "app.docs.general": "CV",
  "app.docs.tailored": "CV pod ofertę",
  "app.docs.letter": "List motywacyjny",
  "app.docs.deleteConfirm": "Usunąć „{title}”? Tego nie da się cofnąć.",
  "app.add.title": "Twoje CV",
  "app.add.lead": "Od niego zaczyna się każde dopasowanie.",
  "app.add.reading": "Czytam PDF…",
  "app.add.failed": "Nie udało się: {reason}",
  "app.footer": "Działa na Twoim komputerze. Dokumenty leżą w plikach w {dir}.",
}

export type AppCopyKey = keyof typeof appPl

const appEn: Record<AppCopyKey, string> = {
  "app.name": "newrole CV",
  "app.tagline":
    "Paste a link to a job offer and get a CV and a cover letter written for it. Employers, titles, dates and contact details stay as they are.",
  "app.offer.title": "The offer",
  "app.offer.link": "Link to the offer",
  "app.offer.linkHint":
    "The offer's page on the employer's site or in its applicant tracking system. LinkedIn and job boards are never read.",
  "app.offer.read": "Read the offer",
  "app.offer.reading": "Reading the offer…",
  "app.offer.byHand": "I'll type the company and role",
  "app.offer.byLink": "I'll give a link",
  "app.offer.company": "Company",
  "app.offer.role": "Role",
  "app.offer.location": "Location (optional)",
  "app.offer.add": "Add the offer",
  "app.offer.change": "Change the offer",
  "app.offer.stored":
    "Only a short excerpt of the offer stays on disk. The full text is read from its page when something is written.",
  "app.offer.linkOnly":
    "This page is not read: {reason} Type the company and role, and paste the main requirements into the guidance.",
  "app.offer.failed": "The offer could not be read: {reason}",
  "app.docs.title": "Your documents",
  "app.docs.general": "CV",
  "app.docs.tailored": "CV for an offer",
  "app.docs.letter": "Cover letter",
  "app.docs.deleteConfirm": "Delete “{title}”? This cannot be undone.",
  "app.add.title": "Your CV",
  "app.add.lead": "Every tailoring starts from it.",
  "app.add.reading": "Reading the PDF…",
  "app.add.failed": "That did not work: {reason}",
  "app.footer": "Runs on your machine. Your documents are files in {dir}.",
}

const pl = { ...uiPl, ...cvPl, ...tailorPl, ...appPl }
export type CopyKey = keyof typeof pl
const en: Record<CopyKey, string> = { ...uiEn, ...cvEn, ...tailorEn, ...appEn }

export type T = Translate<CopyKey>

export function translator(locale: Locale): T {
  return makeTranslator(locale === "en" ? en : pl)
}
