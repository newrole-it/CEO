import type { MatchingConfig } from "../../../matching/config"
import { toMonthlyPlnB2b } from "../../../matching/normalization"
import type { ContractType, Currency, SalaryBasis, SalaryPeriod } from "../../../matching/types"

export type SalaryKind =
  | "undisclosed"
  | "far_below"
  | "below"
  | "straddle"
  | "meets"
  | "target"
  | "neutral"

export type MonthlyRange = { min: number | null; max: number | null }

export type ProfilePay = {
  salaryFloor: number | null
  salaryTarget: number | null
  salaryCurrency: string | null
  salaryPeriod: string | null
  salaryContract: string | null
}

const CURRENCIES = new Set(["PLN", "EUR", "USD", "GBP", "CHF"])

export function amountToMonthlyPln(
  amount: number | null,
  pay: ProfilePay,
  config: MatchingConfig
): number | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null
  const currency = (
    pay.salaryCurrency && CURRENCIES.has(pay.salaryCurrency) ? pay.salaryCurrency : "PLN"
  ) as Currency
  const period: SalaryPeriod = pay.salaryPeriod === "year" ? "year" : "month"
  const contract: ContractType = pay.salaryContract === "uop" ? "uop" : "b2b"
  const basis: SalaryBasis = contract === "uop" ? "gross" : "net_of_vat"
  const converted = toMonthlyPlnB2b(
    { min: amount, max: amount, currency, period, contract, basis },
    config
  )
  return converted.min
}

export function profileMonthlyPln(
  pay: ProfilePay,
  config: MatchingConfig
): { floor: number | null; target: number | null } {
  return {
    floor: amountToMonthlyPln(pay.salaryFloor, pay, config),
    target: amountToMonthlyPln(pay.salaryTarget, pay, config),
  }
}

export function scoreSalary(args: {
  offer: MonthlyRange | null
  floor: number | null
  target: number | null
}): {
  delta: number
  kind: SalaryKind
  disclosed: boolean
  monthlyMin: number | null
  monthlyMax: number | null
} {
  const min = args.offer?.min ?? null
  const max = args.offer?.max ?? null
  const disclosed = min != null || max != null
  if (!disclosed) {
    return { delta: -2, kind: "undisclosed", disclosed: false, monthlyMin: null, monthlyMax: null }
  }
  const lo = min ?? max!
  const hi = max ?? min!
  const floor = args.floor
  const target = args.target
  if (floor == null && target == null) {
    return { delta: 0, kind: "neutral", disclosed: true, monthlyMin: min, monthlyMax: max }
  }
  if (floor != null && hi < floor * 0.7) {
    return { delta: -28, kind: "far_below", disclosed: true, monthlyMin: min, monthlyMax: max }
  }
  if (floor != null && hi < floor) {
    return { delta: -14, kind: "below", disclosed: true, monthlyMin: min, monthlyMax: max }
  }
  if (floor != null && lo < floor && hi >= floor) {
    return { delta: -4, kind: "straddle", disclosed: true, monthlyMin: min, monthlyMax: max }
  }
  if (target != null && hi >= target) {
    return { delta: 12, kind: "target", disclosed: true, monthlyMin: min, monthlyMax: max }
  }
  if (floor != null && lo >= floor) {
    return { delta: 6, kind: "meets", disclosed: true, monthlyMin: min, monthlyMax: max }
  }
  if (target != null && floor == null && hi < target * 0.7) {
    return { delta: -18, kind: "far_below", disclosed: true, monthlyMin: min, monthlyMax: max }
  }
  if (target != null && floor == null && hi < target) {
    return { delta: -8, kind: "below", disclosed: true, monthlyMin: min, monthlyMax: max }
  }
  return { delta: 0, kind: "neutral", disclosed: true, monthlyMin: min, monthlyMax: max }
}
