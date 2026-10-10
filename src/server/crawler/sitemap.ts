export type SitemapEntry = { loc: string; lastmod?: string }

function decodeLoc(value: string): string {
  return value.trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
}

function readTag(block: string, tag: string): string | null {
  const cdata = block.match(
    new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i")
  )
  if (cdata?.[1]?.trim()) return decodeLoc(cdata[1])
  const plain = block.match(new RegExp(`<${tag}[^>]*>\\s*([^<]+?)\\s*</${tag}>`, "i"))
  return plain?.[1]?.trim() ? decodeLoc(plain[1]) : null
}

export function parseSitemap(xml: string): { urls: SitemapEntry[]; children: string[] } {
  const urls: SitemapEntry[] = []
  const children: string[] = []
  for (const block of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const loc = readTag(block[1], "loc")
    if (!loc) continue
    urls.push({ loc, lastmod: readTag(block[1], "lastmod") || undefined })
  }
  for (const block of xml.matchAll(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi)) {
    const loc = readTag(block[1], "loc")
    if (loc) children.push(loc)
  }
  return { urls, children }
}

/** Job sitemaps first, so a long index is not truncated before the offer list. */
export function orderSitemapChildren(children: string[]): string[] {
  return [...children].sort((a, b) => {
    const rank = (url: string) => (/job/i.test(url) ? 0 : 1)
    return rank(a) - rank(b) || a.localeCompare(b)
  })
}
