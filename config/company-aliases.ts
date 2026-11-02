/**
 * Names a company in the index also goes by, where spelling does not show it. Each entry is a fact:
 * it stays here only with the page it was read on, and what that page says. No source, no entry.
 * Spelling, legal forms and brackets need no entry (src/server/companies/names.ts). An entry for a
 * company with no row in the index does nothing.
 */
export type CompanyAliasEntry = {
  company: string
  aliases: string[]
  /** What the source says, in short */
  fact: string
  source: string
  /** When the source was opened and read */
  checked: string
}

export const COMPANY_ALIASES: CompanyAliasEntry[] = [
  {
    company: "Autopay",
    aliases: ["Blue Media"],
    fact: "Blue Media formally changed its name to Autopay on 28 August 2023.",
    source:
      "https://www.bankier.pl/wiadomosc/Marka-Blue-Media-zniknie-W-jej-miejsce-pojawi-sie-Autopay-8604901.html",
    checked: "2026-10-31",
  },
  {
    company: "Bosch Group",
    aliases: ["Robert Bosch"],
    fact: "The company page names Robert Bosch GmbH as the company of the Bosch Group.",
    source: "https://www.bosch.com/company/",
    checked: "2026-10-31",
  },
  {
    company: "EPAM",
    aliases: ["EPAM Systems"],
    fact: "In the index, the jobs of the EPAM Systems row are on careers.epam.com, EPAM's board.",
    source: "https://careers.epam.com/",
    checked: "2026-10-31",
  },
  {
    company: "Exadel",
    aliases: ["Codete"],
    fact: "Exadel announced on 7 November 2022 that it had acquired Codete.",
    source:
      "https://prnewswire.com/news-releases/exadel-acquires-it-consulting-and-software-development-firm-codete-301670621.html",
    checked: "2026-10-31",
  },
  {
    company: "GFT",
    aliases: ["GFT Technologies"],
    fact: "The company site titles itself GFT Technologies, legal name GFT Technologies SE.",
    source: "https://www.gft.com/int/en/about-us",
    checked: "2026-10-31",
  },
  {
    company: "Samsung",
    aliases: ["Samsung R&D Institute Poland", "SRPOL"],
    fact: "Samsung R&D Institute Poland (SRPOL) is part of Samsung Electronics' R&D network.",
    source: "https://research.samsung.com/srpol",
    checked: "2026-10-31",
  },
  {
    company: "Sword",
    aliases: ["Sword Health"],
    fact: "The Greenhouse board with the slug swordhealth is titled Jobs at Sword.",
    source: "https://job-boards.greenhouse.io/swordhealth",
    checked: "2026-10-31",
  },
  {
    company: "Text",
    aliases: ["LiveChat Software"],
    fact: "Text S.A. was renamed from LiveChat Software S.A. in September 2023.",
    source: "https://www.text.com/about/",
    checked: "2026-10-31",
  },
  {
    company: "Wise",
    aliases: ["TransferWise"],
    fact: "TransferWise announced its rebranding to Wise on 22 February 2021.",
    source: "https://tech.eu/2021/02/22/transferwise-rebrands-to-wise",
    checked: "2026-10-31",
  },
]
