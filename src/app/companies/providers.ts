const LABELS: Record<string, string> = {
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  ASHBY: "Ashby",
  WORKABLE: "Workable",
  SMARTRECRUITERS: "SmartRecruiters",
  TRAFFIT: "Traffit",
  RECRUITEE: "Recruitee",
  TEAMTAILOR: "Teamtailor",
  PERSONIO: "Personio",
  PINPOINT: "Pinpoint",
  BREEZY: "Breezy HR",
  BAMBOOHR: "BambooHR",
  SUCCESSFACTORS: "SuccessFactors",
  WORKDAY: "Workday",
  ICIMS: "iCIMS",
  PHENOM: "Phenom",
  AVATURE: "Avature",
  ERECRUITER: "eRecruiter",
  JOBVITE: "Jobvite",
}

/** "GREENHOUSE" → "Greenhouse"; career-site / link providers → null. */
export function providerLabel(provider: string | null | undefined): string | null {
  if (!provider) return null
  if (provider === "CAREER_SITE" || provider === "GENERIC_HTML" || provider === "WEB_SEARCH") return null
  return LABELS[provider] ?? provider.charAt(0) + provider.slice(1).toLowerCase()
}
