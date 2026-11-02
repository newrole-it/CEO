/** Public canonical origin for metadata, Open Graph, and the crawler contact URL. */
export function publicAppUrl(): string {
  return (process.env.APP_URL?.trim() || "https://newrole.it").replace(/\/$/, "")
}
