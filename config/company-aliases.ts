/**
 * Names a company in the index also goes by, where the names alone do not show it: rebrands,
 * parent names, or a shorter name people use. Spelling, legal forms and brackets need no entry here
 * (src/server/companies/names.ts). An entry for a company with no row in the index does nothing.
 */
export type CompanyAliasEntry = { company: string; aliases: string[] }

export const COMPANY_ALIASES: CompanyAliasEntry[] = [
  { company: "11 bit studios", aliases: ["11 bit"] },
  { company: "Allegro", aliases: ["Allegro.pl", "Allegro.eu"] },
  { company: "Autopay", aliases: ["Blue Media"] },
  { company: "Bosch Group", aliases: ["Robert Bosch"] },
  { company: "CD PROJEKT RED", aliases: ["CD PROJEKT", "CD Projekt Group"] },
  { company: "Cosmose AI", aliases: ["Cosmose"] },
  { company: "EPAM", aliases: ["EPAM Systems"] },
  { company: "GFT", aliases: ["GFT Technologies"] },
  { company: "Grafana Labs", aliases: ["Grafana"] },
  { company: "Grupa Pracuj", aliases: ["Pracuj.pl"] },
  { company: "Huuuge Games", aliases: ["Huuuge"] },
  { company: "Motorola Solutions", aliases: ["Motorola"] },
  { company: "Ocado Technology", aliases: ["Ocado"] },
  { company: "Oyster HR", aliases: ["Oyster"] },
  { company: "Redpanda Data", aliases: ["Redpanda"] },
  { company: "Samsung", aliases: ["Samsung R&D Institute Poland", "Samsung R&D Poland"] },
  { company: "Sword", aliases: ["Sword Health"] },
  { company: "Text", aliases: ["LiveChat", "LiveChat Software"] },
  { company: "Ulam Labs", aliases: ["Ulam"] },
  { company: "Vodeno", aliases: ["Aion Bank"] },
  { company: "Wise", aliases: ["TransferWise"] },
  { company: "XTM International", aliases: ["XTM"] },
]
