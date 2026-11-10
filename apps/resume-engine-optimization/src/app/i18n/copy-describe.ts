/**
 * Strings for "Opisz swoje doświadczenie" on /cv (src/app/cv/DescribeCv.tsx): a new CV the model
 * writes from the person's own description (src/server/cv/describe.ts). Keys start with "cv.desc.",
 * plus the "Nowe CV" menu item. Polish uses the informal, capitalised "Ty".
 */
export const describePl = {
  "cv.new.describe": "Opisz swoje doświadczenie",
  "cv.desc.title": "Opisz swoje doświadczenie",
  "cv.desc.lead":
    "Nie masz CV? Opisz własnymi słowami swoją pracę, naukę i umiejętności. Model ułoży z tego CV, a potem wybierzesz szablon i kolor.",
  "cv.desc.label": "Twój opis",
  "cv.desc.ph":
    "Np. Od 2021 pracuję w sklepie internetowym Zielony Koszyk jako specjalista obsługi klienta. Odpowiadam za czat i reklamacje, czas odpowiedzi spadł z 2 dni do 4 godzin. Wcześniej 2 lata w kawiarni. Studia: zarządzanie, Uniwersytet Łódzki. Znam Excela i Zendesk. Angielski B2.",
  "cv.desc.tips":
    "Napisz o każdej pracy: firma, stanowisko, lata, co robisz i co się udało, z liczbami, jeśli je znasz. Dodaj szkołę, narzędzia i języki.",
  "cv.desc.facts":
    "Model nie dopisze niczego, czego tu nie ma. Imię i kontakt, których nie podasz, weźmiemy z Twojego konta.",
  "cv.desc.short": "Napisz trochę więcej",
  "cv.desc.go": "Napisz CV",
  "cv.desc.writing": "Piszę CV. To może potrwać do minuty…",
  "cv.desc.textOnly":
    "Model był niedostępny, więc cały opis trafił do jednej sekcji CV. Podziel go na miejscu.",
  "cv.desc.err.limited": "Wykorzystano godzinny limit CV z opisu. Spróbuj za godzinę.",
  "cv.desc.err.short": "Opis jest za krótki. Napisz chociaż jedno, dwa zdania.",
  "cv.desc.err.failed": "Nie udało się napisać CV. Spróbuj jeszcze raz.",
}

export const describeEn: Record<keyof typeof describePl, string> = {
  "cv.new.describe": "Describe your experience",
  "cv.desc.title": "Describe your experience",
  "cv.desc.lead":
    "No CV yet? Describe your work, studies and skills in your own words. The model turns it into a CV, then you pick a template and a colour.",
  "cv.desc.label": "Your description",
  "cv.desc.ph":
    "E.g. Since 2021 I have worked at the online shop Green Basket as a customer service specialist. I run the chat and complaints; our reply time fell from 2 days to 4 hours. Before that, 2 years in a café. Studied management at the University of Łódź. I use Excel and Zendesk. English B2.",
  "cv.desc.tips":
    "For each job, write the company, your role, the years, what you do and what went well, with numbers if you know them. Add your school, tools and languages.",
  "cv.desc.facts":
    "The model adds nothing that is not here. Any name or contact details you leave out come from your account.",
  "cv.desc.short": "Write a little more",
  "cv.desc.go": "Write my CV",
  "cv.desc.writing": "Writing your CV. This can take up to a minute…",
  "cv.desc.textOnly":
    "The model was unavailable, so your whole description went into one CV section. Split it up on the page.",
  "cv.desc.err.limited":
    "This hour's limit for CVs from a description is used up. Try again in an hour.",
  "cv.desc.err.short": "The description is too short. Write at least a sentence or two.",
  "cv.desc.err.failed": "The CV could not be written. Try again.",
}
