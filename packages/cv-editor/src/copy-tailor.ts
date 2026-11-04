/**
 * Strings for tailoring a CV to an offer, the cover letter and version history. Keys start with
 * "tl.". Polish uses the informal, capitalised "Ty". Every key in tailorPl must exist in tailorEn.
 */
export const tailorPl = {
  "tl.act": "Dostosuj CV",
  "tl.act.open": "Twoje CV pod tę ofertę",

  // the start page
  "tl.start.title": "Dostosuj CV do tej oferty",
  "tl.start.back": "Wróć do oferty",
  "tl.start.lead":
    "Model przestawi akcenty i sformułowania pod tę ofertę. Firmy, stanowiska, daty i dane kontaktowe zostają bez zmian, a nowych faktów nie dopisze. Wynik od razu poprawisz w edytorze.",
  "tl.start.base": "Na podstawie CV",
  "tl.start.baseProfile": "Nowe CV z Twojego profilu",
  "tl.start.language": "Język dokumentów",
  "tl.start.languageHint": "Ustawiony na język oferty.",
  "tl.start.letter": "Napisz też list motywacyjny",
  "tl.start.letterHint": "Oparty na dostosowanym CV, w tym samym układzie i z historią wersji.",
  "tl.start.note": "Wskazówki dla modelu (opcjonalnie)",
  "tl.start.notePh": "Np. podkreśl doświadczenie z płatnościami, pomiń projekty poboczne.",
  "tl.start.noteOffer": "Tu możesz też wkleić treść oferty.",
  "tl.start.go": "Dostosuj CV",
  "tl.start.withheld":
    "Strona tej oferty zastrzega, że jej treści nie wolno przetwarzać przez AI, więc model zobaczy tylko firmę i stanowisko. Żeby dopasowanie było dokładne, wklej poniżej najważniejsze wymagania.",
  "tl.start.noText":
    "Nie mamy treści tej oferty, więc model zobaczy tylko firmę i stanowisko. Żeby dopasowanie było dokładne, wklej poniżej najważniejsze wymagania.",
  "tl.start.reading": "Czytam treść oferty ze strony firmy…",
  "tl.start.full":
    "Mamy pełną treść tej oferty (znaków: {n}). Model przeczyta ją przed dopasowaniem.",
  "tl.start.excerpt":
    "Nie udało się pobrać pełnej treści tej oferty, więc model zobaczy tylko jej fragment (znaków: {n}). Żeby dopasowanie było dokładne, wklej poniżej najważniejsze wymagania.",
  "tl.start.noCv": "Najpierw dodaj CV",
  "tl.start.noCvBody":
    "Dopasowanie zaczyna się od Twojego CV. Wgraj PDF albo utwórz CV, a potem wróć do tej oferty.",
  "tl.start.noCvCta": "Przejdź do Moich CV",
  "tl.progress.cv": "Dopasowuję CV do oferty…",
  "tl.progress.letter": "Piszę list motywacyjny…",
  "tl.progress.hint": "To zwykle trwa do minuty. Nie zamykaj tej strony.",

  "tl.err.noModel":
    "Model AI nie jest skonfigurowany, więc nie da się dopasować CV. Ustawisz go w konfiguracji aplikacji.",
  "tl.err.noBase": "Nie ma CV ani profilu, od których można zacząć. Dodaj CV i spróbuj ponownie.",
  "tl.err.noJob": "Tej oferty nie ma już w indeksie.",
  "tl.err.failed": "Model nie zwrócił poprawnego wyniku. Nic nie zmieniono, spróbuj ponownie.",
  "tl.err.letter": "CV jest gotowe, ale listu nie udało się napisać. Dodasz go w edytorze.",

  // the bar above a tailored document
  "tl.bar.label": "Dokumenty pod tę ofertę",
  "tl.bar.cv": "CV",
  "tl.bar.letter": "List motywacyjny",
  "tl.bar.addLetter": "Dodaj list motywacyjny",
  "tl.bar.addingLetter": "Piszę list…",
  "tl.bar.for": "Pod ofertę:",

  // the panel
  "tl.panel.versions": "Wersje",
  "tl.panel.review": "Dopasowanie",
  "tl.panel.close": "Zamknij panel",
  "tl.panel.label": "Wersje i dopasowanie",

  "tl.v.button": "Wersje",
  "tl.v.saveLabel": "Nazwa wersji (opcjonalnie)",
  "tl.v.savePh": "Np. przed skróceniem do 1 strony",
  "tl.v.save": "Zapisz wersję",
  "tl.v.saved": "Zapisano wersję {n}.",
  "tl.v.named": "Nazwano wersję {n}: treść się nie zmieniła.",
  "tl.v.unchanged": "Bez zmian od wersji {n}.",
  "tl.v.empty":
    "Historia zacznie się przy pierwszej zmianie. Wersje zapisują się też same, co najwyżej raz na 10 minut.",
  "tl.v.number": "Wersja {n}",
  "tl.v.current": "Teraz",
  "tl.v.origin.auto": "Zapis automatyczny",
  "tl.v.origin.manual": "Zapisana przez Ciebie",
  "tl.v.origin.base": "Twoje CV przed dopasowaniem",
  "tl.v.origin.generated": "Wygenerowana przez model",
  "tl.v.origin.restored": "Przywrócona wersja {n}",
  "tl.v.compare": "Porównaj",
  "tl.v.preview": "Podgląd",
  "tl.v.restore": "Przywróć",
  "tl.v.restored": "Przywrócono wersję {n}. Poprzedni stan został w historii.",
  "tl.v.err": "Nie udało się. Spróbuj ponownie.",
  "tl.v.back": "Wszystkie wersje",
  "tl.v.compareTitle": "Wersja {n} a obecny tekst",
  "tl.diff.gap": "bez zmian: {n}",
  "tl.diff.none": "Treść jest taka sama.",
  "tl.diff.removed": "Usunięto:",
  "tl.diff.added": "Dodano:",

  // the review tab
  "tl.r.check": "Sprawdź przed wysłaniem",
  "tl.r.checkBody":
    "Tych nazw i liczb nie ma w Twoim CV ani profilu. Upewnij się, że są prawdziwe, albo je usuń:",
  "tl.r.reverted":
    "W miejscach, w których model dopisał liczby spoza Twoich danych, został Twój tekst (zmiany odrzucone: {n}).",
  "tl.r.noJobText":
    "Model nie znał treści oferty, tylko firmę i stanowisko. Dopasowanie jest ogólne. Wklej wymagania poniżej i wygeneruj ponownie.",
  "tl.r.excerpt":
    "Model znał tylko fragment oferty (znaków: {n}), bo pełnej treści nie udało się pobrać. Wklej wymagania poniżej i wygeneruj ponownie.",
  "tl.r.full": "Model przeczytał pełną treść oferty (znaków: {n}).",
  "tl.r.changes": "Co zmienił model",
  "tl.r.gaps": "Tego oferta wymaga, a w Twoich danych nie ma",
  "tl.r.gapsHint": "Model tego nie dopisał. Jeśli to masz, dodaj sam.",
  "tl.r.noNotes": "Model nie zostawił uwag.",
  "tl.r.again": "Wygeneruj ponownie",
  "tl.r.againLetter": "Napisz list od nowa",
  "tl.r.againHint": "Obecny tekst zostanie w historii wersji.",
  "tl.r.noteLabel": "Wskazówki dla modelu (opcjonalnie)",
  "tl.r.done": "Gotowe. Poprzedni tekst jest w historii wersji.",
  "tl.r.offerGone": "Tej oferty nie ma już w indeksie, więc nie da się wygenerować ponownie.",

  // the sheet
  "tl.ph.date": "Miejscowość, data",
  "tl.ph.recipient": "Adresat",
  "tl.ph.subject": "Dotyczy",
  "tl.ph.greeting": "Powitanie",
  "tl.ph.paragraph": "Akapit",
  "tl.ph.closing": "Zakończenie",
  "tl.ph.signature": "Podpis",

  // Moje CV
  "tl.list.title": "Pod konkretne oferty",
  "tl.list.letter": "List motywacyjny",
}

export const tailorEn: Record<keyof typeof tailorPl, string> = {
  "tl.act": "Tailor CV",
  "tl.act.open": "Your CV for this offer",

  "tl.start.title": "Tailor your CV to this offer",
  "tl.start.back": "Back to the offer",
  "tl.start.lead":
    "The model shifts the emphasis and wording towards this offer. Companies, roles, dates and contact details stay as they are, and it adds no new facts. You can fix the result right away in the editor.",
  "tl.start.base": "Start from",
  "tl.start.baseProfile": "A new CV from your profile",
  "tl.start.language": "Language of the documents",
  "tl.start.languageHint": "Set to the language of the offer.",
  "tl.start.letter": "Also write a cover letter",
  "tl.start.letterHint": "Based on the tailored CV, in the same layout and with version history.",
  "tl.start.note": "Notes for the model (optional)",
  "tl.start.notePh": "E.g. stress the payments experience, leave out side projects.",
  "tl.start.noteOffer": "You can also paste the text of the offer here.",
  "tl.start.go": "Tailor CV",
  "tl.start.withheld":
    "This offer's site says its content must not be processed by AI, so the model sees only the company and role. For a precise match, paste the main requirements below.",
  "tl.start.noText":
    "We don't have the text of this offer, so the model sees only the company and role. For a precise match, paste the main requirements below.",
  "tl.start.reading": "Reading the offer from the company's site…",
  "tl.start.full":
    "We have the full text of this offer ({n} characters). The model reads it before tailoring.",
  "tl.start.excerpt":
    "The full text of this offer couldn't be fetched, so the model sees only an excerpt ({n} characters). For a precise match, paste the main requirements below.",
  "tl.start.noCv": "Add a CV first",
  "tl.start.noCvBody":
    "Tailoring starts from your CV. Upload a PDF or create a CV, then come back to this offer.",
  "tl.start.noCvCta": "Go to My CV",
  "tl.progress.cv": "Tailoring your CV to the offer…",
  "tl.progress.letter": "Writing the cover letter…",
  "tl.progress.hint": "This usually takes up to a minute. Keep this page open.",

  "tl.err.noModel":
    "No AI model is configured, so the CV can't be tailored. Set one up in the app's configuration.",
  "tl.err.noBase": "There's no CV or profile to start from. Add a CV and try again.",
  "tl.err.noJob": "This offer is no longer in the index.",
  "tl.err.failed": "The model didn't return a usable result. Nothing changed, so try again.",
  "tl.err.letter":
    "The CV is ready, but the letter couldn't be written. You can add it in the editor.",

  "tl.bar.label": "Documents for this offer",
  "tl.bar.cv": "CV",
  "tl.bar.letter": "Cover letter",
  "tl.bar.addLetter": "Add a cover letter",
  "tl.bar.addingLetter": "Writing the letter…",
  "tl.bar.for": "For:",

  "tl.panel.versions": "Versions",
  "tl.panel.review": "Tailoring",
  "tl.panel.close": "Close panel",
  "tl.panel.label": "Versions and tailoring",

  "tl.v.button": "Versions",
  "tl.v.saveLabel": "Version name (optional)",
  "tl.v.savePh": "E.g. before cutting to 1 page",
  "tl.v.save": "Save version",
  "tl.v.saved": "Saved version {n}.",
  "tl.v.named": "Named version {n}: the content hasn't changed.",
  "tl.v.unchanged": "No changes since version {n}.",
  "tl.v.empty":
    "History starts with your first change. Versions are also saved automatically, at most once every 10 minutes.",
  "tl.v.number": "Version {n}",
  "tl.v.current": "Now",
  "tl.v.origin.auto": "Automatic save",
  "tl.v.origin.manual": "Saved by you",
  "tl.v.origin.base": "Your CV before tailoring",
  "tl.v.origin.generated": "Written by the model",
  "tl.v.origin.restored": "Restored version {n}",
  "tl.v.compare": "Compare",
  "tl.v.preview": "Preview",
  "tl.v.restore": "Restore",
  "tl.v.restored": "Restored version {n}. The previous state stays in the history.",
  "tl.v.err": "That didn't work. Try again.",
  "tl.v.back": "All versions",
  "tl.v.compareTitle": "Version {n} against the current text",
  "tl.diff.gap": "unchanged: {n}",
  "tl.diff.none": "The content is the same.",
  "tl.diff.removed": "Removed:",
  "tl.diff.added": "Added:",

  "tl.r.check": "Check before sending",
  "tl.r.checkBody":
    "These names and numbers aren't in your CV or profile. Make sure they're true, or remove them:",
  "tl.r.reverted":
    "Where the model added numbers that aren't in your data, your own text stayed (changes rejected: {n}).",
  "tl.r.noJobText":
    "The model didn't have the offer's text, only the company and role, so the match is general. Paste the requirements below and generate again.",
  "tl.r.excerpt":
    "The model only had an excerpt of the offer ({n} characters), because the full text couldn't be fetched. Paste the requirements below and generate again.",
  "tl.r.full": "The model read the full offer ({n} characters).",
  "tl.r.changes": "What the model changed",
  "tl.r.gaps": "The offer asks for this, and your data doesn't show it",
  "tl.r.gapsHint": "The model didn't add it. If you have it, add it yourself.",
  "tl.r.noNotes": "The model left no notes.",
  "tl.r.again": "Generate again",
  "tl.r.againLetter": "Rewrite the letter",
  "tl.r.againHint": "The current text stays in the version history.",
  "tl.r.noteLabel": "Notes for the model (optional)",
  "tl.r.done": "Done. The previous text is in the version history.",
  "tl.r.offerGone": "This offer is no longer in the index, so it can't be generated again.",

  "tl.ph.date": "Place, date",
  "tl.ph.recipient": "Addressee",
  "tl.ph.subject": "Subject",
  "tl.ph.greeting": "Greeting",
  "tl.ph.paragraph": "Paragraph",
  "tl.ph.closing": "Closing",
  "tl.ph.signature": "Signature",

  "tl.list.title": "For specific offers",
  "tl.list.letter": "Cover letter",
}
