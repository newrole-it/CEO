function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code: string) => safeChar(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => safeChar(Number.parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 32 || code === 127) return " "
  return String.fromCodePoint(code)
}

export function tagBlocks(xml: string, tag: string): string[] {
  const name = escapeReg(tag)
  const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi")
  return Array.from(xml.matchAll(pattern), (match) => match[1] ?? "")
}

export function tagText(xml: string, tag: string): string | undefined {
  const block = tagBlocks(xml, tag)[0]
  if (block == null) return undefined
  const text = decodeXml(block).replace(/\s+/g, " ").trim()
  return text || undefined
}

export function channelPreamble(xml: string): string {
  return xml.split(/<item[\s>]/i)[0] ?? xml
}
