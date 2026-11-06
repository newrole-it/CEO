import { fold } from "@newrole/matching/text"

/**
 * Finding an offer's terms in the person's own words, by stem where Polish changes endings.
 * Tailoring, the match with an offer and the ATS check all read text this way.
 */

/** A word shaped like a tool or product name: PostgreSQL, K8s, C#, Node.js, gRPC. */
export const TECH_SHAPED =
  /^(?:[^\s]*[A-ZĄĆĘŁŃÓŚŹŻ][^\s]*[A-ZĄĆĘŁŃÓŚŹŻ][^\s]*|[a-z]+[A-Z]\S*|\S*\d\S*[A-Za-z]\S*|[A-Za-z]+\d\S*|\S+[#+]+|\w+\.\w+)$/

/** Text as words for matching: folded, punctuation as spaces, "C++" and "C#" kept, padded. */
export const matchable = (text: string) =>
  ` ${fold(text)
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim()} `

/**
 * One word of a term in matchable text. A tool-shaped or short word must be there whole; a word of
 * four or five letters may gain an ending of up to three ("React" in "Reactem"), and a longer one
 * counts by its stem ("zarządzanie" in "zarządzałem").
 */
function hasWord(text: string, raw: string): boolean {
  const word = matchable(raw).trim()
  if (!word) return true
  if (TECH_SHAPED.test(raw) || !/^\p{L}+$/u.test(word) || word.length <= 3)
    return text.includes(` ${word} `)
  if (word.length <= 5) return new RegExp(` ${word}\\p{L}{0,3} `, "u").test(text)
  return text.includes(` ${word.slice(0, Math.max(5, word.length - 3))}`)
}

/** Every word of the term in text already made matchable. */
export function hasTerm(text: string, term: string): boolean {
  const words = term
    .split(/\s+/)
    .map((word) => word.replace(/^["'„“(]+|["'”).,;:!?]+$/g, ""))
    .filter(Boolean)
  return words.length > 0 && words.every((word) => hasWord(text, word))
}

/**
 * True when the text has every word of the term, by stem where Polish changes endings, so
 * "zarządzanie zespołem" is found in "zarządzałem zespołem". A hint, not a verdict.
 */
export function mentionsTerm(text: string, term: string): boolean {
  return hasTerm(matchable(text), term)
}

/**
 * True when the text holds the quote: word for word once case, accents and punctuation are set
 * aside, or, for a quote of up to eight words, every word of it by stem. A model told to copy a
 * fragment sometimes changes an ending; it must not invent the words.
 */
export function quoteIn(text: string, quote: string): boolean {
  const needle = matchable(quote).trim()
  if (needle.length < 3) return false
  if (matchable(text).includes(` ${needle} `)) return true
  return needle.split(" ").length <= 8 && mentionsTerm(text, quote)
}
