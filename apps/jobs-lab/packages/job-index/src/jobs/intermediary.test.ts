import { describe, expect, it } from "vitest"
import {
  boardIsIntermediary,
  isAgencyName,
  namesAClient,
  saysListedForSomeoneElse,
  viaIntermediary,
} from "./intermediary"

describe("offers listed through an intermediary", () => {
  it("reads a posting that says someone else is the employer", () => {
    expect(
      saysListedForSomeoneElse(
        "This position is listed on behalf of a partner company, which manages all applications."
      )
    ).toBe(true)
    expect(saysListedForSomeoneElse("This role is for one of Weekday’s clients")).toBe(true)
    expect(
      saysListedForSomeoneElse(
        "Wrknest is looking for a backend software engineer on behalf of a global technology company."
      )
    ).toBe(true)
    expect(saysListedForSomeoneElse("Wir suchen im Auftrag unseres Kunden einen Entwickler.")).toBe(
      true
    )
    // Agents and lawyers act on someone's behalf; that is the work, not who hires.
    expect(saysListedForSomeoneElse("Build AI agents that act on behalf of a user.")).toBe(false)
    expect(saysListedForSomeoneElse("We build software for our clients in banking.")).toBe(false)
  })

  it("counts a named client towards the board, not as proof on its own", () => {
    expect(namesAClient("Our client is a well-funded fintech startup.")).toBe(true)
    expect(namesAClient("Unser Kunde entwickelt die Avaloq Core Banking Plattform.")).toBe(true)
    expect(namesAClient("Nasz klient, międzynarodowa firma z sektora energii.")).toBe(true)
    expect(viaIntermediary("Our client is a well-funded fintech startup.", false)).toBe(false)
    expect(viaIntermediary("Rust and Postgres.", true)).toBe(true)
  })

  it("marks a board by its name or by most of its offers naming a client", () => {
    expect(isAgencyName("Friday Recruitment")).toBe(true)
    expect(isAgencyName("Tasq Staffing Solutions, Inc.")).toBe(true)
    expect(isAgencyName("indivHR | We 💚 IT Recruiting")).toBe(true)
    expect(isAgencyName("ID.me University Recruiting")).toBe(false)
    expect(isAgencyName("ZipRecruiter")).toBe(false)

    const client = "Our client is a bank."
    expect(boardIsIntermediary("Avomind", [client, client, "Rust.", ""])).toBe(true)
    // Scalac: one of two offers named a client; a software house says that about its projects.
    expect(boardIsIntermediary("Scalac", [client, "Scala on B2B."])).toBe(false)
    expect(boardIsIntermediary("Storage24 GmbH", [client])).toBe(false)
    expect(boardIsIntermediary("Mthree Recruiting Portal", [])).toBe(true)
  })
})
