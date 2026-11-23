/**
 * Strings for My CV as a table (src/app/cv/CvList.tsx): the CVs with their dates and the
 * applications sent with each, the letters below, the preview. Keys "cvl.".
 */
export const cvListPl = {
  "cvl.cvs": "CV",
  "cvl.filter": "Które CV pokazać",
  "cvl.filter.all": "Wszystkie ({n})",
  "cvl.filter.general": "Ogólne ({n})",
  "cvl.filter.offers": "Pod oferty ({n})",
  "cvl.search": "Szukaj po nazwie, firmie lub stanowisku",
  "cvl.noMatch": "Żadne CV nie pasuje do „{q}”.",
  "cvl.noneGeneral": "Nie masz ogólnego CV. Utwórz je przyciskiem „Nowe CV”.",

  "cvl.col.cv": "CV",
  "cvl.col.created": "Utworzone",
  "cvl.col.updated": "Zmienione",
  "cvl.col.apps": "Aplikacje i wynik",
  "cvl.col.actions": "Działania",
  "cvl.col.letter": "List",
  "cvl.col.for": "Do czego",

  "cvl.type.general": "Ogólne",
  "cvl.type.offer": "Pod ofertę",
  "cvl.offer": "{title}, {company}",
  "cvl.fromCv": "Zrobione z „{title}”",

  "cvl.apps.none": "Nie wysłano z nim aplikacji",
  "cvl.apps.count.one": "{n} aplikacja",
  "cvl.apps.count.few": "{n} aplikacje",
  "cvl.apps.count.many": "{n} aplikacji",
  "cvl.replied": "Odpowiedzi: {n} z {total}",
  "cvl.out.item": "{label}: {n}",
  "cvl.out.offer": "Oferty",
  "cvl.out.progress": "W rekrutacji",
  "cvl.out.waiting": "Czekają",
  "cvl.out.rejected": "Odmowy",
  "cvl.out.ghosted": "Bez odpowiedzi",
  "cvl.out.withdrawn": "Wycofane",

  "cvl.detail.sent": "Aplikacje z tego CV",
  "cvl.detail.appliedAt": "wysłano {date}",
  "cvl.detail.none":
    "Nie wysłano jeszcze żadnej aplikacji z tym CV ani z CV pod oferty zrobionych z niego.",
  "cvl.detail.derived.one":
    "Liczą się tu też aplikacje wysłane z {n} CV pod ofertę zrobionego z tego CV.",
  "cvl.detail.derived.few":
    "Liczą się tu też aplikacje wysłane z {n} CV pod oferty zrobionych z tego CV.",
  "cvl.detail.derived.many":
    "Liczą się tu też aplikacje wysłane z {n} CV pod oferty zrobionych z tego CV.",
  "cvl.detail.via": "CV pod tę ofertę",
  "cvl.detail.showDerived": "Pokaż CV pod oferty",
  "cvl.detail.letter": "List motywacyjny",

  "cvl.preview": "Podgląd",
  "cvl.previewOf": "Podgląd: {title}",
  "cvl.preview.frame": "Podgląd CV „{title}”",
  "cvl.preview.letterFrame": "Podgląd listu „{title}”",
  "cvl.editOf": "Edytuj „{title}”",
  "cvl.deleteOf": "Usuń „{title}”",

  "cvl.delete.apps.one":
    "Wysłano z nim {n} aplikację. Zostanie w Aplikacjach, ale bez powiązania z tym CV.",
  "cvl.delete.apps.few":
    "Wysłano z nim {n} aplikacje. Zostaną w Aplikacjach, ale bez powiązania z tym CV.",
  "cvl.delete.apps.many":
    "Wysłano z nim {n} aplikacji. Zostaną w Aplikacjach, ale bez powiązania z tym CV.",
  "cvl.delete.derived": "CV pod oferty zrobione z niego zostaną.",

  "cvl.letters": "Listy motywacyjne",
  "cvl.letters.sub":
    "Listy do ogólnych CV i listy pod oferty. Nowy list do ogólnego CV dodasz w szczegółach jego wiersza.",
  "cvl.letters.forCv": "Do CV „{title}”",
  "cvl.letters.loose": "Jego CV zostało usunięte",
} as const

export const cvListEn: Record<keyof typeof cvListPl, string> = {
  "cvl.cvs": "CVs",
  "cvl.filter": "Which CVs to show",
  "cvl.filter.all": "All ({n})",
  "cvl.filter.general": "General ({n})",
  "cvl.filter.offers": "For offers ({n})",
  "cvl.search": "Search by name, company or role",
  "cvl.noMatch": "No CV matches “{q}”.",
  "cvl.noneGeneral": "You have no general CV. Create one with “New CV”.",

  "cvl.col.cv": "CV",
  "cvl.col.created": "Created",
  "cvl.col.updated": "Changed",
  "cvl.col.apps": "Applications and results",
  "cvl.col.actions": "Actions",
  "cvl.col.letter": "Letter",
  "cvl.col.for": "For",

  "cvl.type.general": "General",
  "cvl.type.offer": "For an offer",
  "cvl.offer": "{title}, {company}",
  "cvl.fromCv": "Made from “{title}”",

  "cvl.apps.none": "No applications sent with it",
  "cvl.apps.count.one": "{n} application",
  "cvl.apps.count.few": "{n} applications",
  "cvl.apps.count.many": "{n} applications",
  "cvl.replied": "Replies: {n} of {total}",
  "cvl.out.item": "{label}: {n}",
  "cvl.out.offer": "Offers",
  "cvl.out.progress": "In process",
  "cvl.out.waiting": "Waiting",
  "cvl.out.rejected": "Rejections",
  "cvl.out.ghosted": "No response",
  "cvl.out.withdrawn": "Withdrawn",

  "cvl.detail.sent": "Applications from this CV",
  "cvl.detail.appliedAt": "sent {date}",
  "cvl.detail.none":
    "No application has been sent with this CV or with the CVs for offers made from it yet.",
  "cvl.detail.derived.one":
    "This includes the applications sent with the {n} CV for an offer made from this one.",
  "cvl.detail.derived.few":
    "This includes the applications sent with the {n} CVs for offers made from this one.",
  "cvl.detail.derived.many":
    "This includes the applications sent with the {n} CVs for offers made from this one.",
  "cvl.detail.via": "CV for this offer",
  "cvl.detail.showDerived": "Show CVs for offers",
  "cvl.detail.letter": "Cover letter",

  "cvl.preview": "Preview",
  "cvl.previewOf": "Preview: {title}",
  "cvl.preview.frame": "Preview of the CV “{title}”",
  "cvl.preview.letterFrame": "Preview of the letter “{title}”",
  "cvl.editOf": "Edit “{title}”",
  "cvl.deleteOf": "Delete “{title}”",

  "cvl.delete.apps.one":
    "{n} application was sent with it. It stays in Applications, no longer linked to this CV.",
  "cvl.delete.apps.few":
    "{n} applications were sent with it. They stay in Applications, no longer linked to this CV.",
  "cvl.delete.apps.many":
    "{n} applications were sent with it. They stay in Applications, no longer linked to this CV.",
  "cvl.delete.derived": "The CVs for offers made from it stay.",

  "cvl.letters": "Cover letters",
  "cvl.letters.sub":
    "Letters for your general CVs and letters for offers. Add a letter to a general CV in the details of its row.",
  "cvl.letters.forCv": "For the CV “{title}”",
  "cvl.letters.loose": "Its CV was deleted",
}
