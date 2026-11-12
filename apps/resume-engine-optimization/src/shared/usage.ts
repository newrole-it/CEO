/** The periods the usage page offers, in days; "all" is everything recorded. */
export const USAGE_PERIODS = ["1", "7", "30", "all"] as const
export type UsagePeriod = (typeof USAGE_PERIODS)[number]
export const DEFAULT_USAGE_PERIOD: UsagePeriod = "30"
