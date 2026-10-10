/**
 * Shared types for the Jobscanner matching pack.
 * Zod schemas are the source of truth; TS types are inferred from them.
 * No existing Jobscanner code/specs were found under /workspace/jobscanner when this
 * pack was written, so these names are proposals for the MVP to adopt or map to.
 */
import { z } from "zod";

/** Seniority ladder. Order matters: index = rank (see SENIORITY_RANK). */
export const SENIORITY_LEVELS = [
  "intern",
  "junior",
  "mid",
  "senior",
  "lead",
  "principal", // staff/principal IC; same rank as manager
  "manager",
  "senior_manager",
  "director",
  "head", // "Head of X" ~ director-level in EU/PL orgs
  "vp",
  "c_level",
] as const;
export const SeniorityEnum = z.enum(SENIORITY_LEVELS);
export type Seniority = z.infer<typeof SeniorityEnum>;

/** Numeric rank used for distance computations. principal==manager, director==head. */
export const SENIORITY_RANK: Record<Seniority, number> = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 4,
  principal: 5,
  manager: 5,
  senior_manager: 6,
  director: 7,
  head: 7,
  vp: 8,
  c_level: 9,
};

export const WorkModeEnum = z.enum(["remote", "hybrid", "onsite", "unknown"]);
export type WorkMode = z.infer<typeof WorkModeEnum>;

/** b2b = contractor invoice (PL "B2B"), uop = umowa o pracę (employment), uz = umowa zlecenie,
 *  uod = umowa o dzieło, employment_foreign = employment contract outside PL. */
export const ContractTypeEnum = z.enum(["b2b", "uop", "uz", "uod", "employment_foreign", "unknown"]);
export type ContractType = z.infer<typeof ContractTypeEnum>;

export const CurrencyEnum = z.enum(["PLN", "EUR", "USD", "GBP", "CHF"]);
export type Currency = z.infer<typeof CurrencyEnum>;

export const SalaryPeriodEnum = z.enum(["hour", "day", "month", "year"]);
export type SalaryPeriod = z.infer<typeof SalaryPeriodEnum>;

/** gross = brutto (UoP/UZ), net = netto take-home (UoP "na rękę"), net_of_vat = B2B invoice amount excl. VAT. */
export const SalaryBasisEnum = z.enum(["gross", "net", "net_of_vat", "unknown"]);
export type SalaryBasis = z.infer<typeof SalaryBasisEnum>;

/** Remote eligibility regions (coarse buckets). */
export const RegionEnum = z.enum(["PL", "EU", "EMEA", "US", "AMERICAS", "APAC", "WORLD", "UNKNOWN"]);
export type Region = z.infer<typeof RegionEnum>;

export const SourceEnum = z.enum([
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
  "teamtailor",
  "company_site",
  "justjoin",
  "nofluffjobs",
  "pracuj",
  "linkedin",
  "web",
]);
export type Source = z.infer<typeof SourceEnum>;

/** One salary range as published (one posting may list several, e.g. B2B and UoP). */
export const SalaryRangeSchema = z.object({
  min: z.number().positive().nullable(),
  max: z.number().positive().nullable(),
  currency: CurrencyEnum,
  period: SalaryPeriodEnum,
  contract: ContractTypeEnum.default("unknown"),
  basis: SalaryBasisEnum.default("unknown"),
  /** true when contract was inferred (e.g. "brutto" PLN → uop, "netto + VAT" → b2b). */
  contractInferred: z.boolean().optional(),
});
export type SalaryRange = z.infer<typeof SalaryRangeSchema>;

/** What a source adapter hands to the matching layer (already fetched, not yet normalized). */
export const RawPostingSchema = z.object({
  id: z.string(),
  source: SourceEnum,
  url: z.string().url(),
  /** ATS-native job id when available (Greenhouse job id, Lever posting id, ...). */
  atsJobId: z.string().optional(),
  /** ATS board/company token (e.g. greenhouse board token) — part of the ATS key. */
  atsBoard: z.string().optional(),
  company: z.string(),
  title: z.string(),
  /** Free-text location(s) as published. */
  location: z.string().optional(),
  /** Structured work-mode hint if the source provides one (e.g. justjoin workplace_type). */
  workModeHint: z.string().optional(),
  /** Free-text salary as published, parsed by normalization.parseSalaryText. */
  salaryText: z.string().optional(),
  /** Structured salary if the source provides it (takes precedence over salaryText). */
  salary: z.array(SalaryRangeSchema).optional(),
  description: z.string().default(""),
  language: z.enum(["en", "pl", "other"]).optional(),
  postedAt: z.string().datetime().optional(),
  fetchedAt: z.string().datetime(),
});
export type RawPosting = z.input<typeof RawPostingSchema>;

export const NormalizedLocationSchema = z.object({
  cities: z.array(z.object({ city: z.string(), country: z.string() })),
  countries: z.array(z.string()),
  remoteRegions: z.array(RegionEnum),
  workModes: z.array(WorkModeEnum),
  /** Most flexible mode offered: remote > hybrid > onsite > unknown. */
  workMode: WorkModeEnum,
});
export type NormalizedLocation = z.infer<typeof NormalizedLocationSchema>;

export const NormalizedSalarySchema = z.object({
  ranges: z.array(SalaryRangeSchema),
  /** Best range converted to monthly PLN on the comparison basis (B2B net-of-VAT equivalent). */
  monthlyPlnMin: z.number().nullable(),
  monthlyPlnMax: z.number().nullable(),
  comparisonBasis: z.literal("b2b_net_monthly_pln"),
  assumptions: z.array(z.string()),
});
export type NormalizedSalary = z.infer<typeof NormalizedSalarySchema>;

export interface NormalizedPosting {
  raw: RawPosting;
  id: string;
  source: Source;
  canonicalUrl: string;
  atsKey: string | null;
  companyNorm: string;
  titleNorm: string;
  /** Title with level words (senior/junior/...) and noise stripped. */
  titleCore: string;
  /** titleCore tokens, PL→EN mapped and stop-word filtered (used by scoring & dedupe). */
  titleTokens: string[];
  seniority: Seniority | null;
  location: NormalizedLocation;
  salary: NormalizedSalary | null;
  postedAt: string | null;
  fingerprint: string;
  /** Heuristic flags (e.g. "suspected_prompt_injection"). Never change the score by themselves. */
  flags: string[];
  /** Filled by dedupe: other posting ids merged into this one. */
  mergedFrom: string[];
  sources: Source[];
}

/** The user's matching preferences. fixtures/profile.json is EXAMPLE data. */
export const MatchProfileSchema = z.object({
  label: z.string().optional(),
  targetTitles: z.array(z.string()).min(1),
  /** Related titles with weights 0..1 (usually from query expansion). */
  relatedTitles: z.array(z.object({ title: z.string(), weight: z.number().min(0).max(1) })).default([]),
  seniority: z.object({ min: SeniorityEnum, max: SeniorityEnum }),
  location: z.object({
    homeCity: z.string(),
    homeCountry: z.string().length(2),
    remoteRegions: z.array(RegionEnum),
    hybridCities: z.array(z.string()),
    onsiteCities: z.array(z.string()),
    /** Accept relocation abroad? If false, onsite/hybrid outside home country scores 0. */
    relocationOk: z.boolean().default(false),
  }),
  salary: z.object({
    /** Floor in monthly PLN, B2B net-of-VAT equivalent. */
    floorMonthlyPln: z.number().positive(),
    targetMonthlyPln: z.number().positive().optional(),
    acceptedContracts: z.array(ContractTypeEnum),
  }),
  exclusions: z.object({
    titleKeywords: z.array(z.string()).default([]),
    descriptionKeywords: z.array(z.string()).default([]),
    companies: z.array(z.string()).default([]),
  }),
});
export type MatchProfile = z.infer<typeof MatchProfileSchema>;
