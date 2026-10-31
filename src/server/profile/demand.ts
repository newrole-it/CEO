import { fold } from "matching/text"

export type OfferText = {
  title: string
  descriptionText: string
}

export type DemandRole = {
  phrase: string
  offers: OfferText[]
}

export type DemandFact = {
  id: string
  role: string
  phrase: string
  matchingOffers: number
  totalOffers: number
  percent: number
  presentInProfile: boolean
  qualifies: boolean
}

type PhraseRule = {
  id: string
  label: string
  labelPl: string
  patterns: RegExp[]
}

// Requirement language, not the role title itself. Counts come from the offers passed in.
// Text is folded before matching, so the Polish patterns have no diacritics.
const PHRASES: PhraseRule[] = [
  {
    id: "budget-ownership",
    label: "budget ownership",
    labelPl: "odpowiedzialność za budżet",
    patterns: [
      /budget ownership/,
      /own(?:s|ing|ed)? the budget/,
      /budget owner/,
      /p\s*&\s*l/,
      /profit and loss/,
      /budzet/,
    ],
  },
  {
    id: "hiring",
    label: "hiring or headcount",
    labelPl: "rekrutacja i wielkość zespołu",
    patterns: [/\bhiring\b/, /\bheadcount\b/, /\brecruit(?:ing|ment)?\b/, /rekrut/],
  },
  {
    id: "roadmap",
    label: "a product roadmap",
    labelPl: "roadmapa produktu",
    patterns: [/\broadmaps?\b/, /\broadmap/],
  },
  {
    id: "stakeholders",
    label: "stakeholders",
    labelPl: "praca z interesariuszami",
    patterns: [/\bstakeholders?\b/, /interesariusz/],
  },
  {
    id: "architecture",
    label: "architecture",
    labelPl: "architektura",
    patterns: [/\barchitect(?:ure|ing|ed)?\b/, /architektur/],
  },
  {
    id: "mentoring",
    label: "mentoring",
    labelPl: "mentoring",
    patterns: [/\bmentor(?:ing|ship)?\b/, /\bcoaching\b/, /\bmentor/],
  },
  {
    id: "revenue",
    label: "revenue ownership",
    labelPl: "odpowiedzialność za przychód",
    patterns: [/\brevenue\b/, /przychod/],
  },
  {
    id: "platform",
    label: "platform ownership",
    labelPl: "odpowiedzialność za platformę",
    patterns: [/\bplatforms?\b/, /\bplatform/],
  },
  {
    id: "ai",
    label: "AI",
    labelPl: "AI",
    patterns: [
      /\bai\b/,
      /artificial intelligence/,
      /machine learning/,
      /sztuczn\w+ inteligencj/,
      /uczeni\w+ maszynow/,
    ],
  },
  {
    id: "cloud",
    label: "cloud platforms",
    labelPl: "chmura",
    patterns: [/\bcloud\b/, /\baws\b/, /\bazure\b/, /\bgcp\b/, /chmur/],
  },
  {
    id: "security",
    label: "security",
    labelPl: "bezpieczeństwo",
    patterns: [/\bsecurity\b/, /\bappsec\b/, /bezpieczenstw/],
  },
  {
    id: "leadership",
    label: "leadership",
    labelPl: "przywództwo",
    patterns: [/\bleadership\b/, /przywodztw/],
  },
  {
    id: "scale",
    label: "scaling a system or organization",
    labelPl: "skalowanie systemu lub organizacji",
    patterns: [/\bscal(?:e|ing)\b/, /skalowa/],
  },
  {
    id: "delivery",
    label: "delivery ownership",
    labelPl: "odpowiedzialność za dostarczanie",
    patterns: [/\bdelivery\b/, /dostarcza/],
  },
]

const MIN_OFFERS = 5
const MIN_HITS = 5
const MIN_PERCENT = 15

function mentions(text: string, patterns: RegExp[]): boolean {
  const folded = fold(text)
  return patterns.some((pattern) => pattern.test(folded))
}

function roleSlug(phrase: string): string {
  const slug = fold(phrase)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  return slug || "role"
}

export function pickLatestRuns<T extends { phrase: string; startedAt: Date }>(rows: T[]): T[] {
  const chosen = new Map<string, T>()
  for (const row of rows) {
    const key = fold(row.phrase.replace(/\s+/g, " ").trim())
    if (!key) continue
    const previous = chosen.get(key)
    if (!previous || row.startedAt.getTime() >= previous.startedAt.getTime()) chosen.set(key, row)
  }
  return [...chosen.values()]
}

/** The phrase of a fact in the given language. */
export function phraseLabel(fact: DemandFact, locale: "pl" | "en"): string {
  if (locale !== "pl") return fact.phrase
  const rule = PHRASES.find((candidate) => fact.id.endsWith(`:${candidate.id}`))
  return rule?.labelPl ?? fact.phrase
}

/** The one sentence a keyword note cites. `subject` names the text that lacks the phrase. */
export function factSentence(
  fact: DemandFact,
  locale: "pl" | "en" = "en",
  subject: "cv" | "profile" = "cv"
): string {
  const phrase = phraseLabel(fact, locale)
  if (locale === "pl") {
    const lacks = subject === "profile" ? "a w Twoim profilu tego nie ma" : "a w tym CV tego nie ma"
    return `Oferty „${fact.role}” w Twoich wynikach wspominają o tym: ${phrase}. To ${fact.percent}% przypadków (${fact.matchingOffers} z ${fact.totalOffers}), ${lacks}.`
  }
  const lacks = subject === "profile" ? "your profile doesn't" : "this CV doesn't"
  return `${fact.role} offers in your results mention ${phrase} in ${fact.percent}% of cases (${fact.matchingOffers} of ${fact.totalOffers}); ${lacks}.`
}

export function demandFromOffers(input: {
  roles: DemandRole[]
  profileText: string
}): DemandFact[] {
  const facts: DemandFact[] = []
  for (const role of input.roles) {
    const phrase = role.phrase.replace(/\s+/g, " ").trim()
    if (!phrase || role.offers.length < MIN_OFFERS) continue
    const total = role.offers.length
    for (const rule of PHRASES) {
      let matching = 0
      for (const offer of role.offers) {
        const text = `${offer.title}\n${offer.descriptionText}`
        if (mentions(text, rule.patterns)) matching += 1
      }
      const percent = Math.round((matching / total) * 100)
      const presentInProfile = mentions(input.profileText, rule.patterns)
      facts.push({
        id: `${roleSlug(phrase)}:${rule.id}`,
        role: phrase,
        phrase: rule.label,
        matchingOffers: matching,
        totalOffers: total,
        percent,
        presentInProfile,
        qualifies: matching >= MIN_HITS && percent >= MIN_PERCENT && !presentInProfile,
      })
    }
  }
  return facts.sort((a, b) => b.percent - a.percent || a.phrase.localeCompare(b.phrase))
}
