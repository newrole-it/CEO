/**
 * Mid exchange rates into PLN from the National Bank of Poland, table A
 * (https://api.nbp.pl/api/exchangerates/tables/A?format=json; 32 currencies on 2026-11-02).
 * Each process keeps the latest table in memory and reads it again after 12 hours. When the API
 * cannot be reached the last table stays, and before any table the defaults in matching/config.ts
 * apply. FX_<CODE>_PLN in the environment still wins over both.
 */
import { DEFAULT_CONFIG } from "matching/config"

export const NBP_TABLE_A_URL = "https://api.nbp.pl/api/exchangerates/tables/A?format=json"

const REFRESH_MS = 12 * 60 * 60 * 1000
const RETRY_MS = 60 * 60 * 1000

export type NbpTable = { no: string; effectiveDate: string; rates: Record<string, number> }

let table: NbpTable | null = null
let fetchedAt = 0
let failedAt = 0
let pending: Promise<void> | null = null

export function parseNbpTable(payload: unknown): NbpTable | null {
  const first = Array.isArray(payload) ? payload[0] : null
  if (!first || typeof first !== "object") return null
  const row = first as { no?: unknown; effectiveDate?: unknown; rates?: unknown }
  if (typeof row.no !== "string" || typeof row.effectiveDate !== "string") return null
  if (!Array.isArray(row.rates)) return null
  const rates: Record<string, number> = {}
  for (const item of row.rates) {
    const rate = item as { code?: unknown; mid?: unknown }
    if (typeof rate.code !== "string" || !/^[A-Z]{3}$/.test(rate.code)) continue
    if (typeof rate.mid !== "number" || !Number.isFinite(rate.mid) || rate.mid <= 0) continue
    rates[rate.code] = rate.mid
  }
  return Object.keys(rates).length ? { no: row.no, effectiveDate: row.effectiveDate, rates } : null
}

async function load(fetchImpl: typeof fetch) {
  try {
    const response = await fetchImpl(NBP_TABLE_A_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`NBP returned ${response.status}`)
    const parsed = parseNbpTable(await response.json())
    if (!parsed) throw new Error("NBP table A had no rates")
    table = parsed
    fetchedAt = Date.now()
  } catch (error) {
    failedAt = Date.now()
    console.warn("NBP rates unavailable", error instanceof Error ? error.message : error)
  }
}

/** Reads table A when the one in memory is older than 12 hours. Never throws. */
export async function ensureFxRates(fetchImpl: typeof fetch = fetch): Promise<void> {
  // Tests and NBP_RATES=off stay on the defaults; nothing calls the network.
  if (
    fetchImpl === fetch &&
    (process.env.NBP_RATES === "off" || process.env.VITEST || process.env.NODE_ENV === "test")
  ) {
    return
  }
  const now = Date.now()
  if (table && now - fetchedAt < REFRESH_MS) return
  if (!table && failedAt && now - failedAt < RETRY_MS) return
  if (table && failedAt > fetchedAt && now - failedAt < RETRY_MS) return
  pending ??= load(fetchImpl).finally(() => {
    pending = null
  })
  await pending
}

export function nbpTable(): NbpTable | null {
  return table
}

/** For tests. */
export function setNbpTable(next: NbpTable | null) {
  table = next
  fetchedAt = next ? Date.now() : 0
  failedAt = 0
}

function envRate(code: string): number | null {
  const raw = process.env[`FX_${code}_PLN`]
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** PLN for one unit of a currency: the environment, then NBP, then the config default. */
export function plnPerUnit(code: string): number | null {
  const upper = code.toUpperCase()
  if (upper === "PLN") return 1
  return (
    envRate(upper) ??
    table?.rates[upper] ??
    (DEFAULT_CONFIG.fx.toPln as Record<string, number>)[upper] ??
    null
  )
}
