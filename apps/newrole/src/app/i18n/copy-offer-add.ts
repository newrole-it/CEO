/**
 * Strings for "Dodaj ofertę" on /jobs (src/app/jobs/components/AddOffer.tsx): an offer the index
 * does not have, added from its link (src/server/jobs/add-offer.ts). Keys start with "oa.".
 */
export const offerAddPl = {
  "oa.cta": "Dodaj ofertę",
  "oa.title": "Dodaj ofertę spoza newrole.it",
  "oa.lead":
    "Wklej link do oferty, której tu nie ma. Odczytamy ją ze strony i dodamy. Dalej działa jak każda inna: dostosujesz pod nią CV i list motywacyjny, zapiszesz ją albo oznaczysz, że aplikujesz.",
  "oa.url": "Link do oferty",
  "oa.urlHint":
    "Najlepiej ze strony firmy albo jej systemu rekrutacji. Linków z LinkedIn nie czytamy.",
  "oa.check": "Odczytaj ofertę",
  "oa.reading": "Czytam ofertę. To może potrwać kilkanaście sekund…",
  "oa.read": "Oferta odczytana ze strony. Sprawdź dane i dodaj ją.",
  "oa.partial": "Odczytaliśmy tylko część danych. Sprawdź je i uzupełnij resztę.",
  "oa.linkOnly":
    "Tej strony nie czytamy automatycznie, więc wpisz firmę i stanowisko. Treść oferty wkleisz przy dostosowaniu CV.",
  "oa.unreadable":
    "Nie udało się odczytać tej strony. Wpisz firmę i stanowisko, a treść oferty wkleisz przy dostosowaniu CV.",
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
    "Ofert z LinkedIn i serwisów społecznościowych nie czytamy ani nie zapisujemy. Znajdź tę ofertę na stronie firmy i wklej tamten link.",
  "oa.err.read": "Nie udało się sprawdzić linku. Spróbuj jeszcze raz za chwilę.",
  "oa.err.save": "Nie udało się dodać oferty. Spróbuj jeszcze raz.",
  "src.added": "Dodana przez Ciebie",
  "src.added.tip": "Oferta dodana przez Ciebie z linku (Dodaj ofertę).",
}

export const offerAddEn: Record<keyof typeof offerAddPl, string> = {
  "oa.cta": "Add offer",
  "oa.title": "Add an offer from elsewhere",
  "oa.lead":
    "Paste the link to an offer that isn't here. We read it from the page and add it. From then on it works like any other: tailor your CV and cover letter to it, save it, or mark it as applied.",
  "oa.url": "Offer link",
  "oa.urlHint": "Best from the company's site or its ATS. LinkedIn links are not read.",
  "oa.check": "Read the offer",
  "oa.reading": "Reading the offer. This can take a dozen seconds or so…",
  "oa.read": "Offer read from the page. Check the details and add it.",
  "oa.partial": "We could read only part of it. Check it and fill in the rest.",
  "oa.linkOnly":
    "This site is not read automatically, so enter the company and role. You can paste the offer's text when you tailor your CV.",
  "oa.unreadable":
    "The page could not be read. Enter the company and role, and paste the offer's text when you tailor your CV.",
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
    "Offers on LinkedIn and social sites are never read or stored. Find the offer on the company's own site and paste that link.",
  "oa.err.read": "The link could not be checked. Try again in a moment.",
  "oa.err.save": "The offer could not be added. Try again.",
  "src.added": "Added by you",
  "src.added.tip": "An offer you added from its link (Add offer).",
}
