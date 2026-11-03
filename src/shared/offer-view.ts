/** Serializable offer shown on the public browse page. Built on the server. */

export type PayNote =
  | "hour"
  | "day"
  | "year"
  | "assumed-hour"
  | "assumed-day"
  | "assumed-month"
  | "assumed-year"

export type OfferWorkMode = "remote" | "hybrid" | "onsite" | "unknown"

export type OfferView = {
  id: string
  title: string
  company: string
  /** `company` is a recruiter or job platform publishing for an employer it does not name. */
  viaIntermediary: boolean
  url: string
  excerpt: string
  description: string
  requirements: string[]
  inPoland: boolean | null
  city: string | null
  countryCode: string | null
  workMode: OfferWorkMode
  payListed: boolean
  payConverted: boolean
  payMin: number | null
  payMax: number | null
  payLabel: string | null
  payNote: PayNote | null
  payCurrency: string | null
  payFromOther: boolean
  paySourceUrl: string | null
}

export type FitOffer = OfferView & { why: string }
