export type WorkdayBoardLink = {
  name: string
  href: string
  note: string
}

/**
 * Workday's site terms ban data mining and robots. These six Polish-hub
 * boards are outbound links only. The server must never fetch them.
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
  const host = hostname.toLowerCase()
  return host === "myworkdayjobs.com" || host.endsWith(".myworkdayjobs.com")
}
