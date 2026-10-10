const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: "...",
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => safeChar(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => safeChar(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 32 || code === 127) return " "
  return String.fromCodePoint(code)
}

export function htmlToText(html: string): string {
  const withoutDanger = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
  const withBreaks = withoutDanger
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|tr|section)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
  const stripped = withBreaks.replace(/<[^>]+>/g, " ")
  return decodeEntities(stripped)
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

export function summarize(text: string, max = 320): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  const slice = clean.slice(0, max)
  const sentence = slice.match(/^[\s\S]*?[.!?]\s/)
  if (sentence && sentence[0].length > 80) return sentence[0].trim()
  const word = slice.lastIndexOf(" ")
  return `${slice.slice(0, word > 40 ? word : max).trim()}…`
}

export function clampText(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trim()
}
