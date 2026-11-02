/** The interface language: what the person picked, or else their browser's language. */
export type UiLocale = "pl" | "en"

export const LOCALE_COOKIE = "js-lang"

/** Polish when the browser prefers Polish over English, English for every other language. */
export function localeFromLanguages(languages: readonly string[]): UiLocale {
  for (const language of languages) {
    const primary = language.trim().toLowerCase().split("-")[0]
    if (primary === "pl") return "pl"
    if (primary === "en") return "en"
  }
  return "en"
}

/** Accept-Language ("pl-PL,pl;q=0.9,en;q=0.8") in the order the browser prefers. */
export function languagesFromHeader(header: string | null | undefined): string[] {
  if (!header) return []
  return header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";")
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="))
      const weight = q ? Number(q.slice(2)) : 1
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index }
    })
    .filter((item) => item.tag && item.tag !== "*" && item.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((item) => item.tag)
}

export function resolveLocale(
  cookie: string | null | undefined,
  acceptLanguage?: string | null
): UiLocale {
  if (cookie === "pl" || cookie === "en") return cookie
  return localeFromLanguages(languagesFromHeader(acceptLanguage))
}
