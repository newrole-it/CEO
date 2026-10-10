import { fold } from "../../../matching/text"

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
  patterns: RegExp[]
}

// Requirement language, not the role title itself. Counts come from the offers passed in.
const PHRASES: PhraseRule[] = [
  {
    id: "budget-ownership",
    label: "budget ownership",
    patterns: [
      /budget ownership/,
      /own(?:s|ing|ed)? the budget/,
      /budget owner/,
      /p\s*&\s*l/,
      /profit and loss/,
    ],
  },
  {
    id: "hiring",
    label: "hiring or headcount",
    patterns: [/\bhiring\b/, /\bheadcount\b/, /\brecruit(?:ing|ment)?\b/],
  },
  {
    id: "roadmap",
    label: "a product roadmap",
    patterns: [/\broadmaps?\b/],
  },
  {
    id: "stakeholders",
    label: "stakeholders",
    patterns: [/\bstakeholders?\b/],
  },
  {
    id: "architecture",
    label: "architecture",
    patterns: [/\barchitect(?:ure|ing|ed)?\b/],
  },
  {
    id: "mentoring",
    label: "mentoring",
    patterns: [/\bmentor(?:ing|ship)?\b/, /\bcoaching\b/],
  },
  {
    id: "revenue",
    label: "revenue ownership",
    patterns: [/\brevenue\b/],
  },
  {
    id: "platform",
    label: "platform ownership",
    patterns: [/\bplatforms?\b/],
  },
  {
    id: "ai",
    label: "AI",
    patterns: [/\bai\b/, /artificial intelligence/, /machine learning/],
  },
  {
    id: "cloud",
    label: "cloud platforms",
    patterns: [/\bcloud\b/, /\baws\b/, /\bazure\b/, /\bgcp\b/],
  },
  {
    id: "security",
    label: "security",
    patterns: [/\bsecurity\b/, /\bappsec\b/],
  },
  {
    id: "leadership",
    label: "leadership",
    patterns: [/\bleadership\b/],
  },
  {
    id: "scale",
    label: "scaling a system or organization",
    patterns: [/\bscal(?:e|ing)\b/],
  },
  {
    id: "delivery",
    label: "delivery ownership",
    patterns: [/\bdelivery\b/],
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

export function factSentence(fact: DemandFact): string {
  return `${fact.role} offers in your results mention ${fact.phrase} in ${fact.percent}% of cases (${fact.matchingOffers} of ${fact.totalOffers}); your profile doesn't.`
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
