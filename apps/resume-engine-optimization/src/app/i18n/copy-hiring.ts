/**
 * Strings for an offer's hiring confidence (src/shared/hiring-confidence.ts): the card on the
 * offer's page and the badge on the list. Keys "hc.".
 */
export const hiringPl = {
  "hc.title": "Pewność rekrutacji",
  "hc.score": "{n}/100",
  "hc.level.high": "Wysoka",
  "hc.level.medium": "Średnia",
  "hc.level.low": "Niska",
  "hc.badge": "Pewność rekrutacji: {n}/100",
  "hc.badge.tip.high":
    "Dużo wskazuje na to, że firma teraz zatrudnia na to stanowisko. Powody znajdziesz na stronie oferty.",
  "hc.badge.tip.medium":
    "Nie wiemy na pewno, czy firma teraz zatrudnia na to stanowisko. Powody znajdziesz na stronie oferty.",
  "hc.badge.tip.low":
    "Mało wskazuje na to, że firma teraz zatrudnia na to stanowisko. Powody znajdziesz na stronie oferty.",
  "hc.signals": "Na czym opieramy wynik",
  "hc.note":
    "To szacunek z reguł, a nie zmierzone prawdopodobieństwo. Nie wiemy, które ogłoszenia kończą się zatrudnieniem.",
  "hc.low.hint": "Zanim dopasujesz CV, zapytaj rekrutera, czy rekrutacja nadal trwa.",
  "hc.points": "{points} pkt",
  "hc.s.age.today": "Ogłoszenie opublikowano dzisiaj.",
  "hc.s.age.one": "Ogłoszenie opublikowano {n} dzień temu.",
  "hc.s.age.few": "Ogłoszenie opublikowano {n} dni temu.",
  "hc.s.age.many": "Ogłoszenie opublikowano {n} dni temu.",
  "hc.s.seen.one": "Ogłoszenie nie ma daty publikacji, a znamy je od {n} dnia.",
  "hc.s.seen.few": "Ogłoszenie nie ma daty publikacji, a znamy je od {n} dni.",
  "hc.s.seen.many": "Ogłoszenie nie ma daty publikacji, a znamy je od {n} dni.",
  "hc.s.age-unknown": "Ogłoszenie nie ma daty publikacji, więc nie znamy jego wieku.",
  "hc.s.own-site": "Ogłoszenie jest na stronie firmy albo w jej systemie rekrutacji.",
  "hc.s.intermediary": "Ogłoszenie wystawił pośrednik, a nie sama firma.",
  "hc.s.evergreen.one": "Firma ma jeszcze {n} otwarte ogłoszenie o tym samym tytule.",
  "hc.s.evergreen.few": "Firma ma jeszcze {n} otwarte ogłoszenia o tym samym tytule.",
  "hc.s.evergreen.many": "Firma ma jeszcze {n} otwartych ogłoszeń o tym samym tytule.",
  "hc.s.maybe-closed": "Przy ostatnim sprawdzeniu nie znaleźliśmy ogłoszenia na stronie firmy.",
  "hc.s.in-talks": "Firma odpowiedziała na Twoją aplikację.",
  "hc.s.no-reply": "Twoja aplikacja została bez odpowiedzi.",
}

export const hiringEn: Record<keyof typeof hiringPl, string> = {
  "hc.title": "Hiring confidence",
  "hc.score": "{n}/100",
  "hc.level.high": "High",
  "hc.level.medium": "Medium",
  "hc.level.low": "Low",
  "hc.badge": "Hiring confidence: {n}/100",
  "hc.badge.tip.high":
    "A lot suggests the company is hiring for this role now. The reasons are on the offer's page.",
  "hc.badge.tip.medium":
    "We can't tell whether the company is hiring for this role now. The reasons are on the offer's page.",
  "hc.badge.tip.low":
    "Little suggests the company is hiring for this role now. The reasons are on the offer's page.",
  "hc.signals": "What the score rests on",
  "hc.note":
    "This is an estimate from rules, not a measured probability. We don't know which postings end in a hire.",
  "hc.low.hint": "Before you tailor your CV, ask the recruiter whether they are still hiring.",
  "hc.points": "{points} pts",
  "hc.s.age.today": "The posting was published today.",
  "hc.s.age.one": "The posting was published {n} day ago.",
  "hc.s.age.few": "The posting was published {n} days ago.",
  "hc.s.age.many": "The posting was published {n} days ago.",
  "hc.s.seen.one": "The posting has no publication date, and we have known it for {n} day.",
  "hc.s.seen.few": "The posting has no publication date, and we have known it for {n} days.",
  "hc.s.seen.many": "The posting has no publication date, and we have known it for {n} days.",
  "hc.s.age-unknown": "The posting has no publication date, so we don't know its age.",
  "hc.s.own-site": "The posting is on the company's own site or in its ATS.",
  "hc.s.intermediary": "The posting was listed by an intermediary, not the company itself.",
  "hc.s.evergreen.one": "The company has {n} more open posting with the same title.",
  "hc.s.evergreen.few": "The company has {n} more open postings with the same title.",
  "hc.s.evergreen.many": "The company has {n} more open postings with the same title.",
  "hc.s.maybe-closed": "At the last check we did not find the posting on the company's site.",
  "hc.s.in-talks": "The company replied to your application.",
  "hc.s.no-reply": "Your application got no reply.",
}
