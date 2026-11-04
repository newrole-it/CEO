import { describe, expect, it } from "vitest"
import { cvFields, findQuote, replaceInField, replaceInInline, setCvField } from "./fields"
import type { CvContent } from "./schema"

const content: CvContent = {
  version: 1,
  header: {
    name: "Ala Kot",
    headline: "Backend Engineer",
    location: "Warszawa",
    email: "ala@example.com",
    phone: "",
    links: [],
    photo: null,
  },
  sections: [
    { id: "s1", type: "text", title: "Profil", body: "Pierwsza <strong>linia</strong><br>Druga" },
    {
      id: "s2",
      type: "experience",
      title: "Doświadczenie",
      items: [
        {
          id: "j1",
          company: "Acme",
          role: "Lead",
          dates: "2020 – 2024",
          summary: "",
          bullets: ["Odpowiedzialny za <em>wdrożenia</em> &amp; testy", "Drugi punkt"],
          tech: "",
          compact: false,
        },
      ],
    },
    {
      id: "s3",
      type: "skills",
      title: "Ukryta",
      hidden: true,
      items: [{ id: "k1", label: "A", text: "B" }],
    },
  ],
  consent: null,
  theme: { accent: "#175c72" },
}

describe("CV fields", () => {
  it("lists the fields under the editor's keys and leaves hidden sections out", () => {
    const fields = cvFields(content)
    expect(fields.map((field) => field.field)).toEqual(
      expect.arrayContaining(["header:headline", "s1:text", "s2:j1:role", "s2:j1:bullet:1"])
    )
    expect(fields.some((field) => field.sectionId === "s3")).toBe(false)
    expect(fields.find((field) => field.field === "s2:j1:bullet:0")?.text).toBe(
      "Odpowiedzialny za wdrożenia & testy"
    )
    expect(fields.find((field) => field.field === "s1:text")?.text).toBe("Pierwsza linia\nDruga")
  })

  it("finds a quote despite typographic variants, keeping offsets", () => {
    expect(findQuote("Rola - od 2020", "Rola – od")).toBe(0)
    expect(findQuote("mówi „cześć” teraz", '"cześć"')).toBe(5)
    expect(findQuote("Pierwsza linia\nDruga", "linia Druga")).toBe(9)
    expect(findQuote("abc", "")).toBe(-1)
  })

  it("replaces text and keeps the formatting around it", () => {
    expect(replaceInInline("Odpowiedzialny za <em>wdrożenia</em>", 0, 17, "Prowadzę")).toBe(
      "Prowadzę <em>wdrożenia</em>"
    )
    expect(replaceInInline("a <strong>bold</strong> b", 2, 6, "NEW")).toBe(
      "a <strong>NEW</strong> b"
    )
    // across the end of a tag: the tag stays, around what is left of its text
    expect(replaceInInline("a <strong>bold</strong> b", 4, 8, "X")).toBe("a <strong>boX</strong>")
  })

  it("escapes the replacement and counts a line break as one character", () => {
    expect(replaceInInline("x<br>y", 1, 2, "<b>&")).toBe("x&lt;b&gt;&amp;y")
    expect(replaceInInline("a &amp; b", 4, 5, "c")).toBe("a &amp; c")
    expect(replaceInInline("abc", 3, 3, "\nd")).toBe("abc<br>d")
  })

  it("writes back to the right place", () => {
    const fields = cvFields(content)
    const of = (name: string) => fields.find((field) => field.field === name)!
    expect(setCvField(content, of("header:headline"), "CTO").header.headline).toBe("CTO")
    const bullet = setCvField(content, of("s2:j1:bullet:1"), "Nowy")
    expect(bullet.sections[1]).toMatchObject({ items: [{ bullets: [expect.any(String), "Nowy"] }] })
    expect(setCvField(content, of("s1:text"), "Inny").sections[0]).toMatchObject({ body: "Inny" })
    const role = replaceInField(content, of("s2:j1:role"), 0, 4, "Head\nof Eng")
    expect(role.sections[1]).toMatchObject({ items: [{ role: "Head of Eng" }] })
  })
})
