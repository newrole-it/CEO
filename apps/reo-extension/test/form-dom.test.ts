// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as Form from "../lib/form.js"

type Entry = {
  kind: string
  el: HTMLInputElement
  inputs: HTMLInputElement[]
  field: {
    key: string
    label: string
    type: string
    options?: string[]
    required?: boolean
    section?: string
  }
}
type Collection = { fields: Entry["field"][]; entries: Map<string, Entry> }

const F = Form as unknown as {
  labelFor(el: Element): string
  neverTouch(field: Partial<Entry["field"]> & { autocomplete?: string; name?: string }): boolean
  isApplicationForm(scope: Element, doc: Document, href: string, hostname: string): boolean
  isContactField(field: Partial<Entry["field"]>): boolean
  collectFields(root: Element): Collection
  findApplicationRoot(
    doc: Document,
    options?: { hostname?: string; force?: boolean }
  ): Element | null
  setNativeValue(el: Element, value: string): void
  fillEntry(entry: Entry, value: string): Promise<string>
  fillFile(el: Element, file: unknown): boolean
  readValue(entry: Entry): string
  submitLikeTarget(target: Element): Element | null
  nextStepTarget(target: Element): Element | null
  mergeSteps(
    earlier: { label: string; value: string }[],
    rows: { label: string; value: string }[]
  ): { label: string; value: string }[]
  hasEmptyRequired(collection: Collection): boolean
  snapshot(
    collection: Collection,
    kinds?: Record<string, string>
  ): { label: string; value: string; kind?: string }[]
  pageInfo(
    doc: Document,
    href: string
  ): { url: string; title: string; text: string; siteName?: string }
}

function mount(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body
}

function byLabel(collection: Collection, label: string): Entry {
  for (const entry of collection.entries.values()) if (entry.field.label === label) return entry
  throw new Error(
    `no field "${label}": ${collection.fields.map((field) => field.label).join(" | ")}`
  )
}

beforeEach(() => {
  document.head.innerHTML = ""
  document.body.innerHTML = ""
})

describe("labelFor", () => {
  it("reads Greenhouse, Lever and Ashby markup", () => {
    mount(`
      <div class="field"><label for="first_name">First Name <span class="asterisk">*</span></label><input id="first_name"></div>
      <li class="application-question"><label>
        <div class="application-label">Full name<span class="required">✱</span></div>
        <div class="application-field"><input id="lever" name="name"></div>
      </label></li>
      <label id="q-label">Why us?</label><textarea id="ashby" aria-labelledby="q-label"></textarea>
      <input id="aria" aria-label="Phone number">
      <div><p>Current location</p><div><input id="near"></div></div>
      <input id="ph" placeholder="Twój e-mail">
      <label>Kraj <select id="sel"><option>Polska</option><option>Niemcy</option></select></label>
    `)
    const label = (id: string) => F.labelFor(document.getElementById(id)!)
    expect(label("first_name")).toBe("First Name")
    expect(label("lever")).toBe("Full name")
    expect(label("ashby")).toBe("Why us?")
    expect(label("aria")).toBe("Phone number")
    expect(label("near")).toBe("Current location")
    expect(label("sel")).toBe("Kraj")
  })
})

describe("collectFields", () => {
  it("groups radios, reads options and leaves out passwords, hidden inputs and buttons", () => {
    const root = mount(`
      <form>
        <input type="hidden" name="token" value="secret">
        <label>Password <input type="password" name="pw"></label>
        <label>Email <input type="email" name="email" required></label>
        <label for="c">Country</label>
        <select id="c"><option value="">Select</option><option value="pl">Poland</option></select>
        <fieldset>
          <legend>Are you willing to relocate?</legend>
          <label><input type="radio" name="r" value="y"> Yes</label>
          <label><input type="radio" name="r" value="n"> No</label>
        </fieldset>
        <label>Resume <input type="file" name="resume" style="display:none"></label>
        <button type="submit">Submit</button>
      </form>
    `)
    const { fields } = F.collectFields(root)
    expect(fields.map((field) => field.label)).toEqual([
      "Email",
      "Country",
      "Are you willing to relocate?",
      "Resume",
    ])
    expect(fields[0].required).toBe(true)
    expect(fields[1].options).toEqual(["Select", "Poland"])
    expect(fields[2]).toMatchObject({ type: "radio", options: ["Yes", "No"] })
    expect(fields[3].type).toBe("file")
  })

  it("skips hidden fields and reads the section above a field", () => {
    const root = mount(`
      <form>
        <div hidden><label>In a hidden block <input name="a"></label></div>
        <label>Hidden itself <input name="b" style="display:none"></label>
        <h2>Voluntary Self-Identification</h2>
        <div><label for="x">Please select</label><select id="x"><option>A</option></select></div>
      </form>
    `)
    const { fields } = F.collectFields(root)
    expect(fields).toHaveLength(1)
    expect(fields[0].section).toBe("Voluntary Self-Identification")
    expect(F.neverTouch(fields[0])).toBe(true)
  })
})

describe("findApplicationRoot", () => {
  it("finds a form with enough fields and an email, file or textarea", () => {
    mount(`
      <form id="search"><input name="q" type="search"></form>
      <form id="apply">
        <label>Name <input name="name"></label>
        <label>Email <input type="email" name="email"></label>
        <label>CV <input type="file" name="cv"></label>
      </form>
    `)
    expect(F.findApplicationRoot(document)?.id).toBe("apply")
  })

  it("ignores log-in forms and small forms, unless the site is a known ATS", () => {
    mount(`<form id="login"><label>Email <input type="email"></label><label>Pass <input type="password"></label>
      <label>Remember <input type="text"></label></form>`)
    expect(F.findApplicationRoot(document)).toBeNull()
    mount(`<form id="small"><label>Email <input type="email"></label></form>`)
    expect(F.findApplicationRoot(document)).toBeNull()
    expect(F.findApplicationRoot(document, { hostname: "jobs.lever.co" })?.id).toBe("small")
    expect(F.findApplicationRoot(document, { hostname: "acme.teamtailor.com" })?.id).toBe("small")
    expect(F.findApplicationRoot(document, { force: true })?.id).toBe("small")
  })

  it("accepts a page without a form element", () => {
    mount(`<div><label>Name <input name="name"></label><label>Email <input type="email"></label>
      <label>About <textarea></textarea></label></div>`)
    expect(F.findApplicationRoot(document)).toBe(document.body)
  })
})

describe("filling", () => {
  it("sets a React-like input through the prototype setter and fires events", async () => {
    const root = mount(`<form><label>City <input id="city"></label></form>`)
    const input = document.getElementById("city") as HTMLInputElement
    // What React does: wraps value on the instance. A plain assignment would only hit this wrapper.
    let tracked = ""
    Object.defineProperty(input, "value", {
      configurable: true,
      get() {
        return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.get!.call(this)
      },
      set(next: string) {
        tracked = next
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(this, next)
      },
    })
    const events: string[] = []
    for (const type of ["input", "change", "blur"])
      input.addEventListener(type, () => events.push(type))
    const entry = byLabel(F.collectFields(root), "City")
    expect(await F.fillEntry(entry, "Warszawa")).toBe("filled")
    expect(input.value).toBe("Warszawa")
    expect(tracked).toBe("")
    expect(events).toEqual(["input", "change", "blur"])
  })

  it("selects options by text and radios by label, and reports no match", async () => {
    const root = mount(`
      <form>
        <label for="c">Country</label>
        <select id="c"><option value="">Select</option><option value="pl">Poland</option><option value="de">Germany</option></select>
        <fieldset><legend>Sponsorship?</legend>
          <label><input type="radio" name="s" value="1"> Yes</label>
          <label><input type="radio" name="s" value="0"> No</label>
        </fieldset>
        <label for="n">Level</label><select id="n"><option value="">-</option><option value="1">No experience</option></select>
      </form>
    `)
    const collection = F.collectFields(root)
    const changes = vi.fn()
    document.getElementById("c")!.addEventListener("change", changes)
    expect(await F.fillEntry(byLabel(collection, "Country"), "Poland")).toBe("filled")
    expect((document.getElementById("c") as HTMLSelectElement).value).toBe("pl")
    expect(changes).toHaveBeenCalledTimes(1)
    expect(await F.fillEntry(byLabel(collection, "Sponsorship?"), "No")).toBe("filled")
    expect((document.querySelector("input[value='0']") as HTMLInputElement).checked).toBe(true)
    expect(await F.fillEntry(byLabel(collection, "Level"), "Not sure")).toBe("failed")
  })

  it("does not overwrite what the person typed", async () => {
    const root = mount(`<form><label>City <input value="Gdańsk"></label></form>`)
    expect(await F.fillEntry(byLabel(F.collectFields(root), "City"), "Warszawa")).toBe("exists")
    expect((document.querySelector("input") as HTMLInputElement).value).toBe("Gdańsk")
  })

  it("fills contenteditable fields", async () => {
    const root = mount(
      `<form><label id="l">About</label><div id="ce" contenteditable="true" aria-labelledby="l"></div></form>`
    )
    const entry = byLabel(F.collectFields(root), "About")
    expect(entry.field.type).toBe("contenteditable")
    expect(await F.fillEntry(entry, "Tekst")).toBe("filled")
    expect(document.getElementById("ce")!.textContent).toBe("Tekst")
  })

  it("attaches a file through DataTransfer", () => {
    const root = mount(`<form><label>CV <input type="file"></label></form>`)
    const entry = byLabel(F.collectFields(root), "CV")
    const file = new File(["%PDF"], "cv.pdf", { type: "application/pdf" })
    // jsdom has no DataTransfer, and its input.files setter refuses anything but its own FileList.
    Object.defineProperty(entry.el, "files", { configurable: true, writable: true, value: null })
    const added: File[] = []
    ;(globalThis as unknown as { DataTransfer: unknown }).DataTransfer = class {
      files = added
      items = { add: (item: File) => added.push(item) }
    }
    const changes = vi.fn()
    entry.el.addEventListener("change", changes)
    expect(F.fillFile(entry.el, file)).toBe(true)
    expect(changes).toHaveBeenCalledTimes(1)
    expect(F.readValue(entry)).toBe("cv.pdf")
  })
})

describe("never-touch rules", () => {
  it("refuses secrets, EEO, consents and every single checkbox", async () => {
    const refused = [
      { label: "Password", type: "password" },
      { label: "Token", type: "hidden" },
      { label: "PESEL", type: "text" },
      { label: "Card number", type: "text", autocomplete: "cc-number" },
      { label: "Gender", type: "select" },
      { label: "Płeć", type: "radio", options: ["Kobieta", "Mężczyzna"] },
      { label: "Veteran Status", type: "select" },
      { label: "Disability Status", type: "select" },
      { label: "Pronouns", type: "text" },
      { label: "Data urodzenia", type: "date" },
      { label: "Age", type: "number" },
      { label: "Please select", type: "select", section: "Voluntary Self-Identification" },
      { label: "I agree to the Privacy Policy", type: "checkbox" },
      { label: "Wyrażam zgodę na przetwarzanie danych", type: "checkbox" },
      { label: "Subscribe", type: "checkbox" },
    ]
    for (const field of refused)
      expect([field.label, F.neverTouch(field)]).toEqual([field.label, true])
    const allowed = [
      { label: "Email", type: "email" },
      { label: "Why do you want to manage our platform?", type: "textarea" },
      { label: "Languages", type: "select" },
      { label: "Experience with Swift", type: "text" },
      { label: "Sponsorship?", type: "radio", options: ["Yes", "No"] },
    ]
    for (const field of allowed)
      expect([field.label, F.neverTouch(field)]).toEqual([field.label, false])

    const root = mount(`<form>
      <label for="g">Gender</label><select id="g"><option value="">-</option><option value="m">Male</option></select>
      <label><input type="checkbox" id="ok" name="consent"> I agree to the Privacy Policy</label>
    </form>`)
    const collection = F.collectFields(root)
    expect(await F.fillEntry(byLabel(collection, "Gender"), "Male")).toBe("refused")
    expect((document.getElementById("g") as HTMLSelectElement).value).toBe("")
    expect(await F.fillEntry(byLabel(collection, "I agree to the Privacy Policy"), "yes")).toBe(
      "refused"
    )
    expect((document.getElementById("ok") as HTMLInputElement).checked).toBe(false)
  })
})

describe("submission", () => {
  it("recognises final submit buttons and ignores the rest", () => {
    mount(`
      <button id="a">Submit Application</button>
      <button id="b">Wyślij aplikację</button>
      <button id="c"><span id="c2">Aplikuj</span></button>
      <input id="d" type="submit" value="Send">
      <button id="e">Apply with LinkedIn</button>
      <button id="f">Next</button>
      <button id="g">Attach resume</button>
      <a id="h" href="#">Apply for this job</a>
      <button id="i">Dalej</button>
    `)
    const hit = (id: string) => F.submitLikeTarget(document.getElementById(id)!)
    for (const id of ["a", "b", "c2", "d"]) expect([id, Boolean(hit(id))]).toEqual([id, true])
    for (const id of ["e", "f", "g", "h", "i"]) expect([id, Boolean(hit(id))]).toEqual([id, false])
  })

  it("waits for required fields", () => {
    const root = mount(
      `<form><label>Email <input type="email" required></label><label>Why? <textarea></textarea></label></form>`
    )
    const collection = F.collectFields(root)
    expect(F.hasEmptyRequired(collection)).toBe(true)
    ;(document.querySelector("input") as HTMLInputElement).value = "a@b.pl"
    expect(F.hasEmptyRequired(collection)).toBe(false)
  })

  it("snapshots salary, notice period and start date, which are answers and not contact details", () => {
    const root = mount(`<form>
      <label>Salary expectations <input value="20 000 - 25 000 PLN"></label>
      <label>Oczekiwania finansowe <input value="22 000 PLN"></label>
      <label>Okres wypowiedzenia <input value="1 miesiąc"></label>
      <label>Start date <input value="2026-12-01"></label>
      <label>Available from <input value="od zaraz"></label>
    </form>`)
    expect(F.snapshot(F.collectFields(root)).map((row) => row.value)).toEqual([
      "20 000 - 25 000 PLN",
      "22 000 PLN",
      "1 miesiąc",
      "2026-12-01",
      "od zaraz",
    ])
  })

  it("tells the next step from sending the form", () => {
    const button = (text: string, attrs = "") => {
      mount(`<button ${attrs}>${text}</button>`)
      return document.querySelector("button") as Element
    }
    for (const text of ["Dalej", "Next", "Continue", "Save and Continue", "Przejrzyj"]) {
      const el = button(text)
      expect([text, F.nextStepTarget(el)]).toEqual([text, el])
      expect([text, F.submitLikeTarget(el)]).toEqual([text, null])
    }
    const labelled = button("Dalej", 'aria-label="Przejdź do następnego kroku"')
    expect(F.nextStepTarget(labelled)).toBe(labelled)
    for (const text of ["Wyślij aplikację", "Submit application", "Review and submit"]) {
      expect([text, F.nextStepTarget(button(text))]).toEqual([text, null])
    }
    expect(F.nextStepTarget(button("Anuluj"))).toBeNull()
  })

  it("merges steps: a step visited again replaces what it said", () => {
    const merged = F.mergeSteps(
      [
        { label: "Why us?", value: "Stare" },
        { label: "Salary", value: "20k" },
      ],
      [
        { label: "Why us?", value: "Nowe" },
        { label: "Employer", value: "Acme" },
        { label: "Employer", value: "Bravo" },
      ]
    )
    expect(merged).toEqual([
      { label: "Salary", value: "20k" },
      { label: "Why us?", value: "Nowe" },
      { label: "Employer", value: "Acme" },
      { label: "Employer", value: "Bravo" },
    ])
  })

  it("snapshots questions only: no contact details, EEO, consents, files or secrets", () => {
    const root = mount(`<form>
      <label>First Name <input value="Rafał"></label>
      <label>Name <input value="Rafał W."></label>
      <label>Email <input type="email" value="a@b.pl"></label>
      <label>Phone <input type="tel" value="600000000"></label>
      <label>City <input value="Warszawa"></label>
      <label>LinkedIn Profile <input value="https://linkedin.com/in/x"></label>
      <label>Twitter <input value="@mw"></label>
      <label>PESEL <input value="90010112345"></label>
      <label>Password <input type="password" value="hunter2"></label>
      <input type="hidden" name="csrf" value="abc">
      <label for="g">Gender</label><select id="g"><option value="m" selected>Male</option></select>
      <label><input type="checkbox" name="consent" checked> I agree to the Privacy Policy</label>
      <label>Why do you want to join us? <textarea>Bo tak.</textarea></label>
      <label for="k">Used Kubernetes?</label><select id="k"><option value="1" selected>Yes</option></select>
      <label>Empty question? <textarea></textarea></label>
    </form>`)
    const collection = F.collectFields(root)
    const rows = F.snapshot(collection, {
      [byLabel(collection, "Why do you want to join us?").field.key]: "openQuestion",
    })
    expect(rows).toEqual([
      {
        label: "Why do you want to join us?",
        value: "Bo tak.",
        type: "textarea",
        kind: "openQuestion",
      },
      { label: "Used Kubernetes?", value: "Yes", type: "select" },
    ])
    const sent = JSON.stringify(rows)
    for (const secret of [
      "Rafał",
      "a@b.pl",
      "600000000",
      "Warszawa",
      "linkedin",
      "@mw",
      "90010112345",
      "hunter2",
      "abc",
      "Male",
    ]) {
      expect(sent).not.toContain(secret)
    }
  })

  it("does not take a question about the work for contact details or EEO", () => {
    const root = mount(`<form>
      <label>Jaki ostatnio produkt zrobiłeś przy pomocy AI? <textarea>Asystenta.</textarea></label>
      <label>What is the name of the last product you built? <input value="Lumen"></label>
      <label>Have you built mobile apps? <input value="Tak"></label>
      <label>Which location do you prefer to work from? <input value="Zdalnie"></label>
      <label>How do you handle race conditions? <textarea>Blokady.</textarea></label>
      <label>How did you build this product for disabled users? <textarea>WCAG.</textarea></label>
      <label>Product name <input value="Lumen"></label>
      <label>What is your phone? <input value="600000000"></label>
    </form>`)
    expect(F.snapshot(F.collectFields(root)).map((row) => row.value)).toEqual([
      "Asystenta.",
      "Lumen",
      "Tak",
      "Zdalnie",
      "Blokady.",
      "WCAG.",
      "Lumen",
    ])
  })

  it("records on its own only what looks like a job application", () => {
    const form = (html: string) => {
      mount(`<form>${html}</form>`)
      return document.querySelector("form") as Element
    }
    const check = (scope: Element, href = "https://acme.pl/kontakt", host = "acme.pl") =>
      F.isApplicationForm(scope, document, href, host)
    document.title = "Acme"
    const contact = "<label>Wiadomość <textarea></textarea></label><button>Wyślij</button>"
    expect(check(form(contact))).toBe(false)
    expect(check(form(`${contact}<input type="file">`))).toBe(true)
    expect(check(form(`<h2>Aplikuj na stanowisko</h2>${contact}`))).toBe(true)
    expect(check(form(contact), "https://acme.pl/kariera/qa")).toBe(true)
    expect(check(form(contact), "https://www.linkedin.com/jobs/view/1", "www.linkedin.com")).toBe(
      true
    )
    // A whole page is not a form, not even at an address full of job words.
    const page = "https://www.linkedin.com/jobs-tracker/?stage=clicked_apply"
    expect(check(document.body, page, "www.linkedin.com")).toBe(false)
    expect(check(document.body, "https://www.linkedin.com/feed/", "www.linkedin.com")).toBe(false)
    // Known ATS hosts are job applications by definition, and often have no <form>.
    expect(check(document.body, "https://jobs.lever.co/acme/1", "jobs.lever.co")).toBe(true)
    document.title = "Job Application for QA at Acme"
    expect(check(form(contact))).toBe(true)
  })
})

describe("pageInfo", () => {
  it("reads the title, the site name and capped text", () => {
    document.title = "  Staff Engineer  at  Acme "
    document.head.innerHTML += `<meta property="og:site_name" content="Acme">`
    document.body.innerHTML = `<p>${"x".repeat(13000)}</p>`
    const info = F.pageInfo(document, "https://jobs.lever.co/acme/1")
    expect(info).toMatchObject({
      url: "https://jobs.lever.co/acme/1",
      title: "Staff Engineer at Acme",
      siteName: "Acme",
    })
    expect(info.text).toHaveLength(12000)
  })
})
