export type SitemapEntry = { loc: string; lastmod?: string }

function decodeLoc(value: string): string {
  return value.trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
}

export function parseSitemap(xml: string): { urls: SitemapEntry[]; children: string[] } {
  const urls: SitemapEntry[] = []
  const children: string[] = []
  for (const block of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const loc = block[1].match(/<loc>\s*([^<]+)\s*<\/loc>/i)?.[1]
    if (!loc) continue
    const lastmod = block[1].match(/<lastmod>\s*([^<]+)\s*<\/lastmod>/i)?.[1]?.trim()
    urls.push({ loc: decodeLoc(loc), lastmod: lastmod || undefined })
  }
  for (const block of xml.matchAll(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi)) {
    const loc = block[1].match(/<loc>\s*([^<]+)\s*<\/loc>/i)?.[1]
    if (loc) children.push(decodeLoc(loc))
  }
  return { urls, children }
}
