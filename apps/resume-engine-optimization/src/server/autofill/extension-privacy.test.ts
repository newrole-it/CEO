// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import * as Form from "../../../../reo-extension/lib/form.js"
import { classifyField, type FieldKind, type FormField } from "./fields"

/**
 * The extension decides alone what never leaves the browser (extension/lib/form.js), and the
 * server classifies the same fields again (fields.ts). /privacy promises ID numbers and
 * equal-opportunity answers are never sent, so whatever the server calls a secret, EEO or consent
 * has to be refused by the extension as well.
 */

type Field = Partial<FormField>
type Entry = { field: Field; el?: Element; inputs?: Element[]; kind: string }
type Collection = { fields: Field[]; entries: Map<string, Entry> }

const F = Form as unknown as {
  neverTouch(field: Field): boolean
  collectFields(root: Element): Collection
  snapshot(collection: Collection): { label: string; value: string }[]
  SECRET: RegExp
  EEO: RegExp
  CONSENT: RegExp
}

const PRIVATE: readonly FieldKind[] = ["secret", "eeo", "consent"]

const LABELS = [
  // Named in the audit
  "ID number",
  "Religious beliefs",
  "Do you identify as LGBTQ+?",
  "Genders",
  // Secrets
  "Password",
  "Card number",
  "CVV",
  "IBAN",
  "Bank account number",
  "Numer konta bankowego",
  "PESEL",
  "Numer dowodu osobistego",
  "Passport number",
  "Numer paszportu",
  "National ID",
  "Social Security Number (SSN)",
  "National Insurance number",
  "Tax ID",
  "NIP",
  "Routing number",
  "Hasło",
  // EEO
  "Gender",
  "Płeć",
  "Sex",
  "Race",
  "Ethnicity",
  "Are you Hispanic or Latino?",
  "Veteran status",
  "Military status",
  "Disability status",
  "Do you have a disability?",
  "Czy posiadasz orzeczenie o niepełnosprawności?",
  "Pronouns",
  "Zaimki",
  "Age",
  "Wiek",
  "Date of birth",
  "Data urodzenia",
  "Birthday",
  "Sexual orientation",
  "Orientacja seksualna",
  "Are you transgender?",
  "LGBT",
  "Religion",
  "Wyznanie",
  "Marital status",
  "Stan cywilny",
  "How do you self identify?",
  "Voluntary self-identification",
  "EEO",
  "Equal employment opportunity",
  // Consents
  "I agree to the Privacy Policy",
  "Wyrażam zgodę na przetwarzanie moich danych osobowych",
  "Zgoda na przyszłe rekrutacje",
  "I consent to the processing of my personal data for future recruitment processes",
  "I have read the information clause",
  "Zapoznałem się z klauzulą informacyjną",
  "I accept the terms and conditions",
  "Terms of service",
  "Join our talent community",
  "Subscribe to our newsletter",
  "I certify that the information provided is true",
  "Oświadczam, że podane informacje są prawdziwe",
  "Potwierdzam zapoznanie się z regulaminem",
  "GDPR",
  "RODO",
  "By submitting this application I acknowledge that my personal data will be processed by the company",
  // Ordinary fields the server lets through: they must not break the test either way
  "First name",
  "Email",
  "Why do you want to work here?",
  "Salary expectations",
  "How did you build for disabled users on your last team, and what did you learn from it?",
  "Tell us about a time you dealt with race conditions",
]

const SHAPES: Field[] = [
  { type: "text" },
  { type: "select", options: ["A", "B", "C"] },
  { type: "radio", options: ["Yes", "No"] },
  { type: "checkbox", options: ["Yes", "No"] },
  { type: "checkbox" },
  { type: "textarea" },
]

describe("never-touch rules agree with the server", () => {
  const cases = LABELS.flatMap((label) =>
    SHAPES.map((shape) => ({ ...shape, key: "k", label, type: shape.type ?? "text" }))
  )
  const privateCases = cases.filter((field) => PRIVATE.includes(classifyField(field as FormField)))

  it("covers enough labels the server keeps private", () => {
    expect(privateCases.length).toBeGreaterThan(300)
  })

  it.each(privateCases.map((field) => [`${field.type}: ${field.label}`, field] as const))(
    "refuses %s",
    (_name, field) => {
      expect(F.neverTouch(field)).toBe(true)
    }
  )

  it.each(["ID number", "Religious beliefs", "Do you identify as LGBTQ+?", "Genders"])(
    "refuses %s as text and as a select",
    (label) => {
      expect(F.neverTouch({ key: "k", label, type: "text" })).toBe(true)
      expect(F.neverTouch({ key: "k", label, type: "select", options: ["A", "B"] })).toBe(true)
    }
  )

  it("agrees on fields known only by their name or id", () => {
    for (const name of ["gender", "date_of_birth", "id_number", "veteranStatus", "religion"]) {
      const field = { key: name, label: "", name, type: "select", placeholder: "Select…" }
      expect(PRIVATE).toContain(classifyField(field))
      expect(F.neverTouch(field)).toBe(true)
    }
  })

  it("agrees on fields under an EEO heading", () => {
    for (const section of ["EEO", "Demographic questions", "Equal Opportunity Monitoring"]) {
      const field = {
        key: "k",
        label: "Please select",
        type: "select",
        section,
        options: ["A", "B"],
      }
      expect(PRIVATE).toContain(classifyField(field))
      expect(F.neverTouch(field)).toBe(true)
    }
  })

  it("exports the patterns, each at least as wide as the server's", () => {
    expect(F.SECRET.test("id number")).toBe(true)
    expect(F.EEO.test("religious beliefs")).toBe(true)
    expect(F.EEO.test("do you identify as lgbtq")).toBe(true)
    expect(F.EEO.test("genders")).toBe(true)
    expect(F.CONSENT.test("information clause")).toBe(true)
  })
})

describe("fields the person cannot see", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    delete (document.documentElement as { getBoundingClientRect?: unknown }).getBoundingClientRect
  })

  const labels = (root: Element) => F.collectFields(root).fields.map((field) => field.label)

  it("leaves out transparent and clipped fields, and those inside them", () => {
    document.body.innerHTML = `
      <form>
        <label>Seen <input name="seen"></label>
        <label>Transparent <input name="a" style="opacity: 0"></label>
        <div style="opacity:0"><label>In a transparent box <input name="b"></label></div>
        <label>Clipped <input name="c" style="position:absolute; clip: rect(0, 0, 0, 0)"></label>
        <label>Clipped to a pixel <input name="d" style="position:absolute; clip: rect(1px, 1px, 1px, 1px)"></label>
        <label>Clip path <input name="e" style="clip-path: inset(50%)"></label>
        <div style="clip-path: inset(0 100% 0 0)"><label>In a clipped box <input name="f"></label></div>
        <label>Clipped in pixels <input name="i" style="clip-path: inset(0px 0px 0px 100%)"></label>
        <label>Half clipped <input name="g" style="clip-path: inset(0 0 50% 0)"></label>
        <label>Faint <input name="h" style="opacity: 0.4"></label>
      </form>
    `
    expect(labels(document.body)).toEqual(["Seen", "Half clipped", "Faint"])
  })

  it("does not send what was filled into a hidden field", () => {
    document.body.innerHTML = `
      <form>
        <label>Why us? <textarea name="why"></textarea></label>
        <label>Notes <textarea name="notes" style="opacity:0"></textarea></label>
      </form>
    `
    ;(document.querySelector("[name=why]") as HTMLTextAreaElement).value = "Product"
    ;(document.querySelector("[name=notes]") as HTMLTextAreaElement).value = "my secret"
    const rows = F.snapshot(F.collectFields(document.body))
    expect(rows).toEqual([expect.objectContaining({ label: "Why us?", value: "Product" })])
  })

  it("keeps a custom select whose own input is transparent", () => {
    document.body.innerHTML = `
      <form><div class="select__control">
        <label for="loc">Location</label>
        <input id="loc" role="combobox" style="opacity:0">
      </div></form>
    `
    expect(labels(document.body)).toEqual(["Location"])
  })

  it("leaves out fields placed where no scrolling reaches", () => {
    document.body.innerHTML = `
      <form>
        <label>On the page <input name="on"></label>
        <label>Far left <input name="left"></label>
        <label>Far above <input name="above"></label>
        <div id="box"><label>Scrolled away in a box <input name="scrolled"></label></div>
      </form>
    `
    const rect = (left: number, top: number) => () =>
      ({ left, top, right: left + 200, bottom: top + 30, width: 200, height: 30 }) as DOMRect
    ;(document.documentElement as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      rect(0, 0)
    const place = (name: string, left: number, top: number) => {
      const el = document.querySelector(`[name=${name}]`) as HTMLElement
      el.getBoundingClientRect = rect(left, top)
    }
    place("on", 10, 100)
    place("left", -9999, 100)
    place("above", 10, -5000)
    // Above the viewport, but only because its box is scrolled down: scrolling back shows it.
    place("scrolled", 10, -400)
    Object.defineProperty(document.getElementById("box")!, "scrollTop", { value: 600 })
    expect(labels(document.body)).toEqual(["On the page", "Scrolled away in a box"])
  })
})
