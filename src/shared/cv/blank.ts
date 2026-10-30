import {
  CV_ACCENT,
  CV_VERSION,
  cvId,
  type CvContent,
  type CvSection,
  type CvSectionType,
} from "./schema"

export type CvLocale = "pl" | "en"

const CONSENT: Record<CvLocale, string> = {
  pl: "Wyrażam zgodę na przetwarzanie moich danych osobowych zawartych w tym dokumencie w celu realizacji procesu rekrutacji, zgodnie z Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. (RODO).",
  en: "I consent to the processing of my personal data contained in this document for the purposes of the recruitment process, in accordance with Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 (GDPR).",
}

const TECH_LABEL: Record<CvLocale, string> = { pl: "Technologie", en: "Technology" }

/** Section titles in the reference layout, by language. */
export const SECTION_TITLES: Record<
  CvLocale,
  Record<"profile" | "skills" | "experience" | "projects" | "education" | "languages", string>
> = {
  pl: {
    profile: "Profil",
    skills: "Kluczowe kompetencje",
    experience: "Doświadczenie zawodowe",
    projects: "Projekty własne",
    education: "Wykształcenie",
    languages: "Języki",
  },
  en: {
    profile: "Profile",
    skills: "Key Skills",
    experience: "Professional Experience",
    projects: "Personal Projects",
    education: "Education",
    languages: "Languages",
  },
}

export function defaultConsent(locale: CvLocale): string {
  return CONSENT[locale]
}

export function techLine(locale: CvLocale, value = ""): string {
  return `<strong>${TECH_LABEL[locale]}:</strong> ${value}`.trimEnd()
}

export function emptyCv(): CvContent {
  return {
    version: CV_VERSION,
    header: { name: "", headline: "", location: "", email: "", phone: "", links: [], photo: null },
    sections: [],
    consent: null,
    theme: { accent: CV_ACCENT },
  }
}

/** A new, empty section of a type, for the outline's "add section". */
export function newSection(type: CvSectionType, title: string, locale: CvLocale = "pl"): CvSection {
  const id = cvId("s")
  const pl = locale === "pl"
  if (type === "text") return { id, type, title, body: pl ? "Wpisz tekst." : "Type here." }
  if (type === "skills") return { id, type, title, items: [newSkill(locale)] }
  if (type === "experience") return { id, type, title, items: [newJob(locale)] }
  if (type === "cards") return { id, type, title, items: [newCard(locale)] }
  return { id, type, title, items: [newEducation(locale)] }
}

export function newSkill(locale: CvLocale = "pl") {
  const pl = locale === "pl"
  return {
    id: cvId("i"),
    label: pl ? "Obszar" : "Area",
    text: pl ? "umiejętności w tym obszarze" : "skills in this area",
  }
}

export function newJob(locale: CvLocale = "pl") {
  const pl = locale === "pl"
  return {
    id: cvId("i"),
    company: pl ? "Firma" : "Company",
    role: pl ? "Stanowisko" : "Role",
    dates: pl ? "01.2024 – obecnie" : "Jan 2024 – Present",
    summary: pl
      ? "Czym się zajmowałeś i za co odpowiadałeś."
      : "What you did and what you were responsible for.",
    bullets: [
      pl ? "Konkretny wynik, najlepiej z liczbą." : "A concrete result, ideally with a number.",
    ],
    tech: "",
    compact: false,
  }
}

export function newCard(locale: CvLocale = "pl") {
  const pl = locale === "pl"
  return {
    id: cvId("i"),
    title: pl ? "Projekt · Rola" : "Project · Role",
    body: pl ? "Krótki opis projektu." : "A short description.",
  }
}

export function newEducation(locale: CvLocale = "pl") {
  const pl = locale === "pl"
  return {
    id: cvId("i"),
    school: pl ? "Uczelnia" : "School",
    degree: pl ? "Kierunek, tytuł" : "Field, degree",
    dates: "2015 – 2020",
  }
}

/** A new CV: the reference layout's sections with placeholder text to type over. */
export function blankCv(locale: CvLocale = "pl"): CvContent {
  const pl = locale === "pl"
  const titles = SECTION_TITLES[locale]
  return {
    ...emptyCv(),
    header: {
      name: pl ? "Imię Nazwisko" : "First Last",
      headline: pl ? "Stanowisko · Specjalizacja" : "Role · Specialisation",
      location: pl ? "Miasto" : "City",
      email: pl ? "imie@example.com" : "name@example.com",
      phone: "+48 600 000 000",
      links: [],
      photo: null,
    },
    sections: [
      {
        id: cvId("s"),
        type: "text",
        title: titles.profile,
        body: pl
          ? "Kilka zdań o tym, kim jesteś zawodowo, w czym jesteś dobry i czego szukasz."
          : "A few sentences on who you are professionally, what you are good at and what you are looking for.",
      },
      {
        id: cvId("s"),
        type: "skills",
        title: titles.skills,
        items: [newSkill(locale), newSkill(locale)],
      },
      {
        id: cvId("s"),
        type: "experience",
        title: titles.experience,
        items: [
          {
            ...newJob(locale),
            tech: techLine(locale, pl ? "wymień najważniejsze" : "list the main ones"),
          },
        ],
      },
      { id: cvId("s"), type: "education", title: titles.education, items: [newEducation(locale)] },
      {
        id: cvId("s"),
        type: "text",
        title: titles.languages,
        body: pl ? "polski (ojczysty) · angielski (poziom)" : "Polish (native) · English (level)",
      },
    ],
    consent: CONSENT[locale],
  }
}
