export type PolishBoardLink = {
  name: string
  href: string
  note: string
}

/**
 * Polish boards have no public API and their terms forbid automated downloading.
 * These are outbound links only, and the crawler never fetches them. One offer a person asks for
 * is a person's read (Reader in source-policies.ts), which robots.txt still limits.
 */
export function polishBoardLinks(phrase: string): PolishBoardLink[] {
  const query = phrase.trim() || "engineering manager"
  const encoded = encodeURIComponent(query)
  const hyphen = encodeURIComponent(query.toLowerCase().replace(/\s+/g, "-"))
  return [
    {
      name: "justjoin.it",
      href: `https://justjoin.it/job-offers/all-locations?keyword=${encoded}`,
      note: "Opens their search. Not downloaded.",
    },
    {
      name: "nofluffjobs",
      href: `https://nofluffjobs.com/pl?criteria=keyword%3D${encodeURIComponent(
        query.toLowerCase()
      )}`,
      note: "Opens their search. Not downloaded.",
    },
    {
      name: "pracuj.pl",
      href: `https://www.pracuj.pl/praca/${encoded};kw`,
      note: "Opens their search. Not downloaded.",
    },
    {
      name: "theprotocol.it",
      href: `https://theprotocol.it/filtry/${hyphen};sp`,
      note: "Opens their search. Not downloaded.",
    },
    {
      name: "bulldogjob",
      href: `https://bulldogjob.pl/companies/jobs?q=${encoded}`,
      note: "Opens their search. Not downloaded.",
    },
  ]
}

const POLISH_HOSTS = [
  "justjoin.it",
  "nofluffjobs.com",
  "pracuj.pl",
  "theprotocol.it",
  "bulldogjob.pl",
  "bulldogjob.com",
]

export function isPolishBoardHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "")
  return POLISH_HOSTS.some((item) => host === item || host.endsWith(`.${item}`))
}
