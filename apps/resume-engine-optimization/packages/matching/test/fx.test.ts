/** NBP table A rates and their order of precedence (fx.ts). */
import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { ensureFxRates, nbpTable, parseNbpTable, plnPerUnit, setNbpTable } from "../fx"

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
    assert.deepEqual(parseNbpTable(sample), {
      no: "213/A/NBP/2026",
      effectiveDate: "2026-11-02",
      rates: { USD: 3.9389, EUR: 4.4185, INR: 0.041506 },
    })
    assert.equal(parseNbpTable([]), null)
  })

  it("prefers the environment, then NBP, then the config default", async () => {
    assert.equal(plnPerUnit("EUR"), 4.3)
    await ensureFxRates((async () => ({
      ok: true,
      json: async () => sample,
    })) as unknown as typeof fetch)
    assert.equal(nbpTable()?.no, "213/A/NBP/2026")
    assert.equal(plnPerUnit("EUR"), 4.4185)
    assert.equal(plnPerUnit("INR"), 0.041506)
    process.env.FX_EUR_PLN = "4.5"
    assert.equal(plnPerUnit("EUR"), 4.5)
    assert.equal(plnPerUnit("XYZ"), null)
  })
})
