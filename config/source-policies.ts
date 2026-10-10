export type PolicyState = "enabled" | "limited" | "link_only"

export type SourcePolicy = {
  platform: string
  state: PolicyState
  reason: string
  termsUrl: string
  allowPaths?: string[]
  denyPaths?: string[]
}

const SAP_TERMS = "https://www.sap.com/about/legal/terms-of-use.html"
const WORKDAY_TERMS = "https://www.workday.com/en-us/legal/site-terms.html"

export const PLATFORM_POLICIES: Record<string, SourcePolicy> = {
  successfactors: {
    platform: "SuccessFactors",
    state: "limited",
    reason:
      "Employer career sites (jobs.gft.com): undeclared sitemap plus microdata on job pages. Never /services/, apply, or talent-community paths.",
    termsUrl: "https://www.gft.com/us/en/legal-disclaimer",
    allowPaths: ["/sitemap", "/job/", "/search"],
    denyPaths: [
      "/services/",
      "/applybutton/",
      "/talentcommunity/",
      "/preapply/",
      "/emailsubscribe/",
      "/email/image/",
      "/mobile/",
      "/unsubscribe/",
      "/reset/",
    ],
  },
  "successfactors-legacy": {
    platform: "SuccessFactors",
    state: "link_only",
    reason: "Legacy SuccessFactors host robots.txt disallows /. No job pages are fetched.",
    termsUrl: SAP_TERMS,
    allowPaths: ["/robots.txt"],
  },
  sap: {
    platform: "SAP",
    state: "link_only",
    reason: "jobs.sap.com is an SAP website. SAP's terms ban automated extraction and reserve TDM.",
    termsUrl: SAP_TERMS,
  },
  workday: {
    platform: "Workday",
    state: "limited",
    reason:
      "Tenant career sites do not reference the workday.com terms. Sitemap plus JSON-LD on job pages. A short filtered cxs query only when the sitemap is capped at 100 URLs. /refreshFacet/ stays disallowed.",
    termsUrl: WORKDAY_TERMS,
    allowPaths: ["/sitemap", "sitemap.xml", "/job/", "/wday/cxs/"],
    denyPaths: ["/refreshFacet/", "/login"],
  },
  oracle: {
    platform: "Oracle Recruiting Cloud",
    state: "link_only",
    reason:
      "Oracle.com terms ban robots and scrapers, and the footer links those terms. REST is marked internal use.",
    termsUrl: "https://www.oracle.com/legal/terms.html",
  },
  taleo: {
    platform: "Taleo",
    state: "link_only",
    reason: "No robots.txt and no static job data. Left link-only with Oracle.",
    termsUrl: "https://www.oracle.com/legal/terms.html",
  },
  icims: {
    platform: "iCIMS",
    state: "limited",
    reason:
      "Sitemap plus ?in_iframe=1 JSON-LD, at least 5 s between requests. The vendor terms ban robots, so this stays conservative. Login, apply, and referral paths are not fetched.",
    termsUrl: "https://www.icims.com/legal/terms-of-use/",
    allowPaths: ["/sitemap", "/jobs/"],
    denyPaths: ["/login", "/referral", "/connect", "/candidate", "/intro"],
  },
  phenom: {
    platform: "Phenom",
    state: "limited",
    reason:
      "Employer domains: sitemap plus JSON-LD. Apply, job cart, and chatbot paths are skipped.",
    termsUrl: "https://www.phenom.com/terms--conditions",
    allowPaths: ["/sitemap", "/job/", "/jobs/"],
    denyPaths: ["/apply", "/jobcart", "/chatbot", "phenomtrack"],
  },
  "phenom-vendor": {
    platform: "Phenom",
    state: "link_only",
    reason: "careers.phenom.com is covered by Phenom's terms and sends ai-train=no, ai-input=no.",
    termsUrl: "https://www.phenom.com/terms--conditions",
  },
  avature: {
    platform: "Avature",
    state: "limited",
    reason: "RSS at /SearchJobs/feed/ plus job HTML. Query strings with qtvc= are disallowed.",
    termsUrl: "https://www.avature.net/terms-of-use/",
    allowPaths: ["/SearchJobs/feed", "/sitemap", "/jobdetail", "/JobDetail"],
    denyPaths: ["qtvc="],
  },
  siemens: {
    platform: "Avature",
    state: "limited",
    reason: "Siemens terms ban text and data mining. RSS only. Job detail pages are link-only.",
    termsUrl: "https://www.siemens.com/terms-of-use",
    allowPaths: ["/SearchJobs/feed", "/sitemap"],
  },
  erecruiter: {
    platform: "eRecruiter",
    state: "limited",
    reason: "JSON-LD on the employer's own career pages. skk.erecruiter.pl frames are link-only.",
    termsUrl: "https://erecruiter.pl/",
    allowPaths: ["/careers", "/career", "/jobs/", "/job/"],
  },
  jobvite: {
    platform: "Jobvite",
    state: "limited",
    reason:
      "Job pages carry JSON-LD. Whether Jobvite's terms cover jobs.jobvite.com is uncertain, so the crawl stays slow and small. The keyed API is not used.",
    termsUrl: "https://www.jobvite.com/terms-of-use/",
    allowPaths: ["/sitemap", "/job/"],
  },
  hibob: {
    platform: "HiBob",
    state: "link_only",
    reason:
      "HiBob's terms ban scraping, and the career host answers with a bot wall. That wall is not bypassed.",
    termsUrl: "https://www.hibob.com/privacy/terms-and-conditions/",
  },
  "job-board": {
    platform: "Job board",
    state: "link_only",
    reason: "Polish boards and LinkedIn forbid automated downloading. Outbound links only.",
    termsUrl: "https://justjoin.it/terms",
  },
}

export const HOST_POLICIES: Record<string, SourcePolicy> = {
  "jobs.gft.com": PLATFORM_POLICIES.successfactors,
  "jobs.sap.com": PLATFORM_POLICIES.sap,
  "career55.sapsf.eu": PLATFORM_POLICIES["successfactors-legacy"],
  "jobs.siemens.com": PLATFORM_POLICIES.siemens,
  "careers.phenom.com": PLATFORM_POLICIES["phenom-vendor"],
  "careers.mastercard.com": PLATFORM_POLICIES.phenom,
  "jobs.allegro.eu": {
    platform: "SuccessFactors",
    state: "limited",
    reason:
      "The public WordPress site may be read. Job inventory is on career55.sapsf.eu, whose robots.txt disallows /, so those pages are link-only.",
    termsUrl: "https://jobs.allegro.eu/",
    allowPaths: ["/sitemap", "/robots.txt", "/offer", "/"],
    denyPaths: ["/wp-admin/", "/wp-login"],
  },
}

export type CoverageEmployer = {
  employer: string
  platform: string
  boardId?: string
  policy: PolicyState
  reason: string
  termsUrl: string
  href?: string
}

export const COVERAGE_EMPLOYERS: CoverageEmployer[] = [
  {
    employer: "GFT",
    platform: "SuccessFactors",
    boardId: "jobs.gft.com",
    policy: "limited",
    reason: HOST_POLICIES["jobs.gft.com"].reason,
    termsUrl: HOST_POLICIES["jobs.gft.com"].termsUrl,
    href: "https://jobs.gft.com/",
  },
  {
    employer: "Allegro",
    platform: "SuccessFactors",
    boardId: "jobs.allegro.eu",
    policy: "limited",
    reason: HOST_POLICIES["jobs.allegro.eu"].reason,
    termsUrl: HOST_POLICIES["career55.sapsf.eu"].termsUrl,
    href: "https://jobs.allegro.eu/",
  },
  {
    employer: "SAP",
    platform: "SAP",
    boardId: "jobs.sap.com",
    policy: "link_only",
    reason: PLATFORM_POLICIES.sap.reason,
    termsUrl: SAP_TERMS,
    href: "https://jobs.sap.com/",
  },
  employer("Intive", "Workday", "intive/wd3/Intive", "https://intive.wd3.myworkdayjobs.com/Intive"),
  employer(
    "Motorola Solutions",
    "Workday",
    "motorolasolutions/wd5/Careers",
    "https://motorolasolutions.wd5.myworkdayjobs.com/Careers"
  ),
  employer(
    "Mastercard",
    "Workday",
    "mastercard/wd1/CorporateCareers",
    "https://mastercard.wd1.myworkdayjobs.com/CorporateCareers"
  ),
  employer("Visa", "Workday", "visa/wd5/Visa", "https://visa.wd5.myworkdayjobs.com/Visa"),
  employer(
    "Samsung (incl. SRPOL)",
    "Workday",
    "sec/wd3/Samsung_Careers",
    "https://sec.wd3.myworkdayjobs.com/Samsung_Careers"
  ),
  employer(
    "Thomson Reuters",
    "Workday",
    "thomsonreuters/wd5/External_Career_Site",
    "https://thomsonreuters.wd5.myworkdayjobs.com/External_Career_Site"
  ),
  {
    employer: "Mastercard (Phenom)",
    platform: "Phenom",
    policy: "limited",
    reason: PLATFORM_POLICIES.phenom.reason,
    termsUrl: PLATFORM_POLICIES.phenom.termsUrl,
    href: "https://careers.mastercard.com/",
  },
  {
    employer: "Phenom",
    platform: "Phenom",
    policy: "link_only",
    reason: PLATFORM_POLICIES["phenom-vendor"].reason,
    termsUrl: PLATFORM_POLICIES["phenom-vendor"].termsUrl,
    href: "https://careers.phenom.com/",
  },
  {
    employer: "Kingfisher (iCIMS)",
    platform: "iCIMS",
    policy: "limited",
    reason: PLATFORM_POLICIES.icims.reason,
    termsUrl: PLATFORM_POLICIES.icims.termsUrl,
    href: "https://careers-kingfisher2.icims.com/",
  },
  {
    employer: "Siemens",
    platform: "Avature",
    policy: "limited",
    reason: PLATFORM_POLICIES.siemens.reason,
    termsUrl: PLATFORM_POLICIES.siemens.termsUrl,
    href: "https://jobs.siemens.com/",
  },
  {
    employer: "Avature portals",
    platform: "Avature",
    policy: "limited",
    reason: PLATFORM_POLICIES.avature.reason,
    termsUrl: PLATFORM_POLICIES.avature.termsUrl,
  },
  {
    employer: "Oracle Recruiting Cloud",
    platform: "Oracle Recruiting Cloud",
    policy: "link_only",
    reason: PLATFORM_POLICIES.oracle.reason,
    termsUrl: PLATFORM_POLICIES.oracle.termsUrl,
    href: "https://jobs.nokia.com/",
  },
  {
    employer: "Taleo",
    platform: "Taleo",
    policy: "link_only",
    reason: PLATFORM_POLICIES.taleo.reason,
    termsUrl: PLATFORM_POLICIES.taleo.termsUrl,
  },
  {
    employer: "eRecruiter employer pages",
    platform: "eRecruiter",
    policy: "limited",
    reason: PLATFORM_POLICIES.erecruiter.reason,
    termsUrl: PLATFORM_POLICIES.erecruiter.termsUrl,
  },
  {
    employer: "eRecruiter (skk)",
    platform: "eRecruiter",
    policy: "link_only",
    reason: "skk.erecruiter.pl is a frame without JSON-LD. Link out.",
    termsUrl: "https://skk.erecruiter.pl/",
    href: "https://skk.erecruiter.pl/",
  },
  {
    employer: "Jobvite",
    platform: "Jobvite",
    policy: "limited",
    reason: PLATFORM_POLICIES.jobvite.reason,
    termsUrl: PLATFORM_POLICIES.jobvite.termsUrl,
    href: "https://jobs.jobvite.com/",
  },
  {
    employer: "HiBob",
    platform: "HiBob",
    policy: "link_only",
    reason: PLATFORM_POLICIES.hibob.reason,
    termsUrl: PLATFORM_POLICIES.hibob.termsUrl,
  },
]

function employer(name: string, platform: string, boardId: string, href: string): CoverageEmployer {
  return {
    employer: name,
    platform,
    boardId,
    policy: "limited",
    reason: PLATFORM_POLICIES.workday.reason,
    termsUrl: WORKDAY_TERMS,
    href,
  }
}

const WORKDAY_HOSTS = ["myworkdayjobs.com", "myworkdaysite.com", "myworkday.com"]
const BOARD_HOSTS = [
  "justjoin.it",
  "nofluffjobs.com",
  "pracuj.pl",
  "theprotocol.it",
  "bulldogjob.pl",
  "linkedin.com",
]

function hostMatches(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`)
}

export function platformKeyForHost(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "")
  if (HOST_POLICIES[host]) return null
  if (host === "jobs.sap.com") return "sap"
  if (host === "careers.phenom.com" || host.endsWith(".phenom.com")) return "phenom-vendor"
  if (WORKDAY_HOSTS.some((suffix) => hostMatches(host, suffix))) return "workday"
  if (BOARD_HOSTS.some((suffix) => hostMatches(host, suffix))) return "job-board"
  if (hostMatches(host, "sapsf.eu") || hostMatches(host, "sapsf.com"))
    return "successfactors-legacy"
  if (hostMatches(host, "successfactors.eu") || hostMatches(host, "successfactors.com"))
    return "successfactors-legacy"
  if (hostMatches(host, "taleo.net")) return "taleo"
  if (hostMatches(host, "oraclecloud.com") || host === "jobs.nokia.com") return "oracle"
  if (hostMatches(host, "icims.com")) return "icims"
  if (hostMatches(host, "avature.net")) return "avature"
  if (host === "jobs.siemens.com") return "siemens"
  if (hostMatches(host, "erecruiter.pl")) return "erecruiter"
  if (host === "jobs.jobvite.com" || hostMatches(host, "jobvite.com")) return "jobvite"
  if (host === "careers.hibob.com" || host.endsWith(".careers.hibob.com")) return "hibob"
  return null
}

export type FetchDecision = {
  allow: boolean
  state: PolicyState
  platform: string
  reason: string
}

function pathBlocked(pathAndQuery: string, policy: SourcePolicy): boolean {
  const haystack = pathAndQuery.toLowerCase()
  return (policy.denyPaths ?? []).some((prefix) => haystack.includes(prefix.toLowerCase()))
}

function pathAllowed(pathAndQuery: string, policy: SourcePolicy): boolean {
  const haystack = pathAndQuery.toLowerCase()
  return (policy.allowPaths ?? []).some((prefix) => haystack.includes(prefix.toLowerCase()))
}

export function decideFetch(url: URL): FetchDecision {
  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  if (host === "skk.erecruiter.pl" || host === "form.erecruiter.pl") {
    const policy = {
      ...PLATFORM_POLICIES.erecruiter,
      state: "link_only" as const,
      reason: "skk and form hosts have no JSON-LD. Link out.",
    }
    if (url.pathname === "/robots.txt") {
      return { allow: true, state: "link_only", platform: "eRecruiter", reason: policy.reason }
    }
    return { allow: false, state: "link_only", platform: "eRecruiter", reason: policy.reason }
  }
  const override = HOST_POLICIES[host]
  const platformKey = override ? null : platformKeyForHost(host)
  const policy = override ?? (platformKey ? PLATFORM_POLICIES[platformKey] : undefined)
  if (!policy) {
    return { allow: true, state: "enabled", platform: "public", reason: "No source restriction" }
  }
  if (url.pathname === "/robots.txt") {
    return { allow: true, state: policy.state, platform: policy.platform, reason: policy.reason }
  }
  const pathAndQuery = `${url.pathname}${url.search}`
  if (pathBlocked(pathAndQuery, policy)) {
    return { allow: false, state: policy.state, platform: policy.platform, reason: policy.reason }
  }
  if (policy.state === "link_only") {
    return { allow: false, state: policy.state, platform: policy.platform, reason: policy.reason }
  }
  if (policy.state === "limited") {
    const allowed = pathAllowed(pathAndQuery, policy)
    return { allow: allowed, state: policy.state, platform: policy.platform, reason: policy.reason }
  }
  return { allow: true, state: policy.state, platform: policy.platform, reason: policy.reason }
}
