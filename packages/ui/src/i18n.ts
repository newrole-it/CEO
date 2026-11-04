/** The two interface languages and the small helpers every dictionary in the apps shares. */

export type Locale = "pl" | "en"

/** Fill {placeholders}. Missing values stay visible so a bug is easy to spot. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  )
}

/** t("key", { n: 3 }) over one dictionary per locale. */
export type Translate<K extends string> = (key: K, vars?: Record<string, string | number>) => string

export function makeTranslator<K extends string>(dict: Record<K, string>): Translate<K> {
  return (key, vars) => (vars ? fmt(dict[key], vars) : dict[key])
}

/** The BCP 47 tag the Intl formatters get for a UI locale. */
export function intlLocale(locale: Locale): "pl-PL" | "en-GB" {
  return locale === "pl" ? "pl-PL" : "en-GB"
}
