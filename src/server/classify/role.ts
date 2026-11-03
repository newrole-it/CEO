import { detectSeniority, normalizeTitle } from "../../../matching/normalization"
import { SENIORITY_RANK, type Seniority } from "../../../matching/types"
import { fold } from "../../../matching/text"

export type TechVerdict = boolean | null

/**
 * IT work named outright. Checked first, so a word from OUT in the same title ("Sales Engineer",
 * "Logistics Software Engineer", "Marketing Data Engineer") does not throw an IT role away.
 */
const STRONG_IN: RegExp[] = [
  // ERP and CRM consulting is IT even when the module is finance ("Dynamics 365 F&O Finance Lead
  // Consultant" at HSO, "Finance Consultant – Microsoft Dynamics 365 FSCM" at Xalution, 2026-11-03).
  /^(?!.*\b(sales|account|business development|recruit\w*)\b).*\b(dynamics 365|d365|dynamics ax|navision|business central|sap|salesforce|servicenow|netsuite|oracle (fusion|ebs|cloud))\b.*\b(consultant|developer|architect|administrator|analyst|engineer|lead|expert)\b/,
  /^(?!.*\b(sales|account|business development|recruit\w*)\b).*\b(consultant|developer|architect|administrator|analyst|engineer|lead|expert)\b.*\b(dynamics 365|d365|dynamics ax|navision|business central|sap|salesforce|servicenow|netsuite|oracle (fusion|ebs|cloud))\b/,
  // Polish titles: "Ekspert ds. Cyberbezpieczeństwa", "Analityk Biznesowo-Systemowy".
  /\b(cyberbezpieczenstw\w*|bezpieczenstw\w* (it|ict|informacji|systemow\w*)|analityk\w* (biznesowo-systemow\w*|systemowo-biznesow\w*|it|danych)|biznesowo-systemow\w*)\b/,
  /\b(it-systeme\w*|informatik\w*|fachinformatiker\w*|product management|threat detection)\b/,
  /\b(developpeur|desarrollador|desarrolladora|desenvolvedor|desenvolvedora|entwickler|entwicklerin|softwareentwickler\w*|anwendungsentwickler\w*|webentwickler\w*|sviluppatore|ontwikkelaar|utvecklare|programmeur|programador|programadora)\b/,
  /\b(software|backend|back-end|frontend|front-end|full ?stack|full-stack|mobile|web|ios|android|game|embedded|firmware|devops|devsecops|cloud|platform|infrastructure|site reliability|reliability|security|network|systems?|data|analytics|bi|etl|machine learning|ml|ai|mlops|llm|qa|test|automation|sdet|database|integration|api|application|salesforce|sap|servicenow) (engineer|engineering|developer|programmer|architect|administrator|analyst|scientist|tester|consultant|specialist|lead|manager)\b/,
  /\b(developers?|programmers?|programista|programistka|deweloper|software engineers?|sdet|devops|sre)\b/,
  /\b(sales engineer|presales engineer|pre-sales engineer|presales consultant|pre-sales consultant|solutions? engineer|solutions? architect|forward deployed engineer|customer success engineer|technical account manager|support engineer|technical support|it support|service desk|help ?desk)\b/,
  /\b(it|ict|technical|technology|software|engineering) (project|program|programme|delivery|release|service|change) (manager|lead|coordinator|director|owner)\b/,
  /\b(it|ict) (director|manager|lead|specialist|analyst|consultant|administrator|auditor|architect|engineer|coordinator|officer|operations|security|infrastructure)\b/,
  /\b(head|director|vp|vice president|svp|evp),? (of )?(engineering|technology|software|it|data|security|infrastructure|platform|product|ai|machine learning|cloud|devops|quality|qa|information technology|information security)\b/,
  /\b(engineering manager|engineering director|engineering lead|tech lead|technical lead|team lead,? (engineering|software|data|qa|devops))\b/,
  /\b(cto|cio|ciso|cdo|cpo|chief technology|chief information|chief data|chief product|chief digital|chief ai)\b/,
  /\b(information security|cyber ?security|it security|data protection officer)\b/,
  /\b(business analyst|systems analyst|system analyst|analityk biznesowy|analityk systemowy|business intelligence|data warehouse|dba|database administrator)\b/,
  /\b(scrum master|agile coach|product owner|product manager|technical program manager|technical project manager|technical writer)\b/,
]

/** Engineering outside IT. An "engineer" here is not a software or systems role. */
const NON_IT_ENGINEERING =
  /\b(mechanical|mechanical design|civil|structural|chemical|process|manufacturing|maintenance|hvac|piping|geotechnical|environmental|biomedical|petroleum|mining|construction|plant|facilities|field service|traffic|water|wastewater|building|cost|estimating|welding|tooling|packaging|solar|pv|battery|battery modeling|regulatory|permitting|composites|industrial|fire protection|hse|ehs|health and safety|equipment|equipment reliability|laser|fluids|propulsion|harness|marine|irrigation|energy|meter) (engineer|engineering|technician|inzynier)\b/

/**
 * Electrical and hardware engineering: outside IT by the product's rule (2026-11-03). Firmware and
 * embedded software stay IT; they name software. "Hardware Test Engineer" and "Avionics Systems
 * Engineer" would otherwise pass as a test or systems engineer.
 */
const HARDWARE_ENGINEERING =
  /\b((electrical|electronics|hardware|pcb|analog|analogue|mixed[- ]signal|rf|microwave|antenna|fpga|asic|rtl|silicon|chip|soc design|semiconductor|design verification|physical design|avionics|mechatronics?|(?<!security |it |cyber )controls|plc|instrumentation|photonics|optical|optics)( \S+){0,2}|power( systems| electronics)?) (engineer|engineering|designer|architect|developer|inzynier)\b/

/** A title naming software work beside hardware ("RF Software Engineer") is decided as IT work. */
const SOFTWARE_WORK =
  /\b(software|firmware|security|network|networking|devops|backend|frontend|full ?stack|web|it)\b/

function isHardwareEngineering(text: string): boolean {
  return HARDWARE_ENGINEERING.test(text) && !SOFTWARE_WORK.test(text)
}

/**
 * Design is IT when it is for the web, apps, 3D or games, and not otherwise (product rule,
 * 2026-11-03). A title naming both ("Web Graphic Designer", "Motion Designer / 3D Artist") is in.
 */
const DESIGN_WORD = /\b(designer|designers|design|artist|modeler|modeller|animator|animators)\b/
const DIGITAL_DESIGN_WORD =
  /\b(web|website|webflow|webdesign|webdesigner|ui|ux|user experience|user interface|app|apps|mobile|interaction|3d|game|games|gameplay|cinematic|mocap|motion capture)\b/

function isDigitalDesign(text: string): boolean {
  return DESIGN_WORD.test(text) && DIGITAL_DESIGN_WORD.test(text)
}

/** Roles outside IT whose title also names an IT word. Checked before STRONG_IN. */
const NOT_IT_DESPITE_IT_WORD =
  /\b(business developer|business development|account executive|public relations|physical security|ingenieure? commerciale?|ingenieure? d.affaires|plc|automatyk\w*|marketing automation|landscape architect\w*|venture architect|cfd|injection mold\w*|injection mould\w*|licensed aircraft|aircraft maintenance|ai trainers?|data annotat\w*|annotators?|data label\w*|data collection contributor|audio recording project|training content developer|instructional developer|filmmaker|medical image (review|evaluation)|content specialist|(?<!technical )((partner|key|strategic) )?account manager)\b/

/** Checked before a tech-function match. A non-tech role stays out even at a tech company. */
const OUT: RegExp[] = [
  NON_IT_ENGINEERING,
  /\b(security guard|ochroniarz|ochrona fizyczna)\b/,
  /\b(store associate|sales associate|shop assistant|store manager|shop manager|kierownik sklepu|cashier|kasjer|kasjerka|sprzedawca|sprzedawczyni|retail|merchandiser)\b/,
  /\b(warehouse|magazynier|forklift|order picker|kompletacj)\b/,
  /\b(truck driver|delivery driver|courier|kurier|kierowca)\b/,
  /\b(waiter|waitress|bartender|chef|cook|kucharz|kelner|housekeeper|receptionist|recepcjon|restaurant|hotel manager|kierownik restauracji)\b/,
  /\b(construction|bricklayer|carpenter|plumber|welder|electrician|site manager|kierownik budowy|murarz|budow)\b/,
  /\b(fashion designer|interior designer|fashion design|interior design|projektant wnetrz|projektantka wnetrz|projektant mody|projektantka mody)\b/,
  // Design outside web, apps, 3D and games is not IT (product rule, 2026-11-03).
  /\b(graphic|graphics|brand|branding|creative|visual|motion|sound|audio|multimedia|communications|production|print|packaging|industrial|furniture|textile|jewelry|jewellery|footwear|landscape|lighting|kitchen|exhibition|instructional|learning|presentation|marketing|social|editorial|layout|signage|mechanical|cad|solidworks|structural|electrical|hardware|pcb|floral|garden|retail|store|merchandise) (designer|designers|design|design lead|design manager)\b/,
  /\b(grafik|graficzka|graphiste|grafikdesigner\w*|mediengestalter\w*|illustrator|art director|creative director|design director|cad designer|cad technician|draftsman|draughtsman|drafter)\b/,
  /\b(recruiter|recruit\w*|talent acquisition|talent partner|sourcer|human resources|people partner|hr business|rekruter|rekrutacj\w*)\b/,
  /\b(head of|director of|vp of) (people|sales|hr|human resources|finance|legal|talent|marketing|revenue)\b/,
  /\b(account executive|account excecutive|account manager|account management|account development|strategic account|business development|new business|\bbdr\b|\bsdr\b|\bbdm\b|handlowiec|sprzedaz\w*|representative)\b/,
  /\bsales\b/,
  /\b(accountant|bookkeeper|\bcfo\b|chief financial|finance manager|financial|finance|billing|pricing|ksiegow|kontroler finansow)\b/,
  /\b(lawyer|attorney|counsel|prawnik|radca prawny)\b/,
  /\b(chief marketing|\bcmo\b|\bpmm\b|marketing)\b/,
  /\b(people generalist|people partner|people operations|people ops|people team)\b/,
  /\b(customer support|customer service|customer success|call center|obsluga klienta)\b/,
  /\b(data entry|wprowadzanie danych)\b/,
  /\b(nurse|nursing|pielegniar\w*|physician|doctor|lekarz|surgeon|dentist|dental|pharmacist|pharmacy|farmaceut\w*|therapist|physiotherap\w*|fizjoterapeut\w*|psycholog\w*|caregiver|care assistant|care worker|carer|opiekun\w*|medical assistant|patient care|midwife|paramedic|radiograph\w*|veterinar\w*|optometrist|phlebotom\w*|sonographer|cna|rn|lpn)\b/,
  /\b(teacher|nauczyciel\w*|tutor|lecturer|professor|teaching assistant|nanny|childcare|preschool|kindergarten)\b/,
  /\b(receptionist|secretary|sekretar\w*|administrative assistant|office assistant|office manager|executive assistant|personal assistant|asystent\w* biura)\b/,
  /\b(cleaner|janitor|housekeeping|sprzataj\w*|barista|dishwasher|food server|banquet server|hostess|crew member|team member|valet|porter|concierge|lifeguard|security officer)\b/,
  /\b(mechanic|technician (hvac|automotive)|machinist|machine operator|forklift operator|production operator|equipment operator|assembler|packer|labourer|laborer|electrician|plumber|painter|roofer|installer|foreman|pracownik produkcji|operator maszyn)\b/,
  /\b(real estate|insurance agent|loan officer|bank teller|teller|underwriter|claims adjuster|paralegal|legal assistant|notary)\b/,
  /\b(grocery|logistic|logistics|onboarding|transport|commercial manager|commercio|vendas|procurement|category management)\b/,
  // Seen among undecided titles in the outside board catalog, 2026-11-03.
  /\b(zahnarzt\w*|arzt|arztin|zahnmedizin\w*|pflege\w*|krankenpfleg\w*|horakustik\w*|optiek\w*|optician|opticien|infirmier\w*|enfermer\w*|verpleeg\w*|medical science liaison|medical affairs|clinical trial\w*|biopharm\w*|immunolog\w*)\b/,
  /\b(monteur\w*|\w+monteur|mechaniker\w*|zerspanung\w*|werkzeugmechanik\w*|kraanmachinist|productiemedewerker|medewerker productie|productie|werkvoorbereider|installateur|pipefitter|material handler|cycle counter|kitting|superintendent|bauingenieur\w*|tiefbau|hochbau|anlagenplaner\w*|gebaudetechnik)\b/,
  /\b(chauffeur|livreur|fahrer\w*|bezorger|safety driver|driver ?\/|data collector|data collection driver|cargo bike|rider)\b/,
  /\b(test operator|flight test operator|safety operator|vehicle operator)\b/,
  /\b(butik\w*|saljare|verkaufer\w*|vendeur\w*|vendedor\w*|preventista|promotor\w*)\b/,
  /\b(maestro|maestra|lehrer\w*|leraar|enseignant\w*|docent)\b/,
  /\b(accounts payable|accounts receivable|fp ?& ?a|contable|contabilidad|comptable|buchhalt\w*|payroll specialist|treasury|tax (manager|specialist|analyst|advisor)|financial controller|controlling)\b/,
  /\b(solicitor|conveyanc\w*|abogad\w*|rechtsanwalt\w*|juriste|legal counsel|compliance officer|regulatory compliance|compliance analyst|kyc analyst|aml analyst|claims (officer|handler|adjuster))\b/,
  /\b(compensation|reward specialist|global reward|people business partner|talent operations|\bhr\b|learning (&|and) development|training coordinator)\b/,
  /\b(campaign manager|brand manager|demand generation|content creation|video editor|events coordinator|community (lead|manager)|partnerships?|partner (manager|development)|renewals|deal desk|revenue enablement|gtm enablement|commercial lead|market insights|search engine optimization|seo (manager|specialist)|trader|investor relations|relationship manager)\b/,
  /\b(comercial|social media|content creator|equity research|industrializacion|industrialisation|surveyor|refrigeration|refrigeracion|etudes et methodes|genie civil|environmental|facilities|architectural|civil|materials|manufacturing|licensing|regulatory|marketer|founder'?s associate)\b/,
  /\b(pharmacovigilance|gvp)\b/,
  /\b(chief of staff|office of (the )?ceo|guest operations|supply chain|demand (&|and) supply|demand planning|supply planning|purchaser|purchasing|commodity supply|document control|records manager|lab manager|lab technician|laboratory|research technician|industriekaufleute|kaufmann|kauffrau|auftragsmanagement|bancari\w*|back office)\b/,
]

/**
 * Engineering, product, data, design, IT operations, QA, and security engineering. Any seniority.
 * "Engineer" alone is not here: on boards less than half IT it named bridges, wastewater, HVAC
 * and factory quality far more often than software (7,050 open offers, catalog sample 2026-11-03).
 * The board decides it, as it does "Project Manager" (src/server/jobs/gate.ts).
 */
const IN: RegExp[] = [
  /\b(software|developer|programmer|programista|programistka|deweloper|logiciel|informatique)\b/,
  /\b(devops|sre|site reliability|backend|frontend|front-end|back-end|full stack|fullstack|full-stack|\bios\b|\bandroid\b)\b/,
  /\b(data engineer|data scientist|data analyst|analityk danych|analityczka danych|machine learning|ml engineer|data platform|analytics engineer)\b/,
  /\b(product manager|product owner|head of product|director of product|ux|ui|user experience|user interface)\b/,
  /\b(web|website|webdesign|webdesigner|app|mobile|interaction|ux|ui|game|level|narrative designer|3d|technical) (designer|design)\b/,
  /\b(webdesigner|webdesign|3d (artist|modeler|modeller|modelling|modeling|generalist|animator)|(game|environment|character|prop|vfx|technical) artist|game designer|gameplay designer|level designer|projektant\w* (ux|ui|stron|www|gier)|grafik 3d|modelarz 3d)\b/,
  /\b(solution|solutions|network|system|systems|database|cloud|api) designer\b/,
  /\b(quality assurance|test engineer|sdet|tester|qa)\b/,
  /\b(security engineer|cybersecurity|cyber security|appsec|infosec|devsecops|soc analyst|security operations center)\b/,
  /\b(architect|architekt)\b/,
  /\b(sysadmin|system administrator|administrator systemow|infrastructure engineer|cloud engineer|platform engineer|it support|it operations|it ops|informatyk)\b/,
  /\b(scrum master|agile coach|technical writer)\b/,
  /\b(cto|cio|cpo|chief technology|chief information officer|chief product|chief data)\b/,
  /\b(network administrator|administrator sieci|helpdesk|wsparcie it|kierownik projektow it|kierownik projektu it)\b/,
  /\b(linux|unix|windows|sql|oracle|azure|aws|gcp|m365|office 365|vmware|citrix) (administrator|admin|engineer|specialist|consultant)\b/,
  /\b(data ?center|datacenter) (technician|engineer|operations)\b/,
  /\b(erp|crm|dynamics|odoo|netsuite) (consultant|developer|specialist|architect|administrator)\b/,
  /\bit\b/,
  // Seen among undecided titles in the outside board catalog, 2026-11-03.
  /\b(sap|servicenow|salesforce|dynamics 365|d365|power platform|oracle fusion|oracle cloud|oracle ebs|netsuite|epic analyst|sailpoint|okta|jira|abap|hana|sap basis)\b/,
  /\b(java|javascript|typescript|python|php|ruby|golang|scala|kotlin|\.net|dotnet|react|angular|kubernetes|k8s|terraform|linux|rhel|aws|azure|gcp|hpc|gpu|cuda|iiot|iot|siem|iam|swe)\b/,
  /(^|[^a-z])(c(\+\+|#)|\.net)($|[^a-z])/,
  /\b(cybersecurite|ciberseguridad|ciberseguranca|gestion de identidades|identity (and|&) access|cert analyst|threat (intelligence|hunter|analyst)|incident response|penetration tester|pentester|malware)\b/,
  /\b(analista de sistemas|integrationsspecialist|integration specialist|reseaux|systemes|sistemas)\b/,
  /\b(security|cyber|infosec)( \S+){0,2} (engineer|engineering|architect|analyst|specialist)\b/,
  /\b(infra|test automation|autonomy|perception|computer vision|security operations|soc|desktop|endpoint|noc|gnoc|reverse engineer|release engineer|build engineer|escalation engineer|growth engineer|founding engineer|forward[- ]deployed|firmware|managed services|microsoft|ict|quant|autonomous|motion planning|customer engineer|member of technical staff|mts|ai agents?|agent engineer|agentic|langchain|deep learning|embarque|embarques|embebido|embebidos|deployed engineer|rust|ansible|red hat|mendix|outsystems|power bi|power platform)\b/,
  /\b(ai|artificial intelligence|genai|llm|data)\b/,
  /\btechnical (director|lead|product|services|consultant|specialist)\b/,
]

/** Generic business operations. Checked only after a tech function has failed to match. */
const SOFT_OUT: RegExp[] = [
  /\boperations specialist\b/,
  /\bescalation\b/,
  /\bgovernance\b/,
  /\bvendor operations\b/,
  /\bphone numbers\b/,
  /\bwriter\b/,
]

const NON_TECH_INDUSTRY =
  /\b(construction|retail|hospitality|hotel|restaurant|grocery|mining|agriculture|real estate)\b/
const TECH_INDUSTRY =
  /\b(software|technology|information technology|saas|fintech|internet|semiconductor|cybersecurity|telecom)\b/

/** Boards this catalog treats as a technology employer, unless the industry says otherwise. */
const TECH_SOURCES = new Set([
  "GREENHOUSE",
  "LEVER",
  "ASHBY",
  "WORKABLE",
  "SMARTRECRUITERS",
  "TRAFFIT",
  "RECRUITEE",
  "TEAMTAILOR",
  "PERSONIO",
  "PINPOINT",
  "BREEZY",
  "BAMBOOHR",
  "CAREER_SITE",
])

const LEADERSHIP = new Set<Seniority>(["director", "head", "vp", "c_level"])

export function classifySeniority(title: string): Seniority | null {
  return detectSeniority(normalizeTitle(title))
}

/** True, false, or null when the title is not enough to decide. */
export function classifyTechRole(title: string): TechVerdict {
  const text = fold(title)
  if (!text) return null
  if (NOT_IT_DESPITE_IT_WORD.test(text)) return false
  const otherEngineering =
    (NON_IT_ENGINEERING.test(text) && !SOFTWARE_WORK.test(text)) || isHardwareEngineering(text)
  if (
    !otherEngineering &&
    (STRONG_IN.some((pattern) => pattern.test(text)) || isDigitalDesign(text))
  ) {
    return true
  }
  if (otherEngineering || OUT.some((pattern) => pattern.test(text))) return false
  if (IN.some((pattern) => pattern.test(text))) return true
  if (SOFT_OUT.some((pattern) => pattern.test(text))) return false
  return null
}

export function classifyRole(title: string): {
  seniority: Seniority | null
  isTechRole: TechVerdict
} {
  return { seniority: classifySeniority(title), isTechRole: classifyTechRole(title) }
}

/**
 * A definite non-tech role is out. A definite tech role is in.
 * An uncertain role follows the company. Unknown company stays unknown.
 */
export function inTechScope(isTechRole: TechVerdict, companyIsTech: TechVerdict): TechVerdict {
  if (isTechRole === false) return false
  if (isTechRole === true) return true
  if (companyIsTech === true) return true
  if (companyIsTech === false) return false
  return null
}

export function classifyCompany(args: {
  industry?: string | null
  sourceType?: string | null
}): TechVerdict {
  const industry = fold(args.industry || "")
  if (industry && NON_TECH_INDUSTRY.test(industry)) return false
  if (industry && TECH_INDUSTRY.test(industry)) return true
  if (args.sourceType && TECH_SOURCES.has(args.sourceType)) return true
  return null
}

/** Query-time boost. Matching weights stay untouched. The ceiling is 6. */
export function seniorityAffinity(
  profileSeniority: string | null | undefined,
  jobSeniority: string | null | undefined
): number {
  if (!profileSeniority || !jobSeniority) return 0
  if (profileSeniority === jobSeniority) return 6
  const profileRank = SENIORITY_RANK[profileSeniority as Seniority]
  const jobRank = SENIORITY_RANK[jobSeniority as Seniority]
  if (profileRank == null || jobRank == null) return 0
  if (profileRank === jobRank) return 6
  if (
    LEADERSHIP.has(profileSeniority as Seniority) &&
    LEADERSHIP.has(jobSeniority as Seniority) &&
    Math.abs(profileRank - jobRank) <= 2
  ) {
    return 4
  }
  if (Math.abs(profileRank - jobRank) === 1) return 3
  return 0
}

export const TECH_AREAS = ["engineering", "data", "devops", "qa", "product", "design"] as const
export type TechArea = (typeof TECH_AREAS)[number]

const AREA_PATTERNS: Array<[TechArea, RegExp]> = [
  [
    "design",
    /\b(product designer|ux|ui designer|ui|graphic designer|designer|projektant|projektantka)\b/,
  ],
  ["product", /\b(product manager|product owner|head of product|director of product|product)\b/],
  [
    "devops",
    /\b(devops|sre|site reliability|platform engineer|infrastructure|cloud engineer|it operations|it ops)\b/,
  ],
  ["qa", /\b(quality assurance|test engineer|sdet|tester|qa)\b/],
  [
    "data",
    /\b(data engineer|data scientist|data analyst|machine learning|ml engineer|analityk danych|analityczka danych|analytics)\b/,
  ],
  [
    "engineering",
    /\b(software|engineer|engineering|developer|programmer|programista|programistka|deweloper|frontend|backend|fullstack|full-stack|inzynier)\b/,
  ],
]

/** One specialism per title. Design and product win over a generic "engineer". */
export function techArea(title: string): TechArea | null {
  const text = fold(title)
  if (!text || OUT.some((pattern) => pattern.test(text))) return null
  if (SOFT_OUT.some((pattern) => pattern.test(text)) && !IN.some((pattern) => pattern.test(text))) {
    return null
  }
  for (const [area, pattern] of AREA_PATTERNS) {
    if (pattern.test(text)) return area
  }
  return null
}

/**
 * Drop a specialism the index barely has, so example phrases do not promise it.
 * The floor is 40 offers, or 0.5% of in-scope tech offers, whichever is higher.
 */
export function areasToMention(
  counts: Partial<Record<TechArea, number>>,
  totalTech: number
): TechArea[] {
  if (totalTech <= 0) return [...TECH_AREAS]
  const floor = Math.max(40, Math.round(totalTech * 0.005))
  const kept = TECH_AREAS.filter((area) => (counts[area] ?? 0) >= floor)
  return kept.length ? kept : [...TECH_AREAS]
}

const EXAMPLE_FOR: Record<TechArea, string> = {
  engineering: "Junior Frontend",
  data: "Senior Data Engineer",
  devops: "Platform Engineer",
  qa: "QA Engineer",
  product: "Product Manager",
  design: "Product Designer",
}

const EXAMPLE_ORDER: TechArea[] = ["engineering", "data", "design", "devops", "qa", "product"]

export function examplePhrases(areas: TechArea[]): string[] {
  const covered = new Set(areas)
  const phrases = EXAMPLE_ORDER.filter((area) => covered.has(area)).map((area) => EXAMPLE_FOR[area])
  return phrases.slice(0, 3)
}

const EARLY = new Set(["intern", "junior", "mid"])
const EXPERIENCED = new Set(["senior", "lead", "principal"])
const LEADING = new Set(["manager", "senior_manager", "head", "director", "vp", "c_level"])

/** One early, one experienced, and one leading title when the index has them. */
export function pickMixedPreview<T extends { seniority: string | null; key: string }>(
  items: T[],
  limit = 3
): T[] {
  const bands = [EARLY, EXPERIENCED, LEADING]
  const picked: T[] = []
  const seen = new Set<string>()
  for (const band of bands) {
    const match = items.find(
      (item) => item.seniority && band.has(item.seniority) && !seen.has(item.key)
    )
    if (!match) continue
    picked.push(match)
    seen.add(match.key)
  }
  for (const item of items) {
    if (picked.length >= limit) break
    if (seen.has(item.key)) continue
    picked.push(item)
    seen.add(item.key)
  }
  return picked.slice(0, limit)
}
