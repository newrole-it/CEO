import { describe, expect, it } from "vitest"
import { companyKey, employerDomains, mentions, registrableDomain, toScopedApp } from "./allowlist"
import { classifyByRules } from "./classify"
import { parseFrom } from "./gate"
import { matchApplication } from "./match"
import { wrapUntrusted } from "@newrole/llm/common"
import { revokeGoogleToken } from "./oauth"
import { targetStatus } from "./policy"
import { redact, stripQuoted } from "./text"
import { openToken, sealToken, tokenKeyReady } from "./token-crypto"
import type { ScopedApp } from "./types"

const app = (over: Partial<ScopedApp> = {}): ScopedApp => ({
  id: "a1",
  company: "Acme",
  title: "Head of Engineering",
  status: "APPLIED",
  appliedAt: new Date("2026-10-01T10:00:00Z"),
  statusChangedAt: new Date("2026-10-01T10:00:00Z"),
  domains: ["acme.com"],
  slug: null,
  ats: null,
  ...over,
})

describe("the allowlist", () => {
  it("never treats a job board, ATS or free mail as the employer's domain", () => {
    const company = "Acme"
    expect(
      employerDomains({ url: "https://careers.acme.co.uk/j/1", company, companyDomain: null })
    ).toEqual(["acme.co.uk"])
    for (const url of [
      "https://www.linkedin.com/jobs/view/1",
      "https://jobs.lever.co/acme/1",
      "https://boards.greenhouse.io/acme/jobs/1",
      "https://www.pracuj.pl/praca/1",
      "https://docs.google.com/forms/x",
      "https://acme.myworkdayjobs.com/x",
    ]) {
      expect(employerDomains({ url, company, companyDomain: null })).toEqual([])
    }
    expect(employerDomains({ url: null, company, companyDomain: "gmail.com" })).toEqual([])
  })

  it("does not take a posting's host for the employer unless the name fits", () => {
    const domains = (url: string, company = "Acme") =>
      employerDomains({ url, company, companyDomain: null })
    expect(domains("https://wellfound.com/jobs/1")).toEqual([])
    expect(domains("https://acme.vercel.app/careers")).toEqual([])
    expect(domains("https://kariera.acme-group.com/1")).toEqual(["acme-group.com"])
    expect(domains("https://grupa.allegro.pl/1", "Grupa Allegro")).toEqual(["allegro.pl"])
    // An indexed company's domain needs no such luck.
    expect(employerDomains({ url: null, company: "Alphabet", companyDomain: "abc.xyz" })).toEqual([
      "abc.xyz",
    ])
  })

  it("knows which system a posting is on", () => {
    const base = {
      id: "a",
      company: "Acme",
      title: "CTO",
      status: "APPLIED",
      appliedAt: new Date(),
      statusChangedAt: new Date(),
    }
    expect(toScopedApp({ ...base, url: "https://jobs.lever.co/acme/1" }).ats).toBe("lever")
    expect(toScopedApp({ ...base, url: "https://careers.acme.com/1" }).ats).toBeNull()
    expect(
      toScopedApp({
        ...base,
        url: "https://careers.acme.com/1",
        job: { sourceType: "GREENHOUSE", company: { canonicalDomain: null } },
      }).ats
    ).toBe("greenhouse")
    expect(
      toScopedApp({
        ...base,
        url: null,
        job: { sourceType: "GENERIC_HTML", company: { canonicalDomain: null } },
      }).ats
    ).toBeNull()
  })

  it("takes the slug from an ATS link", () => {
    const scoped = toScopedApp({
      id: "a",
      company: "Acme",
      title: "CTO",
      status: "APPLIED",
      url: "https://jobs.lever.co/acme/abc",
      appliedAt: new Date(),
      statusChangedAt: new Date(),
      job: { company: { canonicalDomain: "acme.io" } },
    })
    expect(scoped.slug).toBe("acme")
    expect(scoped.domains).toEqual(["acme.io"])
  })

  it("folds names for comparing", () => {
    expect(registrableDomain("hr.mail.acme.com.pl")).toBe("acme.com.pl")
    expect(registrableDomain("careers.acme.co.il")).toBe("acme.co.il")
    expect(registrableDomain("x.acme.com.sg")).toBe("acme.com.sg")
    expect(registrableDomain("hr.acme.waw.pl")).toBe("acme.waw.pl")
    expect(registrableDomain("mail.acme.com")).toBe("acme.com")
    expect(companyKey("Acme Polska Sp. z o.o.")).toBe("acme")
    expect(mentions("skrzynka inbox", "Box")).toBe(false)
    expect(mentions("praca w box dzisiaj", "Box")).toBe(true)
  })
})

describe("the sender", () => {
  it("reads the real address, not the one in the display name", () => {
    expect(parseFrom('"hr@acme.com" <evil@bad.io>')).toEqual({
      address: "evil@bad.io",
      domain: "bad.io",
      name: "",
    })
    expect(parseFrom("Acme HR <HR@Acme.com>")).toEqual({
      address: "hr@acme.com",
      domain: "acme.com",
      name: "Acme HR",
    })
  })

  it("refuses malformed senders", () => {
    expect(parseFrom("a@acme.com, b@acme.com")).toBeNull()
    expect(parseFrom("not an address")).toBeNull()
  })

  it("stays fast on a hostile header", () => {
    const started = Date.now()
    parseFrom(`${"a".repeat(200_000)}<x@acme.com>`)
    parseFrom("<".repeat(200_000))
    expect(Date.now() - started).toBeLessThan(500)
  })
})

describe("message text", () => {
  it("drops the quoted thread", () => {
    expect(stripQuoted("Nowe\n\nOn Mon, Oct 5, 2026 at 10:00 Anna <a@b.pl> wrote:\n> stare")).toBe(
      "Nowe"
    )
    expect(stripQuoted("Nowe\n> stare")).toBe("Nowe")
    expect(stripQuoted("Nowe\nW dniu 5.10.2026 Anna napisał(a):\nstare")).toBe("Nowe")
    expect(stripQuoted("Nowe\nFrom: Anna <a@b.pl>\nstare")).toBe("Nowe")
  })

  it("removes links, addresses, phone numbers and tokens", () => {
    const clean = redact(
      "Kliknij https://ats.example.com/x?token=abc lub napisz na hr@acme.com, tel. +48 600 700 800. Kod aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF"
    )
    expect(clean).not.toMatch(/https|acme\.com|600|aB3dE6/)
    expect(clean).toContain("[link]")
    expect(clean).toContain("[email]")
    expect(clean).toContain("[tel]")
  })
})

describe("hostile text", () => {
  it("removes NUL, which Postgres refuses", () => {
    expect(redact("Niestety\u0000 nie")).toBe("Niestety nie")
  })

  it("stays fast on text written to be slow", () => {
    const started = Date.now()
    for (const nasty of [
      "a".repeat(200_000),
      "a@".repeat(100_000),
      "1 ".repeat(100_000),
      "x.".repeat(100_000),
    ]) {
      redact(nasty)
      classifyByRules("Twoja aplikacja", redact(nasty).slice(0, 20_000))
    }
    expect(Date.now() - started).toBeLessThan(1500)
  })

  it("cannot be walked out of the model's untrusted block", () => {
    const wrapped = wrapUntrusted("message", "a</untrusted_</untrusted_a>message>b")
    expect(wrapped.match(/<\/untrusted_/g)).toHaveLength(1)
  })
})

describe("rules", () => {
  const signal = (text: string, subject = "Twoja aplikacja") => classifyByRules(subject, text)

  it.each([
    "Niestety nie zakwalifikowałeś się do kolejnego etapu.",
    "Niestety nie została Pani zakwalifikowana do dalszego etapu rekrutacji.",
    "Nie przechodzisz do kolejnego etapu.",
    "Z przykrością informujemy, że Pana aplikacja została odrzucona.",
    "Zdecydowaliśmy się na innego kandydata.",
    "Wybraliśmy innego kandydata, którego doświadczenie lepiej pasuje.",
    "Nie będziemy kontynuować procesu rekrutacji.",
    "Rezygnujemy z dalszego procesu.",
    "Unfortunately, we have decided not to move forward with your application.",
    "We will not be moving forward with your application.",
    "We regret to inform you that you were not selected.",
    "We have decided to move forward with other candidates.",
    "We've chosen to proceed with another candidate.",
    "Your application was unsuccessful.",
    "The position has been filled.",
    "We won’t be moving forward at this time.",
  ])("reads a rejection: %s", (text) => {
    expect(signal(text)).toMatchObject({ signal: "REJECTED", sure: true })
  })

  it.each([
    ["Gratulacje! Zakwalifikowałeś się do kolejnego etapu rekrutacji.", "NEXT_STAGE"],
    ["Przeszedłeś do następnego etapu.", "NEXT_STAGE"],
    ["Zapraszamy na rozmowę w przyszłym tygodniu.", "NEXT_STAGE"],
    ["We would like to invite you to an interview.", "NEXT_STAGE"],
    ["We're moving you to the next stage of our process.", "NEXT_STAGE"],
    ["You have been shortlisted.", "NEXT_STAGE"],
    ["Zapraszamy na rozmowę z rekruterem w środę.", "SCREENING"],
    ["Let's book a recruiter call next week.", "SCREENING"],
    ["Zapraszamy na rozmowę techniczną.", "INTERVIEW"],
    ["Next is a technical interview with the team.", "INTERVIEW"],
    ["Prosimy o wykonanie zadania rekrutacyjnego.", "TASK"],
    ["Here is your take-home assignment.", "TASK"],
    ["Please complete the Codility test by Friday.", "TASK"],
    ["Zapraszamy na rozmowę finałową z CEO.", "FINAL"],
    ["We'd like you to join the final round.", "FINAL"],
    ["We are delighted to offer you the position.", "OFFER"],
    ["Mamy przyjemność zaproponować Ci ofertę zatrudnienia.", "OFFER"],
  ])("reads progress: %s", (text, expected) => {
    expect(signal(text)).toMatchObject({ signal: expected, sure: true })
  })

  it.each([
    "Dziękujemy za przesłanie aplikacji.",
    "Otrzymaliśmy Twoją aplikację.",
    "Thank you for applying to Acme.",
    "We have received your application.",
    "Your application has been submitted.",
  ])("reads a confirmation: %s", (text) => {
    expect(signal(text)).toMatchObject({ signal: "CONFIRMATION", sure: true })
  })

  it("does not take what could happen for what happened", () => {
    const text = [
      "Thank you for applying to Acme.",
      "If we decide not to move forward with your application, we will let you know.",
      "Should your profile match, we would like to invite you to an interview.",
      "We may schedule a call with you.",
      "W przypadku wyboru innego kandydata poinformujemy Cię mailem.",
      "Jeśli przejdziesz do kolejnego etapu, zaprosimy Cię na rozmowę.",
    ].join("\n")
    expect(signal(text)).toMatchObject({ signal: "CONFIRMATION", sure: true })
  })

  it.each([
    ["We have received your CV. Only shortlisted candidates will be contacted.", "CONFIRMATION"],
    [
      "Twoje CV jest w trakcie weryfikacji. O kolejnych etapach rekrutacji poinformujemy mailowo.",
      "CONFIRMATION",
    ],
    ["Our team will schedule a call with selected candidates next week.", "OTHER"],
    ["Skontaktujemy się z wybranymi kandydatami w celu umówienia rozmowy.", "OTHER"],
  ])("does not take what happens to some candidates later for progress: %s", (text, expected) => {
    const reading = signal(text)
    expect(reading.signal).toBe(expected)
    if (expected === "OTHER") expect(reading.sure).toBe(false)
  })

  it("still reads a rejection that names other candidates", () => {
    expect(signal("We have decided to move forward with other selected candidates.")).toMatchObject(
      { signal: "REJECTED", sure: true }
    )
  })

  it("does not read a schedule change as a rejection", () => {
    const reading = signal("Unfortunately I can't do Monday. Could you do Tuesday instead?")
    expect(reading.signal).toBe("OTHER")
    expect(reading.sure).toBe(false)
  })

  it("is not sure when a message says two things", () => {
    expect(
      signal("We decided not to proceed. We'd love to speak about future roles.")
    ).toMatchObject({
      signal: "REJECTED",
      sure: false,
    })
    expect(signal("Thanks for applying! We'd like to invite you to an interview.")).toMatchObject({
      signal: "CONFIRMATION",
      sure: false,
    })
  })

  it("has nothing to say about mail that is about something else", () => {
    expect(signal("Zapraszamy do zapoznania się z naszym blogiem.")).toMatchObject({
      signal: "OTHER",
      sure: false,
    })
  })

  it("keeps the sentence as evidence", () => {
    const reading = signal(
      "Dzień dobry.\nNiestety nie zakwalifikowałeś się do kolejnego etapu.\nPozdrawiamy"
    )
    expect(reading.evidence).toBe("Niestety nie zakwalifikowałeś się do kolejnego etapu")
  })
})

describe("matching", () => {
  const message = (over: Partial<Parameters<typeof matchApplication>[0]> = {}) => ({
    sender: { address: "hr@acme.com", domain: "acme.com", name: "" },
    tier: "company" as const,
    subject: "Twoja aplikacja",
    text: "",
    receivedAt: new Date("2026-10-20T10:00:00Z"),
    ...over,
  })

  it("trusts the employer's own domain", () => {
    expect(matchApplication(message(), [app()])).toMatchObject({
      certain: true,
      application: { id: "a1" },
    })
  })

  it("finds the application from a domain spelling the company, and still asks", () => {
    const noDomain = app({ domains: [], company: "Acme Sp. z o.o." })
    expect(
      matchApplication(message({ sender: { address: "x@acme.pl", domain: "acme.pl", name: "" } }), [
        noDomain,
      ])
    ).toMatchObject({ certain: false, application: { id: "a1" } })
  })

  it("wants a look before believing a name or a look-alike domain", () => {
    const noDomain = app({ domains: [] })
    const lookalike = { address: "x@acme-careers.com", domain: "acme-careers.com", name: "" }
    expect(
      matchApplication(message({ sender: lookalike, subject: "Acme" }), [noDomain])
    ).toMatchObject({
      certain: false,
      application: { id: "a1" },
    })
    const named = { address: "x@other.com", domain: "other.com", name: "Acme Recruiting" }
    expect(matchApplication(message({ sender: named }), [noDomain])).toMatchObject({
      certain: false,
    })
  })

  it("finds the application from a name on the posting's system, but never trusts a name", () => {
    const lever = app({ domains: [], ats: "lever" })
    const onLever = { address: "x@hire.lever.co", domain: "hire.lever.co", name: "Acme Hiring" }
    // Anyone with an account on Lever can call themselves "Acme Hiring".
    expect(matchApplication(message({ sender: onLever, tier: "ats" }), [lever])).toMatchObject({
      certain: false,
      application: { id: "a1" },
    })
    const onGreenhouse = {
      address: "x@us.greenhouse-mail.io",
      domain: "us.greenhouse-mail.io",
      name: "Acme Hiring",
    }
    expect(matchApplication(message({ sender: onGreenhouse, tier: "ats" }), [lever])).toMatchObject(
      { certain: false, application: { id: "a1" } }
    )
    // Nothing says where the offer was, so no system can prove anything.
    expect(
      matchApplication(message({ sender: onLever, tier: "ats" }), [app({ domains: [] })])
    ).toMatchObject({ certain: false })
    const slug = { address: "x@hire.lever.co", domain: "hire.lever.co", name: "Acme Corp Global" }
    expect(
      matchApplication(message({ sender: slug, tier: "ats" }), [
        app({ domains: [], company: "ACME Holdings", slug: "acme", ats: "lever" }),
      ])
    ).toMatchObject({ certain: false, application: { id: "a1" } })
    const inTheMiddle = { ...onLever, name: "Hiring for Acme" }
    expect(matchApplication(message({ sender: inTheMiddle, tier: "ats" }), [lever])).toMatchObject({
      certain: false,
    })
    const blank = { address: "x@hire.lever.co", domain: "hire.lever.co", name: "" }
    expect(
      matchApplication(message({ sender: blank, tier: "ats", subject: "Hello" }), [app()])
        .application
    ).toBeNull()
  })

  it("does not believe a domain just because it spells the company", () => {
    const anyone = { address: "hr@acme.xyz", domain: "acme.xyz", name: "" }
    expect(matchApplication(message({ sender: anyone }), [app({ domains: [] })])).toMatchObject({
      certain: false,
      application: { id: "a1" },
    })
  })

  it("does not take a common word in a subject for the company", () => {
    const next = app({ company: "Next", domains: [], ats: "lever" })
    const sender = { address: "x@hire.lever.co", domain: "hire.lever.co", name: "Foo Recruiting" }
    const result = matchApplication(
      message({ sender, tier: "ats", subject: "Next steps on your application with Foo" }),
      [next]
    )
    expect(result.certain).toBe(false)
  })

  it("is not certain from a mention in the body alone", () => {
    const blank = { address: "x@hire.lever.co", domain: "hire.lever.co", name: "" }
    const result = matchApplication(
      message({
        sender: blank,
        tier: "ats",
        subject: "Update",
        text: "Your process at Acme continues.",
      }),
      [app({ domains: [] })]
    )
    expect(result).toMatchObject({ certain: false, application: { id: "a1" } })
  })

  it("tells two roles at one company apart by the role", () => {
    const apps = [
      app({ id: "em", title: "Engineering Manager" }),
      app({ id: "cto", title: "Chief Technology Officer" }),
    ]
    const result = matchApplication(
      message({ subject: "Chief Technology Officer: Twoja aplikacja" }),
      apps
    )
    expect(result.application?.id).toBe("cto")
  })

  it("asks when it cannot tell two roles apart", () => {
    const apps = [
      app({ id: "em", title: "Engineering Manager" }),
      app({ id: "cto", title: "Chief Technology Officer" }),
    ]
    const result = matchApplication(message(), apps)
    expect(result.application).toBeNull()
    expect(result.candidates.map((item) => item.id).sort()).toEqual(["cto", "em"])
  })

  it("ignores mail from before the application", () => {
    const late = app({ appliedAt: new Date("2026-10-25T10:00:00Z") })
    expect(matchApplication(message(), [late]).application).toBeNull()
  })

  it.each([
    ["Your application for Data Engineer at Acme", ""],
    ["Update on your application", "Thank you for your application for the Data Engineer role."],
    ["Twoja aplikacja", "Dziękujemy za aplikację na stanowisko Data Engineer w Acme."],
    ["Re: candidacy", "Position: Data Engineer"],
  ])("asks when the employer's own mail names another role: %s", (subject, text) => {
    const platform = app({ title: "Platform Engineer" })
    expect(matchApplication(message({ subject, text }), [platform])).toMatchObject({
      certain: false,
      application: { id: "a1" },
    })
  })

  it("asks when the model read another role", () => {
    const platform = app({ title: "Platform Engineer" })
    expect(matchApplication(message({ title: "Data Engineer" }), [platform]).certain).toBe(false)
  })

  it.each([
    ["Your application for Senior Platform Engineer at Acme", ""],
    ["Update", "Thank you for applying for this position."],
    ["Update", "Thank you for your application for the role at Acme."],
    ["Your application for Acme", ""],
    ["Twoja aplikacja", ""],
  ])("stays certain when the role is this one or not named: %s", (subject, text) => {
    const platform = app({ title: "Platform Engineer" })
    expect(matchApplication(message({ subject, text }), [platform]).certain).toBe(true)
  })
})

describe("policy", () => {
  it("never moves backward", () => {
    expect(targetStatus("SCREENING", "FINAL")).toBeNull()
    expect(targetStatus("INTERVIEW", "TASK")).toBeNull()
    expect(targetStatus("INTERVIEW", "SCREENING")).toBe("INTERVIEW")
  })

  it("maps 'next stage' onto the funnel", () => {
    expect(targetStatus("NEXT_STAGE", "APPLIED")).toBe("SCREENING")
    expect(targetStatus("NEXT_STAGE", "SCREENING")).toBe("INTERVIEW")
    expect(targetStatus("NEXT_STAGE", "INTERVIEW")).toBeNull()
  })
})

describe("token sealing", () => {
  const env = { SESSION_SECRET_KEY: "a-secret-that-is-long-enough-for-this-32" }

  it("round-trips without leaving the token readable", () => {
    const sealed = sealToken("1//refresh-token", 7, env)!
    expect(sealed).not.toContain("refresh-token")
    expect(openToken(sealed, 7, env)).toBe("1//refresh-token")
    expect(sealToken("1//refresh-token", 7, env)).not.toBe(sealed)
  })

  it("does not open for another account, with another secret, or after tampering", () => {
    const sealed = sealToken("token", 7, env)!
    expect(openToken(sealed, 8, env)).toBeNull()
    expect(
      openToken(sealed, 7, { SESSION_SECRET_KEY: "another-secret-that-is-long-enough-too" })
    ).toBeNull()
    const parts = sealed.split(".")
    parts[3] = parts[3].replace(/^./, (char) => (char === "0" ? "1" : "0"))
    expect(openToken(parts.join("."), 7, env)).toBeNull()
  })

  it("refuses to seal without a real secret", () => {
    expect(sealToken("token", 7, {})).toBeNull()
    expect(sealToken("token", 7, { SESSION_SECRET_KEY: "short" })).toBeNull()
  })

  it("does not take the sample value from .env.example for a secret", () => {
    const sample = { SESSION_SECRET_KEY: "replace-with-a-random-string-of-32-plus-chars" }
    expect(sealToken("token", 7, sample)).toBeNull()
    expect(tokenKeyReady(sample)).toBe(false)
    expect(tokenKeyReady({ ...sample, GMAIL_TOKEN_KEY: "a".repeat(64) })).toBe(true)
    expect(tokenKeyReady(env)).toBe(true)
  })

  it("prefers its own key", () => {
    const own = { ...env, GMAIL_TOKEN_KEY: "a-separate-key-that-is-long-enough-as-well" }
    expect(openToken(sealToken("token", 7, own)!, 7, env)).toBeNull()
  })
})

describe("revoking access at Google", () => {
  const reply = (ok: boolean, status: number, payload: unknown) => async () => ({
    ok,
    status,
    json: async () => payload,
  })

  it("treats an already dead token as revoked", async () => {
    expect(await revokeGoogleToken("t", reply(false, 400, { error: "invalid_token" }))).toBe(true)
    expect(await revokeGoogleToken("t", reply(false, 500, {}))).toBe(false)
  })
})
