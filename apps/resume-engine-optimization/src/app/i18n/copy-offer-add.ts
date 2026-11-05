/**
 * Strings for "Dodaj ofertę" on /offers (src/app/offers/AddOffer.tsx): an offer added from its link,
 * read whole (src/server/offers/service.ts). Keys start with "oa.".
 */
export const offerAddPl = {
  "oa.cta": "Dodaj ofertę",
  "oa.title": "Dodaj ofertę z linku",
  "oa.lead":
    "Wklej link do ogłoszenia. Pobierzemy całą treść, a potem dopasujesz do niej CV i list motywacyjny.",
  "oa.url": "Link do oferty",
  "oa.urlHint":
    "Najlepiej ze strony firmy albo jej systemu rekrutacji. Linków z LinkedIn nie czytamy.",
  "oa.check": "Odczytaj ofertę",
  "oa.reading": "Czytam ofertę. To może potrwać kilkanaście sekund…",
  "oa.read": "Odczytaliśmy ofertę ze strony. Sprawdź dane i treść, potem ją dodaj.",
  "oa.partial": "Odczytaliśmy tylko część danych. Sprawdź je i uzupełnij resztę.",
  "oa.linkOnly":
    "Przy dodawaniu tej strony nie czytamy, więc wpisz firmę i stanowisko. Treść oferty wklej tutaj albo pobierzemy ją ze strony przy dostosowaniu CV, o ile strona na to pozwala.",
  "oa.unreadable":
    "Nie udało się odczytać tej strony. Wpisz firmę i stanowisko i wklej treść ogłoszenia.",
  "oa.company": "Firma",
  "oa.role": "Stanowisko",
  "oa.location": "Lokalizacja (opcjonalnie)",
  "oa.locationPh": "np. Warszawa",
  "oa.workplace": "Tryb pracy",
  "oa.workplace.any": "Nie podano",
  "oa.workplace.remote": "Zdalnie",
  "oa.workplace.hybrid": "Hybrydowo",
  "oa.workplace.onsite": "Stacjonarnie",
  "oa.salary": "Wynagrodzenie (opcjonalnie)",
  "oa.salaryPh": "np. 25 000–30 000 PLN",
  "oa.back": "Wróć",
  "oa.submit": "Dodaj ofertę",
  "oa.required": "Podaj firmę i stanowisko.",
  "oa.known": "Ta oferta już tu jest: {company} · {title}",
  "oa.added": "Dodano: {company} · {title}",
  "oa.next":
    "Możesz teraz dostosować pod nią CV i list motywacyjny albo otworzyć ofertę, żeby ją zapisać lub oznaczyć, że aplikujesz.",
  "oa.open": "Otwórz ofertę",
  "oa.tailor": "Dostosuj CV i list",
  "oa.empty": "Nie ma tu tej oferty? Dodaj ją z linku",
  "oa.err.badUrl": "To nie wygląda na link do oferty.",
  "oa.err.refused":
    "Tej strony nie czytamy ani nie zapisujemy, bo to nie strona firmy (np. LinkedIn, serwisy społecznościowe, Indeed, Glassdoor). Znajdź tę ofertę na stronie firmy i wklej tamten link.",
  "oa.err.read": "Nie udało się sprawdzić linku. Spróbuj jeszcze raz za chwilę.",
  "oa.err.save": "Nie udało się dodać oferty. Spróbuj jeszcze raz.",
  "src.added": "Dodana przez Ciebie",
  "src.added.tip": "Oferta dodana przez Ciebie z linku (Dodaj ofertę).",
}

export const offerAddEn: Record<keyof typeof offerAddPl, string> = {
  "oa.cta": "Add offer",
  "oa.title": "Add an offer by its link",
  "oa.lead":
    "Paste the link to a job posting. We read the whole text, then you tailor your CV and cover letter to it.",
  "oa.url": "Offer link",
  "oa.urlHint": "Best from the company's site or its ATS. LinkedIn links are not read.",
  "oa.check": "Read the offer",
  "oa.reading": "Reading the offer. This can take a dozen seconds or so…",
  "oa.read": "We read the offer from the page. Check the details and the text, then add it.",
  "oa.partial": "We could read only part of it. Check it and fill in the rest.",
  "oa.linkOnly":
    "This site is not read when adding an offer, so enter the company and role. Paste the offer's text here, or it is read from its page when you tailor your CV, if the site allows it.",
  "oa.unreadable":
    "The page could not be read. Enter the company and role and paste the posting's text.",
  "oa.company": "Company",
  "oa.role": "Role",
  "oa.location": "Location (optional)",
  "oa.locationPh": "e.g. Warsaw",
  "oa.workplace": "Work mode",
  "oa.workplace.any": "Not stated",
  "oa.workplace.remote": "Remote",
  "oa.workplace.hybrid": "Hybrid",
  "oa.workplace.onsite": "On site",
  "oa.salary": "Salary (optional)",
  "oa.salaryPh": "e.g. 25,000–30,000 PLN",
  "oa.back": "Back",
  "oa.submit": "Add offer",
  "oa.required": "Enter the company and the role.",
  "oa.known": "This offer is already here: {company} · {title}",
  "oa.added": "Added: {company} · {title}",
  "oa.next":
    "You can tailor your CV and cover letter to it now, or open the offer to save it or mark it as applied.",
  "oa.open": "Open the offer",
  "oa.tailor": "Tailor CV and letter",
  "oa.empty": "Offer not here? Add it from its link",
  "oa.err.badUrl": "That doesn't look like a link to an offer.",
  "oa.err.refused":
    "This site is never read or stored, because it is not a company's own page (e.g. LinkedIn, social sites, Indeed, Glassdoor). Find the offer on the company's own site and paste that link.",
  "oa.err.read": "The link could not be checked. Try again in a moment.",
  "oa.err.save": "The offer could not be added. Try again.",
  "src.added": "Added by you",
  "src.added.tip": "An offer you added from its link (Add offer).",
}
