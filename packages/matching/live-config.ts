import { DEFAULT_CONFIG, type MatchingConfig } from "./config"
import { nbpTable } from "./fx"

/**
 * FX and hours stay overridable. DEFAULT_CONFIG itself is never mutated (matching tests depend on it).
 * Rates come from NBP table A once a process has read it (ensureFxRates); FX_*_PLN still wins.
 */
export function liveMatchingConfig(): MatchingConfig {
  const toPln = { ...DEFAULT_CONFIG.fx.toPln }
  let source = DEFAULT_CONFIG.fx.source
  let asOf = DEFAULT_CONFIG.fx.asOf
  const nbp = nbpTable()
  if (nbp) {
    for (const code of Object.keys(toPln) as (keyof typeof toPln)[]) {
      if (code !== "PLN" && nbp.rates[code]) toPln[code] = nbp.rates[code]
    }
    source = `NBP table A ${nbp.no}`
    asOf = nbp.effectiveDate
  }
  const apply = (code: keyof typeof toPln, envName: string) => {
    const raw = process.env[envName]
    if (!raw) return
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return
    toPln[code] = value
    source = "env FX_*_PLN"
  }
  apply("EUR", "FX_EUR_PLN")
  apply("USD", "FX_USD_PLN")
  apply("GBP", "FX_GBP_PLN")
  apply("CHF", "FX_CHF_PLN")
  return {
    ...DEFAULT_CONFIG,
    fx: {
      ...DEFAULT_CONFIG.fx,
      toPln,
      source,
      asOf: process.env.FX_AS_OF?.trim() || asOf,
    },
  }
}

