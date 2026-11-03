import { afterEach, describe, expect, it } from "vitest"
import { ensureFxRates, nbpTable, parseNbpTable, plnPerUnit, setNbpTable } from "./nbp"

const sample = [
  {
    table: "A",
    no: "213/A/NBP/2026",
    effectiveDate: "2026-11-02",
    rates: [
      { currency: "dolar amerykański", code: "USD", mid: 3.9389 },
      { currency: "euro", code: "EUR", mid: 4.4185 },
      { currency: "rupia indyjska", code: "INR", mid: 0.041506 },
    ],
  },
]

afterEach(() => {
  setNbpTable(null)
  delete process.env.FX_EUR_PLN
})

describe("NBP table A", () => {
  it("reads the mid rates", () => {
    expect(parseNbpTable(sample)).toEqual({
      no: "213/A/NBP/2026",
      effectiveDate: "2026-11-02",
      rates: { USD: 3.9389, EUR: 4.4185, INR: 0.041506 },
    })
    expect(parseNbpTable([])).toBeNull()
  })

  it("prefers the environment, then NBP, then the config default", async () => {
    expect(plnPerUnit("EUR")).toBe(4.3)
    await ensureFxRates((async () => ({
      ok: true,
      json: async () => sample,
    })) as unknown as typeof fetch)
    expect(nbpTable()?.no).toBe("213/A/NBP/2026")
    expect(plnPerUnit("EUR")).toBe(4.4185)
    expect(plnPerUnit("INR")).toBe(0.041506)
    process.env.FX_EUR_PLN = "4.5"
    expect(plnPerUnit("EUR")).toBe(4.5)
    expect(plnPerUnit("XYZ")).toBeNull()
  })
})
