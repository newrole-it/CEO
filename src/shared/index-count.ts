export function indexCountLabel(
  count: number,
  locale: "pl" | "en"
): { strong: string; rest: string } {
  if (count >= 1000) {
    const thousands = Math.floor(count / 1000)
    if (locale === "pl") {
      return { strong: `Ponad ${thousands} tys.`, rest: "ofert ze stron kariery firm" }
    }
    return {
      strong: `Over ${thousands.toLocaleString("en-GB")},000`,
      rest: "offers from company career pages",
    }
  }
  if (locale === "pl") {
    const rest = count === 1 ? "oferta ze stron kariery firm" : "ofert ze stron kariery firm"
    return { strong: String(count), rest }
  }
  return {
    strong: String(count),
    rest: count === 1 ? "offer from company career pages" : "offers from company career pages",
  }
}

export function indexBigNumber(count: number, locale: "pl" | "en"): string {
  if (count >= 1000) {
    const thousands = Math.floor(count / 1000)
    return locale === "pl"
      ? `ponad ${thousands} tys.`
      : `over ${thousands.toLocaleString("en-GB")},000`
  }
  return locale === "pl" ? String(count) : count.toLocaleString("en-GB")
}
