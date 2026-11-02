import { describe, expect, it } from "vitest"
import {
  buildQueries,
  companyKey,
  employerDomains,
  mentions,
  registrableDomain,
  searchPhrase,
  toScopedApp,
} from "./allowlist"
import { classifyByRules, companyFromSenderName, factsFromMail } from "./classify"
import { gateMessage, isAddressedTo, isAuthenticated, parseFrom } from "./gate"
import { matchApplication } from "./match"
import { wrapUntrusted } from "src/server/llm/common"
import {
  exchangeGmailCode,
  gmailAuthorizeUrl,
  GMAIL_SCOPE,
  grantProblem,
  pkceChallenge,
  refreshAccessToken,
  revokeGoogleToken,
} from "./oauth"
import { decide, targetStatus } from "./policy"
import { createGmailReader } from "./reader"
import { messageText, redact, stripQuoted } from "./text"
import { openToken, sealToken, tokenKeyReady } from "./token-crypto"
import type { MailHeaders, ScopedApp } from "./types"

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

const PASS =
  "mx.google.com; dkim=pass header.i=@acme.com header.s=k header.b=x; dmarc=pass (p=NONE) header.from=acme.com"

const head = (over: Partial<MailHeaders> = {}): MailHeaders => ({
  id: "m1",
  receivedAt: new Date("2026-10-20T10:00:00Z"),
  labelIds: ["INBOX"],
  from: "Rekrutacja Acme <rekrutacja@acme.com>",
  subject: "Twoja aplikacja",
  authResults: [PASS],
  recipients: ["Rafał <me@example.com>"],
  listUnsubscribe: false,
  precedence: null,
  ...over,
})

const context = { mailbox: "me@example.com", apps: [app()] }

describe("search queries", () => {
  const after = new Date("2026-10-01T00:00:00Z")

  it("always carries a sender list, and never looks at sent mail, drafts or chats", () => {
    const queries = buildQueries([app()], after)
    expect(queries.length).toBeGreaterThanOrEqual(3)
    for (const query of queries) {
      expect(query).toMatch(/\{from:/)
      expect(query).toContain("-in:sent")
      expect(query).toContain("-in:drafts")
      expect(query).toContain("-in:chats")
      expect(query).toContain("-from:me")
      expect(query).toContain(`after:${after.getTime() / 1000}`)
    }
  })

  it("asks for a hiring subject from employers, and keeps promotions out", () => {
    const company = buildQueries([app()], after).at(-1)!
    expect(company).toContain("from:acme.com")
    expect(company).toContain('from:"Acme"')
    expect(company).toContain("subject:rekrutacja")
    expect(company).toContain('subject:"Head of Engineering"')
    expect(company).toContain("-category:promotions")
  })

  it("does not let a company name widen the search", () => {
    const evil = app({ company: 'x"} OR in:anywhere {from:', title: '"} OR subject:hasło' })
    const query = buildQueries([evil], after).at(-1)!
    expect(query).not.toMatch(/\} OR/)
    expect(query).not.toContain("in:anywhere")
    expect(query).not.toContain("subject:hasło")
    expect(searchPhrase('a"} b')).toBeNull()
    expect(searchPhrase("Żabka Polska")).toBe('"Żabka Polska"')
    expect(searchPhrase("x")).toBeNull()
  })

  it("keeps each query within a URL's reach by splitting long lists", () => {
    const many = Array.from({ length: 200 }, (_, index) =>
      app({ id: `a${index}`, company: `Firma Numer ${index}`, domains: [`firma${index}.com`] })
    )
    const queries = buildQueries(many, after)
    expect(queries.length).toBeGreaterThan(3)
    for (const query of queries) expect(query.length).toBeLessThan(2100)
    expect(queries.join(" ")).toContain("from:firma199.com")
  })

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

describe("the gate on headers", () => {
  const reason = (over: Partial<MailHeaders>, ctx = context) => {
    const result = gateMessage(head(over), ctx)
    return result.pass ? "pass" : result.reason
  }

  it("lets mail from an employer through when the subject is about hiring", () => {
    expect(reason({})).toBe("pass")
  })

  it("turns away personal mail, even when it names the company or a role", () => {
    expect(reason({ from: "Anna Acme <anna@gmail.com>", subject: "Rozmowa o pracy" })).toBe(
      "free-mail"
    )
    expect(reason({ from: "Znajomy <kolega@wp.pl>", subject: "Twoja aplikacja" })).toBe("free-mail")
    expect(reason({ from: "bank@mbank.pl", subject: "Rozmowa o kredycie" })).toBe("not-allowed")
    expect(reason({ from: "me@example.com" })).toBe("self")
  })

  it("does not read other mail from a company you applied to", () => {
    expect(reason({ from: "sklep@acme.com", subject: "Twoje zamówienie 123" })).toBe(
      "private-subject"
    )
    expect(reason({ from: "sklep@acme.com", subject: "Dziś rabat 20%" })).toBe("subject")
    const hiring = "Rekrutacja"
    expect(reason({ from: "x@acme.com", subject: hiring, listUnsubscribe: true })).toBe("bulk")
    expect(reason({ from: "x@acme.com", subject: hiring, precedence: "bulk" })).toBe("bulk")
    expect(reason({ from: "x@acme.com", subject: hiring, labelIds: ["CATEGORY_PROMOTIONS"] })).toBe(
      "bulk"
    )
  })

  it("wants a phrase about hiring, not a word that turns up everywhere", () => {
    const fromAcme = (subject: string) => reason({ from: "x@acme.com", subject })
    for (const subject of [
      "Nowa wersja aplikacji Acme",
      "Aplikacja na telefon",
      "Praca w weekend",
      "Zgłoszenie serwisowe 123",
      "Etap 2 budowy",
      "Zadanie na jutro",
      "Your new role in the loyalty club",
      "Job done",
      "Your CV of the week",
      "Discount applied",
      "Rozmowa o kredycie",
    ]) {
      expect(["subject", "private-subject"]).toContain(fromAcme(subject))
    }
    for (const subject of [
      "Twoja aplikacja",
      "Twoja aplikacja na stanowisko CTO",
      "Dziękujemy za aplikację",
      "Zaproszenie na rozmowę kwalifikacyjną",
      "Rozmowa o pracy",
      "Rekrutacja: kolejny etap",
      "Your application to Acme",
      "Application received",
      "Thanks for applying",
      "Interview invitation",
    ]) {
      expect(fromAcme(subject)).toBe("pass")
    }
  })

  it("does not read contracts or pay, whatever system they come from", () => {
    expect(reason({ from: "x@personio.de", subject: "Umowa o pracę - aneks" })).toBe(
      "private-subject"
    )
    expect(reason({ from: "x@myworkday.com", subject: "Job Change: compensation update" })).toBe(
      "private-subject"
    )
    expect(reason({ from: "x@acme.com", subject: "Aplikacja o kredyt" })).toBe("private-subject")
  })

  it("does not read what a recruiting system sends the people hiring", () => {
    for (const subject of [
      "Scorecard due: Jan Kowalski interview",
      "New candidate for Backend Engineer",
      "Feedback needed for Anna Nowak",
      "3 new applicants",
      "Offer approval required",
      "Nowy kandydat: Jan Kowalski",
    ]) {
      expect(reason({ from: "no-reply@greenhouse-mail.io", subject })).toBe("hiring-side")
    }
  })

  it("does not read payslips, resets or invoices, even from a recruiting system", () => {
    expect(reason({ from: "x@personio.de", subject: "Pasek wynagrodzeń za październik" })).toBe(
      "private-subject"
    )
    expect(reason({ from: "x@bamboohr.com", subject: "Your leave request" })).toBe(
      "private-subject"
    )
    expect(reason({ from: "x@bamboohr.com", subject: "Company party" })).toBe("subject")
    expect(reason({ from: "x@greenhouse.io", subject: "Password reset" })).toBe("private-subject")
    expect(reason({ from: "x@lever.co", subject: "Invoice 12" })).toBe("private-subject")
  })

  it("does not read job alerts", () => {
    expect(reason({ from: "alerts@pracuj.pl", subject: "Nowe oferty dla Ciebie" })).toBe("alert")
    expect(reason({ from: "jobs-noreply@linkedin.com", subject: "New jobs for you" })).toBe("alert")
    expect(reason({ from: "news@linkedin.com", subject: "Twoja aplikacja" })).toBe("not-allowed")
  })

  it("takes recruiting systems, and one LinkedIn address only", () => {
    expect(reason({ from: "Acme <no-reply@us.greenhouse-mail.io>", subject: "Hello" })).toBe("pass")
    expect(
      reason({ from: "jobs-noreply@linkedin.com", subject: "Twoja aplikacja została wysłana" })
    ).toBe("pass")
    expect(reason({ from: "x@pracuj.pl", subject: "Aplikacja na stanowisko CTO" })).toBe("pass")
  })

  it("needs a known employer: an unknown company gets nothing", () => {
    expect(reason({ from: "hr@globex.com", subject: "Twoja aplikacja" })).toBe("not-allowed")
  })

  it("opens only for a known domain or one spelling the company, never a name", () => {
    const nowak = { mailbox: "me@example.com", apps: [app({ company: "Nowak", domains: [] })] }
    expect(
      reason({ from: "Anna Nowak <anna@firma-x.pl>", subject: "Rozmowa rekrutacyjna" }, nowak)
    ).toBe("not-allowed")
    expect(reason({ from: "x@nowak.pl", subject: "Rozmowa rekrutacyjna" }, nowak)).toBe("pass")
    expect(reason({ from: "hr@acme-group.com" })).toBe("not-allowed")
    expect(reason({ from: "Acme Careers <jobs@acme-recruit.net>" })).toBe("not-allowed")
    const bank = { mailbox: "me@example.com", apps: [app({ company: "Bank", domains: [] })] }
    expect(reason({ from: "x@aliorbank.pl", subject: "Twoja aplikacja" }, bank)).toBe("not-allowed")
  })

  it("does not let a company name open a service or a free mailbox", () => {
    for (const [company, from] of [
      ["LinkedIn", "news@linkedin.com"],
      ["GitHub", "noreply@github.com"],
      ["Google", "alerts@google.com"],
    ]) {
      const context = { mailbox: "me@example.com", apps: [app({ company, domains: [] })] }
      expect(reason({ from, subject: "Twoja aplikacja" }, context)).toBe("not-allowed")
    }
    for (const from of ["x@aol.com", "x@gmx.de", "x@pm.me", "x@yandex.com"]) {
      expect(reason({ from, subject: "Twoja aplikacja" })).toBe("free-mail")
    }
  })

  it("counts naming the role as being about the application, as whole words", () => {
    expect(reason({ from: "anna@acme.com", subject: "Re: Head of Engineering" })).toBe("pass")
    expect(reason({ from: "anna@acme.com", subject: "Lunch?" })).toBe("subject")
    const cto = { mailbox: "me@example.com", apps: [app({ title: "CTO" })] }
    expect(reason({ from: "anna@acme.com", subject: "Re: CTO" }, cto)).toBe("pass")
    expect(reason({ from: "anna@acme.com", subject: "Factory update" }, cto)).toBe("subject")
  })

  it("vouches only for mail written to this mailbox", () => {
    const pass = gateMessage(head(), context)
    expect(pass).toMatchObject({ pass: true, authenticated: true })
    const elsewhere = gateMessage(head({ recipients: ["someone@else.com"] }), context)
    expect(elsewhere).toMatchObject({ pass: true, authenticated: false })
    const nobody = gateMessage(head({ recipients: [] }), context)
    expect(nobody).toMatchObject({ pass: true, authenticated: false })
    expect(isAddressedTo(["Me <m.e+jobs@gmail.com>, x@y.pl"], "me@gmail.com")).toBe(true)
    expect(isAddressedTo(["x@y.pl", "ME@EXAMPLE.COM"], "me@example.com")).toBe(true)
    expect(isAddressedTo(["me@example.com.evil.io"], "me@example.com")).toBe(false)
  })

  it("stays fast on a hostile header", () => {
    const started = Date.now()
    const long = "a".repeat(200_000)
    gateMessage(head({ from: `${long}<x@acme.com>`, subject: long, recipients: [long] }), context)
    gateMessage(head({ from: "<".repeat(200_000), subject: "ab ".repeat(70_000) }), context)
    expect(Date.now() - started).toBeLessThan(500)
  })

  it("refuses hidden mail and malformed senders", () => {
    expect(reason({ labelIds: ["SPAM"] })).toBe("label")
    expect(reason({ labelIds: ["SENT"] })).toBe("label")
    expect(reason({ from: "a@acme.com, b@acme.com" })).toBe("sender")
    expect(reason({ from: "not an address" })).toBe("sender")
  })

  it("reads the real address, not the one in the display name", () => {
    expect(parseFrom('"hr@acme.com" <evil@bad.io>')).toEqual({
      address: "evil@bad.io",
      domain: "bad.io",
      name: "",
    })
    expect(reason({ from: '"hr@acme.com" <evil@bad.io>' })).toBe("not-allowed")
    expect(parseFrom("Acme HR <HR@Acme.com>")).toEqual({
      address: "hr@acme.com",
      domain: "acme.com",
      name: "Acme HR",
    })
  })
})

describe("sender authentication", () => {
  it("accepts DMARC or aligned DKIM, as Gmail reports them", () => {
    expect(isAuthenticated([PASS], "acme.com")).toBe(true)
    expect(isAuthenticated(["mx.google.com; dkim=pass header.i=@mail.acme.com"], "acme.com")).toBe(
      true
    )
  })

  it("does not count SPF, whose address the sender chooses", () => {
    expect(
      isAuthenticated(["mx.google.com; spf=pass (ok) smtp.mailfrom=bounce@acme.com"], "acme.com")
    ).toBe(false)
    expect(
      isAuthenticated(
        ['mx.google.com; spf=pass smtp.mailfrom="x;dkim=pass header.d=acme.com y"@evil.com'],
        "acme.com"
      )
    ).toBe(false)
  })

  it("does not let a public suffix stand in for an organisation", () => {
    expect(isAuthenticated(["mx.google.com; dkim=pass header.d=evil.co.il"], "acme.co.il")).toBe(
      false
    )
    expect(
      isAuthenticated(["mx.google.com; dkim=pass header.d=mail.acme.co.il"], "acme.co.il")
    ).toBe(true)
  })

  it("rejects a pass for some other domain", () => {
    expect(isAuthenticated(["mx.google.com; dkim=pass header.i=@evil.com"], "acme.com")).toBe(false)
    expect(isAuthenticated(["mx.google.com; dmarc=pass header.from=evil.com"], "acme.com")).toBe(
      false
    )
    expect(isAuthenticated(["mx.google.com; spf=pass smtp.mailfrom=x@evil.com"], "acme.com")).toBe(
      false
    )
  })

  it("ignores a forged header below Gmail's own", () => {
    const forged = [
      "mx.google.com; dkim=fail; dmarc=fail",
      "mx.google.com; dkim=pass header.i=@acme.com",
    ]
    expect(isAuthenticated(forged, "acme.com")).toBe(false)
  })

  it("trusts only Gmail's servers", () => {
    expect(isAuthenticated(["evil.com; dkim=pass header.i=@acme.com"], "acme.com")).toBe(false)
    expect(isAuthenticated([], "acme.com")).toBe(false)
    expect(
      isAuthenticated(
        ["mx.google.com; dkim=pass (mx.google.com; dkim=pass header.i=@acme.com)"],
        "acme.com"
      )
    ).toBe(false)
  })
})

describe("message text", () => {
  const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url")

  it("prefers plain text, skips attachments, and walks nested parts", () => {
    const text = messageText({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: encode("Dzień dobry") } },
            { mimeType: "text/html", body: { data: encode("<p>HTML</p>") } },
          ],
        },
        { mimeType: "text/plain", filename: "cv.txt", body: { data: encode("ATTACHMENT") } },
      ],
    })
    expect(text).toBe("Dzień dobry")
  })

  it("falls back to HTML as text, without scripts", () => {
    const text = messageText({
      mimeType: "text/html",
      body: {
        data: encode("<style>x{}</style><p>Hello <b>there</b></p><script>alert(1)</script>"),
      },
    })
    expect(text).toContain("Hello")
    expect(text).not.toContain("alert")
    expect(text).not.toContain("<")
  })

  it("reads ISO-8859-2 mail", () => {
    const bytes = Buffer.from([0x62, 0xb3, 0xb1, 0x64]) // "błąd"
    const text = messageText({
      mimeType: "text/plain",
      headers: [{ name: "Content-Type", value: 'text/plain; charset="ISO-8859-2"' }],
      body: { data: bytes.toString("base64url") },
    })
    expect(text).toBe("błąd")
  })

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

  it("caps what it passes on", () => {
    const data = Buffer.from("a b ".repeat(100_000), "utf8").toString("base64url")
    expect(messageText({ mimeType: "text/plain", body: { data } }).length).toBeLessThanOrEqual(
      20_000
    )
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

describe("company and role from a confirmation", () => {
  it.each([
    ["Application for Staff Engineer at Hooli", "", "Hooli", "Staff Engineer"],
    ["Re: Your application for the CTO role at Hooli", "", "Hooli", "CTO"],
    ["Aplikacja na stanowisko Tester w Hooli", "", "Hooli", "Tester"],
    ["Thank you for applying to Hooli", "", "Hooli", null],
    ["Your application to Hooli for Staff Engineer", "", "Hooli", "Staff Engineer"],
    ["Application for Staff Engineer", "Hooli Hiring Team", "Hooli", "Staff Engineer"],
  ])("%s", (subject, name, company, title) => {
    expect(factsFromMail(subject, name)).toEqual({ company, title })
  })

  it("does not take a recruiting system for the company", () => {
    expect(companyFromSenderName("Greenhouse")).toBeNull()
    expect(companyFromSenderName("no-reply")).toBeNull()
    expect(companyFromSenderName("Hooli via Lever")).toBe("Hooli")
    expect(companyFromSenderName("Hooli Careers")).toBe("Hooli")
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
  const facts = { company: null, title: null }
  const input = (over: Partial<Parameters<typeof decide>[0]> = {}) => ({
    signal: "REJECTED" as const,
    sure: true,
    authenticated: true,
    autoApply: true,
    match: { application: app(), certain: true, candidates: [app()] },
    receivedAt: new Date("2026-10-20T10:00:00Z"),
    facts,
    ...over,
  })

  it("changes a status when everything holds", () => {
    expect(decide(input())).toEqual({
      outcome: "APPLIED",
      applicationId: "a1",
      fromStatus: "APPLIED",
      toStatus: "REJECTED",
    })
  })

  it.each<[string, Partial<Parameters<typeof decide>[0]>]>([
    ["the sender is not verified", { authenticated: false }],
    ["the text is unclear", { sure: false }],
    ["the person turned automation off", { autoApply: false }],
    [
      "the match is a guess",
      { match: { application: app(), certain: false, candidates: [app()] } },
    ],
    [
      "the person changed it after this mail",
      {
        match: {
          application: app({ statusChangedAt: new Date("2026-10-21T10:00:00Z") }),
          certain: true,
          candidates: [],
        },
      },
    ],
  ])("asks when %s", (_label, over) => {
    expect(decide(input(over))).toMatchObject({
      outcome: "PENDING",
      toStatus: "REJECTED",
      applicationId: "a1",
    })
  })

  it("asks before a rejection for another role closes this application", () => {
    const platform = app({ title: "Platform Engineer" })
    const text = "We regret to inform you that we will not proceed with your application."
    const subject = "Your application for Data Engineer at Acme"
    const reading = classifyByRules(subject, text)
    const match = matchApplication(
      {
        sender: { address: "jobs@acme.com", domain: "acme.com", name: "Acme" },
        tier: "company",
        subject,
        text,
        receivedAt: new Date("2026-10-20T10:00:00Z"),
      },
      [platform]
    )
    expect(reading).toMatchObject({ signal: "REJECTED", sure: true })
    expect(decide(input({ signal: reading.signal, sure: reading.sure, match }))).toMatchObject({
      outcome: "PENDING",
      applicationId: "a1",
      toStatus: "REJECTED",
    })
  })

  it("never takes an offer from mail alone", () => {
    expect(decide(input({ signal: "OFFER" }))).toMatchObject({
      outcome: "PENDING",
      toStatus: "OFFER",
    })
  })

  it("does not act on someone already at the offer stage", () => {
    const atOffer = app({ status: "OFFER" })
    expect(
      decide(input({ match: { application: atOffer, certain: true, candidates: [atOffer] } }))
    ).toMatchObject({ outcome: "PENDING" })
  })

  it("does not reopen silence on its own", () => {
    const ghosted = app({ status: "GHOSTED" })
    expect(
      decide(
        input({
          signal: "INTERVIEW",
          match: { application: ghosted, certain: true, candidates: [ghosted] },
        })
      )
    ).toMatchObject({ outcome: "PENDING", toStatus: "INTERVIEW" })
  })

  it("never moves backward", () => {
    const final = app({ status: "FINAL" })
    expect(
      decide(
        input({
          signal: "SCREENING",
          match: { application: final, certain: true, candidates: [final] },
        })
      )
    ).toMatchObject({ outcome: "NOTED", toStatus: null })
    expect(targetStatus("INTERVIEW", "TASK")).toBeNull()
    expect(targetStatus("INTERVIEW", "SCREENING")).toBe("INTERVIEW")
  })

  it("maps 'next stage' onto the funnel", () => {
    expect(targetStatus("NEXT_STAGE", "APPLIED")).toBe("SCREENING")
    expect(targetStatus("NEXT_STAGE", "SCREENING")).toBe("INTERVIEW")
    expect(targetStatus("NEXT_STAGE", "INTERVIEW")).toBeNull()
  })

  it("only puts a confirmation on the timeline, and only from a vouched-for sender", () => {
    expect(decide(input({ signal: "CONFIRMATION" }))).toMatchObject({
      outcome: "NOTED",
      applicationId: "a1",
      toStatus: null,
    })
    expect(decide(input({ signal: "CONFIRMATION", authenticated: false }))).toMatchObject({
      outcome: "IGNORED",
      applicationId: null,
    })
  })

  it("keeps a stranger's subject off the timeline when nothing moves either", () => {
    const final = app({ status: "FINAL" })
    expect(
      decide(
        input({
          signal: "SCREENING",
          authenticated: false,
          match: { application: final, certain: true, candidates: [final] },
        })
      )
    ).toMatchObject({ outcome: "IGNORED" })
  })

  it("never adds an application alone: each one widens what gets read", () => {
    const none = { application: null, certain: false, candidates: [] }
    const known = { company: "Hooli", title: "CTO" }
    for (const over of [{}, { authenticated: false }, { autoApply: false }]) {
      expect(
        decide(input({ signal: "CONFIRMATION", match: none, facts: known, ...over }))
      ).toMatchObject({ outcome: "PENDING", applicationId: null })
    }
    expect(
      decide(
        input({ signal: "CONFIRMATION", match: none, facts: { company: "Hooli", title: null } })
      )
    ).toMatchObject({ outcome: "IGNORED" })
  })

  it("leaves unmatched news for the person, and ignores the rest", () => {
    const none = { application: null, certain: false, candidates: [] }
    expect(decide(input({ match: none }))).toMatchObject({
      outcome: "PENDING",
      toStatus: "REJECTED",
      applicationId: null,
    })
    expect(decide(input({ signal: "OTHER" }))).toMatchObject({ outcome: "IGNORED" })
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

describe("OAuth", () => {
  it("asks for the read-only scope alone, with PKCE and a refresh token", () => {
    const url = new URL(
      gmailAuthorizeUrl({
        clientId: "id",
        redirectUri: "http://127.0.0.1/cb",
        state: "s",
        codeChallenge: "c",
      })
    )
    expect(url.searchParams.get("scope")).toBe(GMAIL_SCOPE)
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("access_type")).toBe("offline")
    expect(url.searchParams.get("prompt")).toBe("consent")
    expect(url.searchParams.has("include_granted_scopes")).toBe(false)
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    )
  })

  it("refuses anything but exactly that scope", () => {
    expect(grantProblem(GMAIL_SCOPE)).toBeNull()
    expect(grantProblem("")).toBe("missing")
    expect(grantProblem("email")).toBe("missing")
    expect(grantProblem(`${GMAIL_SCOPE} https://www.googleapis.com/auth/gmail.send`)).toBe(
      "broader"
    )
    expect(grantProblem("https://mail.google.com/")).toBe("missing")
  })

  const reply = (ok: boolean, status: number, payload: unknown) => async () => ({
    ok,
    status,
    json: async () => payload,
  })

  it("exchanges a code", async () => {
    const grant = await exchangeGmailCode(
      { code: "c", codeVerifier: "v", clientId: "i", clientSecret: "s", redirectUri: "r" },
      reply(true, 200, { access_token: "a", refresh_token: "r", scope: GMAIL_SCOPE })
    )
    expect(grant).toEqual({ accessToken: "a", refreshToken: "r", scope: GMAIL_SCOPE })
  })

  it("tells a revoked grant from a passing failure", async () => {
    const args = { refreshToken: "r", clientId: "i", clientSecret: "s" }
    expect(await refreshAccessToken(args, reply(false, 400, { error: "invalid_grant" }))).toEqual({
      error: "reconnect",
    })
    expect(await refreshAccessToken(args, reply(false, 500, {}))).toEqual({ error: "http" })
    expect(
      await refreshAccessToken(args, async () => {
        throw new Error("down")
      })
    ).toEqual({ error: "network" })
    expect(
      await refreshAccessToken(args, reply(true, 200, { access_token: "a", scope: GMAIL_SCOPE }))
    ).toEqual({ accessToken: "a" })
    expect(
      await refreshAccessToken(args, reply(true, 200, { access_token: "a", scope: "email" }))
    ).toEqual({ error: "reconnect" })
  })

  it("treats an already dead token as revoked", async () => {
    expect(await revokeGoogleToken("t", reply(false, 400, { error: "invalid_token" }))).toBe(true)
    expect(await revokeGoogleToken("t", reply(false, 500, {}))).toBe(false)
  })
})

describe("the Gmail reader", () => {
  function fake(payload: unknown, status = 200) {
    const urls: string[] = []
    const fetchImpl = async (url: string, init?: RequestInit) => {
      urls.push(`${init?.method} ${url}`)
      return { ok: status < 400, status, json: async () => payload }
    }
    return { urls, reader: createGmailReader("token", fetchImpl) }
  }

  it("refuses a search without a sender list", async () => {
    const { reader, urls } = fake({})
    await expect(reader.search("in:anywhere")).rejects.toThrow(/from:/)
    await expect(reader.search("")).rejects.toThrow(/from:/)
    expect(urls).toEqual([])
  })

  it("opens only what an allowed search returned", async () => {
    const { reader, urls } = fake({ messages: [{ id: "m1" }] })
    await expect(reader.headers("other")).rejects.toThrow(/allowed search/)
    await expect(reader.body("other")).rejects.toThrow(/allowed search/)
    expect(urls).toEqual([])
    await reader.search("{from:acme.com}")
    await reader.headers("m1")
    await expect(reader.body("m2")).rejects.toThrow(/allowed search/)
  })

  it("asks for named headers and fields, with GET only, on the messages endpoint", async () => {
    const { reader, urls } = fake({ messages: [{ id: "m1" }] })
    await reader.search("{from:acme.com}")
    await reader.headers("m1")
    await reader.body("m1")
    expect(urls).toHaveLength(3)
    for (const url of urls) {
      expect(url.startsWith("GET https://gmail.googleapis.com/gmail/v1/users/me/messages")).toBe(
        true
      )
    }
    const metadata = new URL(urls[1].slice(4))
    expect(metadata.searchParams.get("format")).toBe("metadata")
    expect(metadata.searchParams.get("fields")).not.toContain("snippet")
    expect(metadata.searchParams.getAll("metadataHeaders")).toContain("Authentication-Results")
    expect(urls.join(" ")).not.toMatch(/attachments|threads|history|send|modify|trash|drafts/)
  })

  it("keeps Authentication-Results in message order", async () => {
    const { reader } = fake({ messages: [{ id: "m1" }] })
    await reader.search("{from:acme.com}")
    const gmail = createGmailReader("t", async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        messages: [{ id: "m1" }],
        internalDate: "1790000000000",
        labelIds: ["INBOX"],
        payload: {
          headers: [
            { name: "Authentication-Results", value: "first" },
            { name: "From", value: "a@b.pl" },
            { name: "authentication-results", value: "second" },
            { name: "Precedence", value: " Bulk " },
          ],
        },
      }),
    }))
    await gmail.search("{from:b.pl}")
    expect(await gmail.headers("m1")).toMatchObject({
      authResults: ["first", "second"],
      from: "a@b.pl",
      precedence: "bulk",
      receivedAt: new Date(1790000000000),
    })
  })

  it("maps failures, and never repeats what Google said", async () => {
    const status = (code: number, body: unknown = {}) =>
      createGmailReader("t", async () => ({
        ok: false,
        status: code,
        json: async () => body,
      })).mailbox()
    await expect(status(401)).rejects.toMatchObject({ code: "reconnect" })
    await expect(status(403)).rejects.toMatchObject({ code: "reconnect" })
    await expect(status(429)).rejects.toMatchObject({ code: "rate-limit" })
    await expect(
      status(403, { error: { errors: [{ reason: "userRateLimitExceeded" }] } })
    ).rejects.toMatchObject({ code: "rate-limit" })
    await expect(status(500)).rejects.toMatchObject({ code: "http" })
    await expect(
      createGmailReader("t", async () => {
        throw new Error("secret detail")
      }).mailbox()
    ).rejects.toMatchObject({ code: "network", message: "Gmail did not answer." })
  })

  it("treats a message deleted meanwhile as gone", async () => {
    let calls = 0
    const reader = createGmailReader("t", async () => {
      calls += 1
      return calls === 1
        ? { ok: true, status: 200, json: async () => ({ messages: [{ id: "m1" }] }) }
        : { ok: false, status: 404, json: async () => ({}) }
    })
    await reader.search("{from:a.pl}")
    expect(await reader.headers("m1")).toBeNull()
  })
})
