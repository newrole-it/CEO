import { describe, expect, it } from "vitest"
import { parseSalary } from "./normalize"

describe("parseSalary", () => {
  it("keeps the decimal part of an amount in thousands", () => {
    expect(parseSalary("$140.8K – $231K")).toEqual({ min: 140800, max: 231000, currency: "USD" })
    expect(parseSalary("$174.2K - $261.2K")).toEqual({ min: 174200, max: 261200, currency: "USD" })
    expect(parseSalary("€95.5k")).toEqual({ min: 95500, max: 95500, currency: "EUR" })
  })

  it("does not inflate an amount written with decimals", () => {
    expect(parseSalary("$120000.50 - $150000.00")).toEqual({
      min: 120001,
      max: 150000,
      currency: "USD",
    })
  })

  it("still reads separators as thousands", () => {
    expect(parseSalary("140.800 - 231.000 PLN")).toEqual({
      min: 140800,
      max: 231000,
      currency: "PLN",
    })
    expect(parseSalary("$140,800 – $231,000")).toEqual({
      min: 140800,
      max: 231000,
      currency: "USD",
    })
    expect(parseSalary("20 000 - 27 000 zł")).toEqual({ min: 20000, max: 27000, currency: "PLN" })
    expect(parseSalary("$150K–$200K")).toEqual({ min: 150000, max: 200000, currency: "USD" })
  })
})
