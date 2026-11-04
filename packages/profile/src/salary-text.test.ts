import { describe, expect, it } from "vitest"
import { amountsInText, salaryFromText } from "./salary-text"

describe("salary from profile text", () => {
  it("reads a Polish floor with contract", () => {
    const text = `Jan Testowy. Senior Backend Engineer, 8 lat doświadczenia.
Obecnie w Acme (2021-dziś), wcześniej w Beta (2017-2021).
Oczekiwania: od 25 000 PLN netto B2B.`
    expect(salaryFromText(text)).toEqual({
      salaryFloor: 25000,
      salaryTarget: null,
      salaryCurrency: "PLN",
      salaryPeriod: "month",
      salaryContract: "b2b",
    })
  })

  it("reads a range written with tys. and zł", () => {
    expect(salaryFromText("Wynagrodzenie: 25–30 tys. zł brutto, umowa o pracę")).toMatchObject({
      salaryFloor: 25000,
      salaryTarget: 30000,
      salaryCurrency: "PLN",
      salaryContract: "uop",
    })
  })

  it("turns a yearly amount in dollars into a monthly one", () => {
    expect(salaryFromText("Salary expectations: $150,000 per year")).toMatchObject({
      salaryFloor: 12500,
      salaryCurrency: "USD",
      salaryPeriod: "month",
    })
  })

  it("treats a large amount with no period as yearly", () => {
    expect(salaryFromText("Expected compensation 120k-140k EUR")).toMatchObject({
      salaryFloor: 10000,
      salaryTarget: 11667,
      salaryCurrency: "EUR",
    })
  })

  it("reads a target", () => {
    expect(salaryFromText("Stawka docelowo 30k PLN miesięcznie")).toMatchObject({
      salaryFloor: null,
      salaryTarget: 30000,
    })
  })

  it("ignores years, experience and phone numbers", () => {
    expect(salaryFromText("Acme 2017-2021, 8 lat doświadczenia, tel. 600 100 200")).toBeNull()
    expect(salaryFromText("Built a team of 12 engineers in 2019")).toBeNull()
  })

  it("reads other common ways of writing it", () => {
    expect(salaryFromText("Oczekiwania finansowe: od 20 do 25 tys. zł")).toMatchObject({
      salaryFloor: 20000,
      salaryTarget: 25000,
    })
    expect(salaryFromText("Looking for £60k a year")).toMatchObject({
      salaryFloor: 5000,
      salaryCurrency: "GBP",
    })
    expect(salaryFromText("Rate: 7000 EUR/month as a contractor")).toMatchObject({
      salaryFloor: 7000,
      salaryCurrency: "EUR",
      salaryContract: "b2b",
    })
  })

  it("needs a currency or a word about pay", () => {
    expect(salaryFromText("Managed a budget of 250 000 for the project")).toBeNull()
  })

  it("lists the amounts written in the text", () => {
    expect(amountsInText("Oczekiwania 25-30k PLN")).toEqual(new Set([25000, 30000]))
  })
})
