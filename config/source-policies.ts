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

const CAREER_ALLOW = [
  "/sitemap",
  "/jobs.feed.json",
  "/llms.txt",
  "/job/",
  "/jobs/",
  "/job-offer",
  "/job-offers",
  "/oferta-pracy",
  "/oferty-pracy",
  "/vacancy",
  "/careers",
  "/career",
  "/positions",
]

const CAREER_DENY = ["/api/", "/wp-admin/", "/wp-login", "/wp-json/"]

export const SMARTRECRUITERS_API_REASON =
  "The public Posting API stays on while a policy decision is pending. api.smartrecruiters.com robots.txt allows LinkedInBot on /v1/companies/ and disallows every other crawler. Set SMARTRECRUITERS_POSTING_API=off to stop those calls. jobs.smartrecruiters.com pages stay allowed."

function careerPolicy(state: PolicyState, reason: string, termsUrl: string): SourcePolicy {
  return {
    platform: "Career site",
    state,
    reason,
    termsUrl,
    allowPaths: CAREER_ALLOW,
    denyPaths: CAREER_DENY,
  }
}

function linkOnly(platform: string, reason: string, termsUrl: string): SourcePolicy {
  return { platform, state: "link_only", reason, termsUrl }
}

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
      "Oracle.com terms ban robots and scrapers. Nokia publishes /sitemaps/sitemapIndex, and the verdict stays link-only.",
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
      "Employer domains: the /widgets JSON (refineSearch, jobDetail), sitemap and JSON-LD. Apply, job cart, and chatbot paths are skipped.",
    termsUrl: "https://www.phenom.com/terms--conditions",
    allowPaths: ["/sitemap", "/job/", "/jobs/", "/widgets"],
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
    reason:
      "Career Sites Builder pages ({slug}.pracujunas.pl) publish offers.json on offers.erecruiter.pl, and the skk.erecruiter.pl widget lists offer rows and Offer.aspx pages; neither host has a robots.txt disallow (checked 2026-10-31). system.erecruiter.pl apply forms disallow / and stay link-only.",
    termsUrl: "https://erecruiter.pl/",
    allowPaths: ["/careers", "/career", "/jobs/", "/job/", "/skk/company/", "/GetHtml.ashx", "/Offer.aspx"],
    denyPaths: ["/FormTemplates/", "/RecruitmentForm"],
  },
  jobvite: {
    platform: "Jobvite",
    state: "limited",
    reason:
      "The /{slug}/jobs listing and job pages (JSON-LD). Whether Jobvite's terms cover jobs.jobvite.com is uncertain, so the crawl stays slow and small. The keyed API is not used.",
    termsUrl: "https://www.jobvite.com/terms-of-use/",
    allowPaths: ["/sitemap", "/job/", "/jobs"],
  },
  hibob: {
    platform: "HiBob",
    state: "link_only",
    reason:
      "HiBob's terms ban scraping, and the career host answers with a bot wall. That wall is not bypassed.",
    termsUrl: "https://www.hibob.com/privacy/terms-and-conditions/",
  },
  peopleforce: {
    platform: "PeopleForce",
    state: "link_only",
    reason:
      "PeopleForce robots.txt disallows / for every crawler. Use the employer's own listing page. Detail links stay link-outs.",
    termsUrl: "https://peopleforce.io/",
  },
  join: {
    platform: "JOIN",
    state: "link_only",
    reason:
      "JOIN's company terms ban access through any automated system. Nothing is fetched.",
    termsUrl: "https://join.com/en/terms",
  },
  dynatrace: {
    platform: "Dynatrace",
    state: "link_only",
    reason:
      "Dynatrace terms ban robots and crawlers on the site and associated sites. The career site is not fetched.",
    termsUrl: "https://www.dynatrace.com/company/trust-center/terms-of-use/",
  },
  revolut: {
    platform: "Revolut",
    state: "link_only",
    reason:
      "robots.txt allows /careers/, and every other URL returns 403. That wall is not bypassed. Link out from site:revolut.com/careers/position.",
    termsUrl: "https://revolut.com/",
  },
  oviva: {
    platform: "Oviva",
    state: "link_only",
    reason: "oviva.com returns 403 to the crawler. That wall is not bypassed.",
    termsUrl: "https://oviva.com/",
  },
  codility: {
    platform: "Codility",
    state: "link_only",
    reason:
      "The WordPress careers endpoint currently errors, and the HiBob host is a bot wall. Re-check later. Nothing is fetched.",
    termsUrl: "https://codility.com/",
  },
  "future-processing": {
    platform: "Future Processing",
    state: "link_only",
    reason:
      "The public listing returns an error and no job URLs. Unresolved, so it stays link-only.",
    termsUrl: "https://kariera.future-processing.pl/",
  },
  notion: {
    platform: "Notion",
    state: "link_only",
    reason:
      "Public Notion pages are a JavaScript shell. The public API needs an owner token. Link-only.",
    termsUrl: "https://www.notion.so/terms",
  },
  jpmorgan: {
    platform: "JPMorganChase",
    state: "link_only",
    reason:
      "careers.jpmorgan.com has no job links, and the Oracle pod answers 403. Oracle terms also ban robots.",
    termsUrl: "https://www.oracle.com/legal/terms.html",
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
  "careers.allegro.eu": {
    ...PLATFORM_POLICIES.successfactors,
    reason:
      "Career Site Builder on careers.allegro.eu lists 288 jobs in the sitemap, with microdata on /job/ pages. Allowed with limits. career55.sapsf.eu stays link-only because its robots.txt disallows /. jobs.allegro.eu has no job inventory.",
    termsUrl: "https://careers.allegro.eu/",
  },
  "jobs.allegro.eu": linkOnly(
    "SuccessFactors",
    "The WordPress site has no job inventory. Offers are on careers.allegro.eu.",
    "https://jobs.allegro.eu/"
  ),
  "www.pracujwgp.pl": careerPolicy(
    "enabled",
    "Published jobs.feed.json DataFeed. Daily. Item URLs on skk.erecruiter.pl are stored and not fetched.",
    "https://www.pracujwgp.pl/"
  ),
  "pracujwgp.pl": careerPolicy(
    "enabled",
    "Published jobs.feed.json DataFeed. Daily. Item URLs on skk.erecruiter.pl are stored and not fetched.",
    "https://www.pracujwgp.pl/"
  ),
  "sii.pl": careerPolicy(
    "limited",
    "Sitemap and JSON-LD on /oferty-pracy/ pages. Allowed with limits. datePosted can be evergreen.",
    "https://sii.pl/"
  ),
  "www.sii.pl": careerPolicy(
    "limited",
    "Sitemap and JSON-LD on /oferty-pracy/ pages. Allowed with limits. datePosted can be evergreen.",
    "https://sii.pl/"
  ),
  "careers.zabkagroup.com": careerPolicy(
    "limited",
    "Sitemap and JSON-LD on job pages. Allowed with limits. About 118 roles, mostly retail and logistics.",
    "https://careers.zabkagroup.com/"
  ),
  "bolt.eu": careerPolicy(
    "limited",
    "The positions listing and job HTML on bolt.eu are allowed with limits. The careers sitemap is slightly stale, so the listing is the source.",
    "https://bolt.eu/en/careers/positions/"
  ),
  "www.bolt.eu": careerPolicy(
    "limited",
    "The positions listing and job HTML on bolt.eu are allowed with limits. The careers sitemap is slightly stale, so the listing is the source.",
    "https://bolt.eu/en/careers/positions/"
  ),
  "career.comarch.com": careerPolicy(
    "limited",
    "Sitemap job-offer pages are HTML without JSON-LD. Allowed with limits. The visible total was not published.",
    "https://career.comarch.com/"
  ),
  "careers.epam.com": careerPolicy(
    "limited",
    "Sitemap and JSON-LD on /en/vacancy/ are allowed with limits. The sitemap has thousands of URLs and the public listing showed about 225, so the sitemap count is not the live total.",
    "https://careers.epam.com/"
  ),
  "kariera.wp.pl": careerPolicy(
    "limited",
    "The listing page is allowed with limits. Offer links point at skk.erecruiter.pl and are stored as link-outs. Those detail pages are not fetched.",
    "https://kariera.wp.pl/oferty-pracy"
  ),
  "packhelp.com": careerPolicy(
    "limited",
    "The listing page is allowed with limits. PeopleForce detail hosts disallow crawlers, so those links stay link-outs.",
    "https://packhelp.com/career/"
  ),
  "www.packhelp.com": careerPolicy(
    "limited",
    "The listing page is allowed with limits. PeopleForce detail hosts disallow crawlers, so those links stay link-outs.",
    "https://packhelp.com/career/"
  ),
  "brand24.com": careerPolicy(
    "limited",
    "Own-domain WordPress pages under /careers/ are allowed with limits. brand24.peopleforce.io stays link-only.",
    "https://brand24.com/careers/"
  ),
  "www.brand24.com": careerPolicy(
    "limited",
    "Own-domain WordPress pages under /careers/ are allowed with limits. brand24.peopleforce.io stays link-only.",
    "https://brand24.com/careers/"
  ),
  "synerise.com": careerPolicy(
    "limited",
    "Partial. Job pages at /careers/{slug} have JSON-LD and may be fetched. The listing API /api/cms/job-postings is disallowed by robots.txt, so openings are discovered from web search.",
    "https://www.synerise.com/careers"
  ),
  "www.synerise.com": careerPolicy(
    "limited",
    "Partial. Job pages at /careers/{slug} have JSON-LD and may be fetched. The listing API /api/cms/job-postings is disallowed by robots.txt, so openings are discovered from web search.",
    "https://www.synerise.com/careers"
  ),
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
    boardId: "careers.allegro.eu",
    policy: "limited",
    reason: HOST_POLICIES["careers.allegro.eu"].reason,
    termsUrl: HOST_POLICIES["careers.allegro.eu"].termsUrl,
    href: "https://careers.allegro.eu/",
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
  coverageHost("Grupa Pracuj", "www.pracujwgp.pl", "https://www.pracujwgp.pl/jobs.feed.json"),
  coverageHost("Sii Polska", "sii.pl", "https://sii.pl/oferty-pracy"),
  coverageHost("Żabka Group", "careers.zabkagroup.com", "https://careers.zabkagroup.com/"),
  coverageHost("Bolt", "bolt.eu", "https://bolt.eu/en/careers/positions/"),
  coverageHost("Comarch", "career.comarch.com", "https://career.comarch.com/"),
  coverageHost("EPAM", "careers.epam.com", "https://careers.epam.com/"),
  coverageHost("Wirtualna Polska", "kariera.wp.pl", "https://kariera.wp.pl/oferty-pracy"),
  coverageHost("Packhelp", "packhelp.com", "https://packhelp.com/career/"),
  coverageHost("Brand24", "brand24.com", "https://brand24.com/careers/"),
  coverageHost("Synerise", "www.synerise.com", "https://www.synerise.com/careers"),
  {
    employer: "Callstack",
    platform: "Recruitee",
    boardId: "callstackpl",
    policy: "enabled",
    reason:
      "Public offers API at callstackpl.recruitee.com. A token is required from 10 February 2027.",
    termsUrl: "https://recruitee.com/terms",
    href: "https://callstackpl.recruitee.com/",
  },
  {
    employer: "Nokia",
    platform: "Oracle Recruiting Cloud",
    policy: "link_only",
    reason: PLATFORM_POLICIES.oracle.reason,
    termsUrl: PLATFORM_POLICIES.oracle.termsUrl,
    href: "https://jobs.nokia.com/",
  },
  {
    employer: "Dynatrace",
    platform: "Dynatrace",
    policy: "link_only",
    reason: PLATFORM_POLICIES.dynatrace.reason,
    termsUrl: PLATFORM_POLICIES.dynatrace.termsUrl,
    href: "https://careers.dynatrace.com/",
  },
  {
    employer: "Codility",
    platform: "Codility",
    policy: "link_only",
    reason: PLATFORM_POLICIES.codility.reason,
    termsUrl: PLATFORM_POLICIES.codility.termsUrl,
    href: "https://codility.com/careers",
  },
  {
    employer: "Oviva",
    platform: "Oviva",
    policy: "link_only",
    reason: PLATFORM_POLICIES.oviva.reason,
    termsUrl: PLATFORM_POLICIES.oviva.termsUrl,
    href: "https://oviva.com/careers/",
  },
  {
    employer: "Revolut",
    platform: "Revolut",
    policy: "link_only",
    reason: PLATFORM_POLICIES.revolut.reason,
    termsUrl: PLATFORM_POLICIES.revolut.termsUrl,
    href: "https://revolut.com/careers/",
  },
  {
    employer: "Future Processing",
    platform: "Future Processing",
    policy: "link_only",
    reason: PLATFORM_POLICIES["future-processing"].reason,
    termsUrl: PLATFORM_POLICIES["future-processing"].termsUrl,
    href: "https://kariera.future-processing.pl/oferty-pracy/",
  },
  {
    employer: "Saleor",
    platform: "Notion",
    policy: "link_only",
    reason: PLATFORM_POLICIES.notion.reason,
    termsUrl: PLATFORM_POLICIES.notion.termsUrl,
    href: "https://saleor.notion.site/open-positions",
  },
  {
    employer: "Billtech",
    platform: "Notion",
    policy: "link_only",
    reason: PLATFORM_POLICIES.notion.reason,
    termsUrl: PLATFORM_POLICIES.notion.termsUrl,
    href: "https://billtech.notion.site/",
  },
  {
    employer: "JPMorganChase",
    platform: "JPMorganChase",
    policy: "link_only",
    reason: PLATFORM_POLICIES.jpmorgan.reason,
    termsUrl: PLATFORM_POLICIES.jpmorgan.termsUrl,
    href: "https://careers.jpmorgan.com/",
  },
  {
    employer: "PeopleForce",
    platform: "PeopleForce",
    policy: "link_only",
    reason: PLATFORM_POLICIES.peopleforce.reason,
    termsUrl: PLATFORM_POLICIES.peopleforce.termsUrl,
  },
  {
    employer: "SmartRecruiters Posting API",
    platform: "SmartRecruiters",
    boardId: "smartrecruiters-api",
    policy: "enabled",
    reason: SMARTRECRUITERS_API_REASON,
    termsUrl: "https://www.smartrecruiters.com/legal/terms-of-use/",
    href: "https://developers.smartrecruiters.com/docs/posting-api",
  },
]

function coverageHost(employer: string, host: string, href: string): CoverageEmployer {
  const policy = HOST_POLICIES[host]
  return {
    employer,
    platform: policy.platform,
    boardId: host,
    policy: policy.state,
    reason: policy.reason,
    termsUrl: policy.termsUrl,
    href,
  }
}

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
  if (hostMatches(host, "peopleforce.io")) return "peopleforce"
  if (hostMatches(host, "join.com")) return "join"
  if (hostMatches(host, "dynatrace.com")) return "dynatrace"
  if (hostMatches(host, "revolut.com")) return "revolut"
  if (hostMatches(host, "oviva.com")) return "oviva"
  if (host === "codility.com" || host.endsWith(".codility.com")) return "codility"
  if (hostMatches(host, "future-processing.pl")) return "future-processing"
  if (hostMatches(host, "notion.site") || hostMatches(host, "notion.so")) return "notion"
  if (hostMatches(host, "jpmorgan.com") || hostMatches(host, "jpmorganchase.com")) return "jpmorgan"
  return null
}

/** Default on. SMARTRECRUITERS_POSTING_API=off, false, or 0 disables the Posting API. */
export function smartRecruitersPostingApiEnabled(): boolean {
  const raw = (process.env.SMARTRECRUITERS_POSTING_API ?? "on").trim().toLowerCase()
  return raw !== "off" && raw !== "false" && raw !== "0"
}

export function coverageRows(): CoverageEmployer[] {
  const apiOn = smartRecruitersPostingApiEnabled()
  return COVERAGE_EMPLOYERS.map((row) => {
    if (row.boardId !== "smartrecruiters-api") return row
    return { ...row, policy: apiOn ? "enabled" : "link_only" }
  })
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
  if (host === "api.smartrecruiters.com") {
    const enabled = smartRecruitersPostingApiEnabled()
    if (url.pathname === "/robots.txt" || enabled) {
      return {
        allow: true,
        state: enabled ? "enabled" : "link_only",
        platform: "SmartRecruiters",
        reason: SMARTRECRUITERS_API_REASON,
      }
    }
    return {
      allow: false,
      state: "link_only",
      platform: "SmartRecruiters",
      reason: SMARTRECRUITERS_API_REASON,
    }
  }
  if (host === "form.erecruiter.pl" || host === "system.erecruiter.pl") {
    const reason = "Apply-form hosts disallow crawling in robots.txt. Link out."
    if (url.pathname === "/robots.txt") {
      return { allow: true, state: "link_only", platform: "eRecruiter", reason }
    }
    return { allow: false, state: "link_only", platform: "eRecruiter", reason }
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
