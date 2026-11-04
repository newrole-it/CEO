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
  "app.nav.profile": "Twój profil",
  "app.nav.home": "Dokumenty i oferty",
  "app.profile.title": "Twój profil",
  "app.profile.lead":
    "Model czyta go z Twojego CV albo LinkedIn. Z niego powstaje CV, a przy dopasowaniu do oferty to jedyne fakty o Tobie, których model może użyć poza samym CV.",
  "app.profile.import": "Wczytaj profil",
  "app.profile.importAgain": "Wczytaj ponownie",
  "app.profile.pdf": "Wgraj CV (PDF)",
  "app.profile.pdfHint": "Model rozpisze je na pola. Sam plik nie jest zapisywany.",
  "app.profile.reading": "Czytam i rozpisuję profil…",
  "app.profile.review": "Sprawdź i popraw",
  "app.profile.reviewLead":
    "Pola oznaczone jako „z CV” wypełnił model. Popraw, co trzeba, i zapisz.",
  "app.profile.save": "Zapisz profil",
  "app.profile.saved": "Profil zapisany.",
  "app.profile.fromProfile": "Utwórz CV z profilu",
  "app.profile.importedAt": "Wczytany {when}",
  "app.profile.details": "Dane do formularzy",
  "app.profile.detailsLead": "Imię, kontakt i linki trafiają do nagłówka CV z profilu.",
  "app.profile.audit": "Ocena profilu",
  "app.profile.auditLead":
    "Wynik 0–100 i konkretne zmiany w nagłówku, opisie i doświadczeniu, jak w rozszerzeniu newrole.it na stronie LinkedIn. Bez indeksu ofert ocena nie porównuje profilu z wymaganiami rynku.",
  "app.profile.auditRun": "Oceń profil",
  "app.profile.auditAgain": "Oceń ponownie",
  "app.profile.auditNeedsImport": "Najpierw wczytaj CV albo profil LinkedIn.",
  "app.profile.score": "{score} na 100",
  "app.profile.rewrite": "Propozycja",
  "app.profile.failed": "Nie udało się: {reason}",
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
  "app.nav.profile": "Your profile",
  "app.nav.home": "Documents and offers",
  "app.profile.title": "Your profile",
  "app.profile.lead":
    "A model reads it from your CV or LinkedIn. A CV can be made from it, and when tailoring to an offer it holds the only facts about you a model may use besides the CV itself.",
  "app.profile.import": "Import your profile",
  "app.profile.importAgain": "Import again",
  "app.profile.pdf": "Upload a CV (PDF)",
  "app.profile.pdfHint": "A model lays it out in fields. The file itself is not kept.",
  "app.profile.reading": "Reading your profile…",
  "app.profile.review": "Check and correct",
  "app.profile.reviewLead":
    "Fields marked “from CV” were filled in by the model. Correct what you need and save.",
  "app.profile.save": "Save the profile",
  "app.profile.saved": "Profile saved.",
  "app.profile.fromProfile": "Make a CV from the profile",
  "app.profile.importedAt": "Imported {when}",
  "app.profile.details": "Form details",
  "app.profile.detailsLead":
    "Your name, contact details and links go into the header of a CV made from the profile.",
  "app.profile.audit": "Profile audit",
  "app.profile.auditLead":
    "A 0–100 score and specific changes to the headline, About and experience, as newrole.it's extension shows on LinkedIn. Without an offer index the audit does not compare the profile with what the market asks for.",
  "app.profile.auditRun": "Audit the profile",
  "app.profile.auditAgain": "Audit again",
  "app.profile.auditNeedsImport": "Import a CV or your LinkedIn profile first.",
  "app.profile.score": "{score} out of 100",
  "app.profile.rewrite": "Suggestion",
  "app.profile.failed": "That did not work: {reason}",
}

const pl = { ...uiPl, ...cvPl, ...tailorPl, ...appPl }
export type CopyKey = keyof typeof pl
const en: Record<CopyKey, string> = { ...uiEn, ...cvEn, ...tailorEn, ...appEn }

export type T = Translate<CopyKey>

export function translator(locale: Locale): T {
  return makeTranslator(locale === "en" ? en : pl)
}
