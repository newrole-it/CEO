export function indexCountLabel(
  count: number,
  locale: "pl" | "en"
): { strong: string; rest: string } {
  if (count >= 1000) {
    const thousands = Math.floor(count / 1000)
    if (locale === "pl") {
      return { strong: `Ponad ${thousands} tys.`, rest: "aktywnych ofert w tech" }
    }
    return {
      strong: `Over ${thousands.toLocaleString("en-GB")},000`,
      rest: "active tech offers",
    }
  }
  if (locale === "pl") {
    const rest = count === 1 ? "aktywna oferta w tech" : "aktywnych ofert w tech"
    return { strong: String(count), rest }
  }
  return {
    strong: String(count),
    rest: count === 1 ? "active tech offer" : "active tech offers",
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
