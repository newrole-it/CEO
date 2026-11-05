// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { SYNTHETIC_CV_HTML } from "./fixtures"
import { importCvHtml } from "./import-html"
import { CvContent } from "./schema"

function parse(html: string) {
  return importCvHtml(new DOMParser().parseFromString(html, "text/html"))
}

describe("importCvHtml", () => {
  const { content, language, title } = parse(SYNTHETIC_CV_HTML)

  it("reads the header", () => {
    expect(language).toBe("pl")
    expect(title).toBe("CV Anna Przykładowa")
    expect(content.header).toMatchObject({
      name: "Anna Przykładowa",
      headline: "Engineering Leader · Head of Engineering",
      location: "Łódź",
      email: "anna@example.com",
      phone: "+48 600 000 000",
      links: [
        {
          label: "linkedin.com/in/anna-przykladowa",
          url: "https://www.linkedin.com/in/anna-przykladowa/",
        },
      ],
    })
    expect(content.header.photo).toBe("data:image/jpeg;base64,/9j/4AAQSkZJRg==")
    expect(content.theme.accent).toBe("#175c72")
  })

  it("keeps sections in order with the right types", () => {
    expect(content.sections.map((section) => [section.type, section.title])).toEqual([
      ["text", "Profil"],
      ["skills", "Kluczowe kompetencje"],
      ["experience", "Doświadczenie zawodowe"],
      ["cards", "Projekty własne"],
      ["education", "Wykształcenie"],
      ["text", "Języki"],
    ])
  })

  it("reads skills without the label in the text", () => {
    const skills = content.sections[1]
    expect(
      skills.type === "skills" && skills.items.map(({ label, text }) => ({ label, text }))
    ).toEqual([
      { label: "Przywództwo inżynierskie", text: "budowanie zespołów, rekrutacja" },
      { label: "Architektura", text: "projektowanie systemów, API" },
    ])
  })

  it("reads full and compact jobs with inline bold lead-ins", () => {
    const section = content.sections[2]
    if (section.type !== "experience") throw new Error("expected experience")
    const [full, compact] = section.items
    expect(full).toMatchObject({
      company: "Firma Główna",
      role: "Architect & Head of Engineering",
      dates: "06.2025 – obecnie",
      summary: "Kieruję inżynierią i architekturą platformy.",
      compact: false,
    })
    expect(full.bullets).toEqual([
      "<strong>AdVantage:</strong> współtworzyłem ad server.",
      "Dla porównania: podobny system powstawał 18 miesięcy.",
    ])
    expect(full.tech).toBe("<strong>Technologie:</strong> Node.js, PostgreSQL")
    expect(compact).toMatchObject({
      company: "Starsza Firma",
      role: "Developer",
      compact: true,
      bullets: [],
      tech: "",
    })
  })

  it("reads cards, education, the languages line and the consent", () => {
    const cards = content.sections[3]
    expect(cards.type === "cards" && cards.items.map(({ title: t, body }) => [t, body])).toEqual([
      ["Projekt A · Co-Founder", "Platforma AI."],
      ["Projekt B · Co-Founder", "Produkt oparty na danych."],
    ])
    const education = content.sections[4]
    expect(education.type === "education" && education.items[0]).toMatchObject({
      school: "Politechnika Przykładowa",
      degree: "Magister inżynier, Informatyka",
      dates: "2013 – 2016",
    })
    const languages = content.sections[5]
    expect(languages.type === "text" && languages.body).toBe(
      "polski (ojczysty) · angielski (swobodnie)"
    )
    expect(content.consent).toBe("Wyrażam zgodę na przetwarzanie moich danych osobowych.")
  })

  it("produces content that passes the schema", () => {
    expect(CvContent.safeParse(content).success).toBe(true)
  })

  it("keeps non-breaking hyphens", () => {
    const profile = content.sections[0]
    expect(profile.type === "text" && profile.body).toContain("zespołami‑inżynierskimi")
  })

  it("sanitizes hostile input", () => {
    const { content: hostile } = parse(`<html><body><header><h1>X</h1></header>
      <section><h2>T</h2><p>ok<script>alert(1)</script><img src=x onerror=alert(1)> <a href="javascript:alert(1)">link</a></p></section></body></html>`)
    const section = hostile.sections[0]
    expect(section.type === "text" && section.body).toBe("ok link")
  })

  it("reads flat documents (h2 followed by siblings) and language from <html lang>", () => {
    const flat = parse(
      `<html lang="en"><body><h1>Jo</h1><h2>Profile</h2><p>Hi there.</p><h2>Other</h2><p>More.</p></body></html>`
    )
    expect(flat.language).toBe("en")
    expect(flat.content.sections.map((section) => section.title)).toEqual(["Profile", "Other"])
  })

  it("rejects a document that is not a CV", () => {
    expect(() => parse("<html><body><p>Nothing here</p></body></html>")).toThrow("not-a-cv")
  })
})
