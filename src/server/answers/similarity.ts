import { fold } from "matching/text"
import type { AnswerLanguage } from "./types"

/**
 * Deterministic question similarity for Polish and English (no model, no network).
 * A question becomes a set of tokens: stopwords are dropped, words that mean the same thing in
 * either language map to one concept ("chcesz" / "want" / "interested" → @motivation), and the
 * rest are lightly stemmed. The score blends token overlap with character trigrams, so
 * paraphrases, inflections and typos still match.
 */

/** Folded (no diacritics, lowercase), punctuation-free, single-spaced. Keeps + and # (C++, C#). */
export function normalizeText(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const FIELD_MARKERS =
  /\((?:required|optional|wymagane|wymagany|opcjonalnie|opcjonalne|obowiązkowe|nieobowiązkowe)\)/gi

/** Grouping key for variants of one question: folded, punctuation-free, whitespace-collapsed. */
export function questionKey(question: string): string {
  return normalizeText(question.replace(FIELD_MARKERS, " ")).slice(0, 300).trim()
}

/* ---------------------------------------------------------------- stopwords */

const STOP_EN = `a an the to of in on at for with and or but nor is are was were be been being am do does
did done you your yours i me my mine we they them their he she his her it its this
that these those there here which who whom whose what how would could should can will shall may might
must have has had as by from about into onto please any if so than then also very just all some such
not up out over under more most other own same each both few one ones etc eg ie e g let know kindly
briefly short shortly`

const STOP_PL = `a i w we z ze na do od o u po za przy dla pod nad przez ku bez oraz lub albo czy ze zeby aby by
sie jest sa byl byla bylo byli byc bedzie jak jaki jaka jakie jakiego jakiej jakich jakim jakimi co czego
czym ktory ktora ktore ktorego ktorej ktorych ktorym ktorymi twoj twoja twoje twojego twojej twoich twoim
twoimi twym ty ciebie cie ci tobie toba pan pani panstwa pana mnie mi moj moja moje ja my to ten ta te
tego tej tym tych tu tam juz jeszcze bardzo tak nie takze rowniez ktos cos prosze swoj swoja swoje swojego
swojej swoich swoim jako ile gdzie kiedy mozesz moglbys moglabys jesli jezeli krotko krotki krotka`

const STOPWORDS = new Set([...STOP_EN.split(/\s+/), ...STOP_PL.split(/\s+/)].filter(Boolean))

/* ----------------------------------------------------------------- concepts */

/** Whole words that map to a concept. Checked before the prefixes. */
const CONCEPT_WORDS: Record<string, string> = {
  why: "why",
  dlaczego: "why",
  czemu: "why",
  us: "us",
  our: "us",
  ours: "us",
  nas: "us",
  nam: "us",
  tell: "describe",
  share: "describe",
  give: "describe",
  introduce: "describe",
  led: "lead",
  job: "role",
  jobs: "role",
  role: "role",
  roles: "role",
  rola: "role",
  roli: "role",
  pay: "salary",
  start: "available",
  starting: "available",
  started: "available",
  earliest: "available",
  cel: "goal",
  celu: "goal",
  cele: "goal",
  celem: "goal",
  celow: "goal",
  aim: "goal",
  lat: "year",
  lata: "year",
  rok: "year",
  roku: "year",
  spor: "conflict",
  sporu: "conflict",
  wiz: "workauth",
  wiza: "workauth",
  wizy: "workauth",
  wize: "workauth",
  skad: "source",
  yourself: "self",
  siebie: "self",
  sobie: "self",
  tech: "tech",
  hard: "challenge",
}

/** Prefixes of folded words, in priority order (more specific first). */
const CONCEPT_PREFIXES: [string, string][] = [
  ["pracodaw", "company"],
  ["employer", "company"],
  ["compan", "company"],
  ["organi", "company"],
  ["firm", "company"],
  ["nasz", "us"],
  ["want", "motivation"],
  ["wish", "motivation"],
  ["interest", "motivation"],
  ["interesuj", "motivation"],
  ["zainteres", "motivation"],
  ["motiv", "motivation"],
  ["motyw", "motivation"],
  ["excit", "motivation"],
  ["passion", "motivation"],
  ["pasj", "motivation"],
  ["attract", "motivation"],
  ["przyciag", "motivation"],
  ["appeal", "motivation"],
  ["chce", "motivation"],
  ["chcial", "motivation"],
  ["reason", "why"],
  ["powod", "why"],
  ["work", "work"],
  ["join", "work"],
  ["apply", "work"],
  ["applying", "work"],
  ["hire", "work"],
  ["hiring", "work"],
  ["pracow", "work"],
  ["pracuj", "work"],
  ["praca", "work"],
  ["pracy", "work"],
  ["prace", "work"],
  ["dolacz", "work"],
  ["aplik", "work"],
  ["zatrudn", "work"],
  ["position", "role"],
  ["stanowisk", "role"],
  ["posad", "role"],
  ["opportun", "role"],
  ["vacanc", "role"],
  ["ofert", "role"],
  ["salar", "salary"],
  ["compensat", "salary"],
  ["remunerat", "salary"],
  ["wage", "salary"],
  ["wynagrodz", "salary"],
  ["zarob", "salary"],
  ["pensj", "salary"],
  ["finans", "salary"],
  ["stawk", "salary"],
  ["expect", "expect"],
  ["oczekiw", "expect"],
  ["spodziew", "expect"],
  ["notice", "notice"],
  ["wypowiedz", "notice"],
  ["period", "period"],
  ["okres", "period"],
  ["availab", "available"],
  ["dostepn", "available"],
  ["zacz", "available"],
  ["rozpocz", "available"],
  ["relocat", "relocate"],
  ["relokac", "relocate"],
  ["relokow", "relocate"],
  ["przeprowadz", "relocate"],
  ["remote", "remote"],
  ["zdaln", "remote"],
  ["hybrid", "hybrid"],
  ["hybryd", "hybrid"],
  ["office", "office"],
  ["biur", "office"],
  ["onsite", "office"],
  ["stacjonarn", "office"],
  ["experien", "experience"],
  ["doswiadcz", "experience"],
  ["strength", "strength"],
  ["strong", "strength"],
  ["mocn", "strength"],
  ["zalet", "strength"],
  ["weak", "weakness"],
  ["slab", "weakness"],
  ["challeng", "challenge"],
  ["difficult", "challenge"],
  ["trudn", "challenge"],
  ["wyzwan", "challenge"],
  ["obstacle", "challenge"],
  ["problem", "challenge"],
  ["project", "project"],
  ["projekt", "project"],
  ["team", "team"],
  ["zesp", "team"],
  ["lead", "lead"],
  ["manag", "lead"],
  ["kier", "lead"],
  ["zarzadz", "lead"],
  ["lider", "lead"],
  ["przewodz", "lead"],
  ["supervis", "lead"],
  ["mentor", "lead"],
  ["describ", "describe"],
  ["explain", "describe"],
  ["opisz", "describe"],
  ["opisa", "describe"],
  ["opowiedz", "describe"],
  ["opowiedziec", "describe"],
  ["wyjasn", "describe"],
  ["przedstaw", "describe"],
  ["podziel", "describe"],
  ["example", "example"],
  ["instance", "example"],
  ["przyklad", "example"],
  ["proud", "proud"],
  ["dumn", "proud"],
  ["duma", "proud"],
  ["achiev", "achievement"],
  ["accomplish", "achievement"],
  ["osiagn", "achievement"],
  ["sukces", "achievement"],
  ["success", "achievement"],
  ["conflict", "conflict"],
  ["konflikt", "conflict"],
  ["disagree", "conflict"],
  ["goal", "goal"],
  ["aspir", "goal"],
  ["ambic", "goal"],
  ["ambit", "goal"],
  ["career", "career"],
  ["karier", "career"],
  ["future", "future"],
  ["przyszl", "future"],
  ["year", "year"],
  ["learn", "learn"],
  ["nauk", "learn"],
  ["nauczy", "learn"],
  ["uczy", "learn"],
  ["grow", "grow"],
  ["rozwoj", "grow"],
  ["rozwij", "grow"],
  ["leav", "leave"],
  ["odejs", "leave"],
  ["odchodz", "leave"],
  ["rezygn", "leave"],
  ["quit", "leave"],
  ["change", "change"],
  ["zmian", "change"],
  ["zmien", "change"],
  ["switch", "change"],
  ["current", "current"],
  ["obecn", "current"],
  ["aktualn", "current"],
  ["language", "language"],
  ["jezyk", "language"],
  ["english", "english"],
  ["angiel", "english"],
  ["polish", "polish"],
  ["polsk", "polish"],
  ["sponsor", "workauth"],
  ["visa", "workauth"],
  ["permit", "workauth"],
  ["pozwolen", "workauth"],
  ["authoriz", "workauth"],
  ["authoris", "workauth"],
  ["uprawn", "workauth"],
  ["eligib", "workauth"],
  ["legal", "workauth"],
  ["hear", "source"],
  ["dowiedz", "source"],
  ["referr", "referral"],
  ["polec", "referral"],
  ["technolog", "tech"],
  ["stack", "tech"],
]

export function conceptOf(word: string): string | null {
  const exact = CONCEPT_WORDS[word]
  if (exact) return exact
  for (const [prefix, concept] of CONCEPT_PREFIXES) if (word.startsWith(prefix)) return concept
  return null
}

/* ------------------------------------------------------------------ stemming */

const SUFFIXES = [
  // Polish (folded)
  "owaniami",
  "owaniach",
  "osciami",
  "osciach",
  "owania",
  "owanie",
  "owaniu",
  "owac",
  "ujesz",
  "ujemy",
  "osci",
  "osc",
  "ami",
  "ach",
  "ego",
  "emu",
  "ych",
  "ymi",
  "iej",
  "owi",
  "ow",
  "om",
  "em",
  "ie",
  "ia",
  "iu",
  "ej",
  "ym",
  // English
  "ingly",
  "ings",
  "ing",
  "edly",
  "ed",
  "ies",
  "es",
  "ly",
  "s",
  // Vowel endings shared by both
  "a",
  "e",
  "i",
  "o",
  "u",
  "y",
].sort((a, b) => b.length - a.length)

/** Strips one common Polish or English ending, keeping at least 4 characters. */
export function stem(word: string): string {
  if (word.length <= 4 || /^\d/.test(word)) return word
  for (const suffix of SUFFIXES) {
    if (!word.endsWith(suffix)) continue
    if (suffix === "s" && /(ss|us|is)$/.test(word)) continue
    const rest = word.slice(0, -suffix.length)
    if (rest.length >= 4) return rest
  }
  return word
}

/* ------------------------------------------------------------------ features */

export type QuestionFeatures = {
  key: string
  /** Concepts (prefixed with @) and stems of the remaining content words */
  tokens: Set<string>
  /** Character trigrams of the stemmed content words */
  grams: Set<string>
}

/** Content tokens of a text: no stopwords, concepts first, other words stemmed. */
export function contentTokens(text: string): { tokens: string[]; stems: string[] } {
  const tokens: string[] = []
  const stems: string[] = []
  for (const word of normalizeText(text).split(" ")) {
    if (!word || STOPWORDS.has(word)) continue
    const stemmed = stem(word)
    stems.push(stemmed)
    const concept = conceptOf(word)
    tokens.push(concept ? `@${concept}` : stemmed)
  }
  return { tokens, stems }
}

function trigrams(text: string): Set<string> {
  const out = new Set<string>()
  if (!text) return out
  const padded = ` ${text} `
  for (let index = 0; index + 3 <= padded.length; index += 1)
    out.add(padded.slice(index, index + 3))
  return out
}

export function questionFeatures(question: string): QuestionFeatures {
  const { tokens, stems } = contentTokens(question)
  return {
    key: questionKey(question),
    tokens: new Set(tokens),
    grams: trigrams(stems.join(" ")),
  }
}

function dice<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const item of a) if (b.has(item)) shared += 1
  return (2 * shared) / (a.size + b.size)
}

const TOKEN_WEIGHT = 0.7
const GRAM_WEIGHT = 0.3

/** Similarity of two precomputed questions in [0, 1]. Same questionKey → 1. */
export function featureSimilarity(a: QuestionFeatures, b: QuestionFeatures): number {
  if (!a.key || !b.key) return 0
  if (a.key === b.key) return 1
  const tokenScore = dice(a.tokens, b.tokens)
  const gramScore = dice(a.grams, b.grams)
  const score =
    a.tokens.size || b.tokens.size
      ? TOKEN_WEIGHT * tokenScore + GRAM_WEIGHT * gramScore
      : dice(trigrams(a.key), trigrams(b.key))
  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000
}

/** How alike two questions are, in [0, 1]: 1 for the same question, ~0.6+ for paraphrases. */
export function similarity(a: string, b: string): number {
  return featureSimilarity(questionFeatures(a), questionFeatures(b))
}

/* ------------------------------------------------------------------ language */

const PL_MARKERS = new Set(
  `jest sie nie czy jak jaki jakie jaka jakiego dlaczego czemu oraz prosze twoj twoje twoja twojego twojej
  ktore ktory ktora ktorych dla przez jestes masz mozesz opisz opowiedz pracy prace sa ze tak tylko rowniez
  bardzo swoje swoj nas naszej naszym naszego naszej w z na o u po od do sobie siebie ile kiedy gdzie lat
  oczekiwania wynagrodzenie doswiadczenie zespol firmy firma`.split(/\s+/)
)
const EN_MARKERS = new Set(
  `the and you your is are why what how with for please describe have has we our us would which this that
  of in on at be about tell does did can will yes from experience team company salary expectations notice
  period work years role position`.split(/\s+/)
)

/** "pl" when the text reads as Polish (diacritics, Polish function words), otherwise "en". */
export function detectLanguage(text: string): AnswerLanguage {
  const diacritics = (text.match(/[ąćęłńóśźż]/gi) ?? []).length
  let pl = Math.min(diacritics, 6) * 2
  let en = 0
  for (const word of normalizeText(text).split(" ").slice(0, 400)) {
    if (!word) continue
    if (PL_MARKERS.has(word)) pl += 1
    if (EN_MARKERS.has(word)) en += 1
  }
  return pl > en ? "pl" : "en"
}
