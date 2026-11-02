/**
 * OFFER_INDEX=off runs newrole.it without an index of offers: no crawl, nothing added to the shared
 * tables, and the screens built on them redirect. The tracker, CV and answers keep working. It is
 * for a service run for other people, where gathering vacancies is a regulated activity in Poland
 * (Dz.U. 2025 poz. 620, art. 305 ust. 2 pkt 1 lit. c).
 */
export function offerIndexEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OFFER_INDEX?.trim().toLowerCase() !== "off"
}
