/**
 * Tunable assumptions. Everything here is CONFIG, not truth — override via env/DB.
 * FX rates are placeholders; in production refresh daily from NBP table A
 * (https://api.nbp.pl/api/exchangerates/tables/A?format=json) and store asOf.
 */
import type { ContractType, Currency, SalaryBasis } from "./types";

export interface MatchingConfig {
  fx: { asOf: string; source: string; toPln: Record<Currency, number> };
  hoursPerMonth: number; // 168 = 21 days × 8 h
  daysPerMonth: number; // 21 working days
  monthsPerYear: number; // 12 (no 13th salary assumed)
  /**
   * Multipliers that map a monthly amount on (contract, basis) to the comparison basis:
   * "B2B net-of-VAT equivalent". Rough market rules of thumb, not tax advice.
   */
  toB2bNetFactor: Record<ContractType, Partial<Record<SalaryBasis, number>>>;
  /** Default basis when the posting does not say (PL market conventions). */
  defaultBasis: Record<ContractType, SalaryBasis>;
}

export const DEFAULT_CONFIG: MatchingConfig = {
  fx: {
    asOf: "2026-10-01",
    source: "PLACEHOLDER — replace with NBP table A mid rates",
    toPln: { PLN: 1, EUR: 4.3, USD: 3.95, GBP: 5.0, CHF: 4.55 },
  },
  hoursPerMonth: 168,
  daysPerMonth: 21,
  monthsPerYear: 12,
  toB2bNetFactor: {
    // B2B invoices are quoted net of VAT ("netto + VAT"): already the comparison basis.
    b2b: { net_of_vat: 1, unknown: 1, gross: 1 / 1.23 /* rare: amount incl. 23% VAT */ },
    // UoP brutto → B2B equivalent: employer-side benefits/paid leave/ZUS make B2B ~25% higher for parity.
    uop: { gross: 1.25, unknown: 1.25, net: 1.25 * 1.4 /* netto(na rękę) ≈ brutto/1.4 */ },
    uz: { gross: 1.15, unknown: 1.15, net: 1.15 * 1.3 },
    uod: { gross: 1.1, unknown: 1.1, net: 1.1 * 1.15 },
    // Foreign employment (e.g. DE/NL payroll) quoted gross annual: treat like UoP gross.
    employment_foreign: { gross: 1.25, unknown: 1.25, net: 1.25 * 1.5 },
    // Unknown contract: compare as-is and flag the assumption.
    unknown: { unknown: 1, gross: 1, net: 1.4, net_of_vat: 1 },
  },
  defaultBasis: {
    b2b: "net_of_vat",
    uop: "gross",
    uz: "gross",
    uod: "gross",
    employment_foreign: "gross",
    unknown: "unknown",
  },
};
