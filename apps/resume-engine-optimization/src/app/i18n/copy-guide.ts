/**
 * Strings for "First steps" on /offers and /cv (src/server/onboarding/first-steps.ts) and for the
 * guide to every feature at /features. Keys "fs." and "ft.". Polish uses the informal, capitalised
 * "Ty". Every key in guidePl must exist in guideEn (the type enforces it).
 */
export const guidePl = {
  "nav.features": "Funkcje",
  "nav.featuresLong": "Wszystkie funkcje",
  "footer.features": "Funkcje",
  "land.features": "Zobacz wszystkie funkcje aplikacji i rozszerzenia →",

  // First steps: the card on /offers and /cv
  "fs.title": "Pierwsze kroki",
  "fs.sub": "Tak pracujesz w newrole.it: oferta z linku, CV pod nią, aplikacja w trackerze.",
  "fs.progress": "{done} z {total}",
  "fs.progressLabel": "Postęp pierwszych kroków",
  "fs.done": "Zrobione",
  "fs.hide": "Ukryj",
  "fs.hideHint": "Wrócisz do tych kroków z menu konta: Pierwsze kroki.",
  "fs.features": "Wszystkie funkcje i opcje",
  "fs.profile.title": "Profil z CV albo LinkedIn",
  "fs.profile.body":
    "Z profilu powstaje CV, a model czyta go, gdy pisze CV i list pod ofertę. Wgranie PDF zajmuje około minuty.",
  "fs.profile.cta": "Utwórz profil",
  "fs.offer.title": "Dodaj pierwszą ofertę",
  "fs.offer.body":
    "Wklej link do ogłoszenia ze strony firmy albo jej systemu rekrutacji. newrole.it pobierze całe ogłoszenie i zapisze je przy ofercie. Z LinkedIn zapisze tylko link, a treść ogłoszenia wkleisz.",
  "fs.offer.cta": "Wklej link do oferty",
  "fs.tailor.title": "Dopasuj CV do tej oferty",
  "fs.tailor.body":
    "Model weźmie Twoje CV albo profil i treść ogłoszenia. Pracodawców, daty, dane kontaktowe i liczby zostawia takie, jak w Twoim CV, a w zakładce „Dopasowanie” pokazuje, co zmienił i co sprawdzić.",
  "fs.tailor.cta": "Dostosuj CV",
  "fs.apply.title": "Wyślij i śledź aplikację",
  "fs.apply.body":
    "Pobierz PDF w edytorze i wyślij aplikację. Potem na stronie oferty kliknij „Dodaj do aplikacji”: tracker poprowadzi etapy. Z rozszerzeniem Chrome aplikacja zapisze się sama po wysłaniu formularza.",
  "fs.apply.cta": "Przejdź do oferty",
  "fs.menu": "Pierwsze kroki",
}

export const guideEn: Record<keyof typeof guidePl, string> = {
  "nav.features": "Features",
  "nav.featuresLong": "All features",
  "footer.features": "Features",
  "land.features": "See every feature of the app and the extension →",

  "fs.title": "First steps",
  "fs.sub":
    "This is how newrole.it works: an offer from its link, a CV for it, an application in the tracker.",
  "fs.progress": "{done} of {total}",
  "fs.progressLabel": "First steps progress",
  "fs.done": "Done",
  "fs.hide": "Hide",
  "fs.hideHint": "Come back to these steps from the account menu: First steps.",
  "fs.features": "Every feature and option",
  "fs.profile.title": "A profile from your CV or LinkedIn",
  "fs.profile.body":
    "Your CV is made from your profile, and the model reads it when it writes a CV and letter for an offer. Uploading a PDF takes about a minute.",
  "fs.profile.cta": "Create a profile",
  "fs.offer.title": "Add your first offer",
  "fs.offer.body":
    "Paste a link to a posting on the company's site or its recruitment system. newrole.it reads the whole posting and keeps it with the offer. From LinkedIn it keeps only the link, and you paste the posting's text.",
  "fs.offer.cta": "Paste an offer's link",
  "fs.tailor.title": "Tailor your CV to that offer",
  "fs.tailor.body":
    "The model takes your CV or profile and the posting. It keeps employers, dates, contact details and numbers as your CV has them, and the “Tailoring” tab shows what it changed and what to check.",
  "fs.tailor.cta": "Tailor CV",
  "fs.apply.title": "Apply and track it",
  "fs.apply.body":
    "Download the PDF in the editor and send your application. Then click “Add to applications” on the offer's page: the tracker follows its stages. With the Chrome extension, the application is recorded by itself when you submit the form.",
  "fs.apply.cta": "Go to the offer",
  "fs.menu": "First steps",
}
