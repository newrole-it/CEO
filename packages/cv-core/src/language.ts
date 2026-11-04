/**
 * Which of the two CV languages a text reads as: diacritics and Polish function words against
 * English ones. Deterministic, no model and no network.
 */

export type TextLanguage = "pl" | "en"

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

/** Lowercase words without diacritics (ł too, which NFD does not decompose). */
function words(text: string): string[] {
  return text
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
}

/** "pl" when the text reads as Polish (diacritics, Polish function words), otherwise "en". */
export function detectLanguage(text: string): TextLanguage {
  const diacritics = (text.match(/[ąćęłńóśźż]/gi) ?? []).length
  let pl = Math.min(diacritics, 6) * 2
  let en = 0
  for (const word of words(text).slice(0, 400)) {
    if (!word) continue
    if (PL_MARKERS.has(word)) pl += 1
    if (EN_MARKERS.has(word)) en += 1
  }
  return pl > en ? "pl" : "en"
}
