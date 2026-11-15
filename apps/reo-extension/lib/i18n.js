/**
 * What the extension's interface needs besides its dictionaries (lib/copy.js): filling a page from
 * keys, and dates and plural forms in the person's language. The language itself comes from
 * localeOf(navigator.language) and is passed in; nothing here picks one.
 */

const INTL = { pl: "pl-PL", en: "en-GB" }

/** The Intl locale of an interface language, the same pair the app uses. */
export function intlLocale(locale) {
  return INTL[locale]
}

function formatted(value, locale, options) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(date)
}

export function formatDate(value, locale) {
  return formatted(value, locale, { dateStyle: "short" })
}

export function formatDateTime(value, locale) {
  return formatted(value, locale, { dateStyle: "short", timeStyle: "short" })
}

/**
 * Which of a key's .one, .few and .many texts a count takes. A language without a "few" form
 * (English) uses .many for everything but one.
 */
export function pluralKind(n, locale) {
  const rule = new Intl.PluralRules(intlLocale(locale)).select(n)
  return rule === "one" || rule === "few" ? rule : "many"
}

/**
 * Fills a page written with keys instead of text: data-i18n="key" sets an element's text, and
 * data-i18n-attr="placeholder:key,title:key" sets attributes. A document also gets its lang.
 */
export function applyCopy(root, t, locale) {
  for (const node of root.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.getAttribute("data-i18n"))
  }
  for (const node of root.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of node.getAttribute("data-i18n-attr").split(",")) {
      const [name, key] = pair.split(":").map((part) => part.trim())
      if (name && key) node.setAttribute(name, t(key))
    }
  }
  if (root.documentElement) root.documentElement.lang = locale
}
