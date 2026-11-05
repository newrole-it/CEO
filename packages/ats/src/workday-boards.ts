export type WorkdayBoardLink = {
  name: string
  href: string
  note: string
}

/**
 * Polish-hub Workday tenants. The server may read sitemap.xml and job-page
 * JSON-LD. /refreshFacet/ and private sites stay blocked. These links open
 * the original board.
 */
export const WORKDAY_BOARDS: WorkdayBoardLink[] = [
  {
    name: "Intive",
    href: "https://intive.wd3.myworkdayjobs.com/Intive",
    note: "Opens the employer board. Not downloaded.",
  },
  {
    name: "Motorola Solutions",
    href: "https://motorolasolutions.wd5.myworkdayjobs.com/Careers",
    note: "Opens the employer board. Not downloaded.",
  },
  {
    name: "Mastercard",
    href: "https://mastercard.wd1.myworkdayjobs.com/CorporateCareers",
    note: "Opens the employer board. Not downloaded.",
  },
  {
    name: "Visa",
    href: "https://visa.wd5.myworkdayjobs.com/Visa",
    note: "Opens the employer board. Not downloaded.",
  },
  {
    name: "Samsung (incl. SRPOL)",
    href: "https://sec.wd3.myworkdayjobs.com/Samsung_Careers",
    note: "Opens the employer board. Not downloaded.",
  },
  {
    name: "Thomson Reuters",
    href: "https://thomsonreuters.wd5.myworkdayjobs.com/External_Career_Site",
    note: "Opens the employer board. Not downloaded.",
  },
]

export function isWorkdayHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "")
  return ["myworkdayjobs.com", "myworkdaysite.com", "myworkday.com"].some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  )
}
