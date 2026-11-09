import { describe, expect, it } from "vitest"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import { CV_CSS } from "@newrole/cv-core/styles"
import { TEMPLATES_CSS } from "@newrole/cv-core/templates"
import { findChrome, renderCvAtoms, renderCvHtml } from "./render"

describe("renderCvHtml", () => {
  it("is a standalone document with the shared stylesheet and the page script", () => {
    const html = renderCvHtml(syntheticCv(2), { print: true })
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true)
    expect(html).toContain(CV_CSS)
    expect(html).toContain("@page{size:A4;margin:0}")
    expect(html).toContain("var computePageBreaks = (")
    expect(html).toContain("cv-page__content")
    expect(html).not.toMatch(/\bsrc="https?:/)
    expect(html).not.toContain('rel="stylesheet"')
  })

  it("escapes text, sanitizes rich fields and cannot close the script tag", () => {
    const cv = syntheticCv(1)
    cv.header.name = '</script><script>alert(1)</script>"'
    cv.sections[0] = {
      id: "p",
      type: "text",
      title: "<i>T</i>",
      body: "<img src=x onerror=alert(1)><b>ok</b>",
    }
    const html = renderCvHtml(cv)
    expect(html).not.toContain("<script>alert(1)")
    expect(html).not.toContain("onerror")
    expect(html).toContain("&lt;i&gt;T&lt;/i&gt;")
    expect(html).toContain("<strong>ok</strong>")
    // exactly one real script element: ours
    expect(html.match(/<script>/g)).toHaveLength(1)
  })

  it("only opens the print dialog on request", () => {
    expect(renderCvHtml(syntheticCv(1))).not.toContain("window.print()")
    expect(renderCvHtml(syntheticCv(1), { autoPrint: true })).toContain("window.print()")
  })

  it("marks keep-with-next atoms and writes leads in mm", () => {
    const html = renderCvAtoms(syntheticCv(1))
    expect(html).toMatch(/cv-atom--title"[^>]*data-keep="1"[^>]*padding-top:5.5mm/)
    expect(html).toContain("<strong>Platforma:</strong>")
  })

  it("leaves out optional header lines that are empty", () => {
    const cv = syntheticCv(1)
    cv.header = { ...cv.header, headline: "", location: "", email: "", phone: "", links: [] }
    const html = renderCvAtoms(cv)
    expect(html).not.toContain("cv-headline")
    expect(html).not.toContain("cv-contact")
    expect(html).toContain("cv-header--nophoto")
  })

  it("frames the photo in a circle unless the CV asks for a square", () => {
    const cv = syntheticCv(1)
    cv.header = { ...cv.header, photo: "data:image/jpeg;base64,AAAA" }
    expect(renderCvAtoms(cv)).toContain('<img class="cv-photo" src=')
    cv.header.photoShape = "square"
    expect(renderCvAtoms(cv)).toContain('<img class="cv-photo cv-photo--square" src=')
  })

  it("lays cards and skills out in the section's columns, two unless it says otherwise", () => {
    const cv = syntheticCv(1)
    expect(renderCvAtoms(cv)).toContain('<div class="cv-cards cv-cols-2">')
    const cards = cv.sections[3]
    if (cards.type !== "cards") throw new Error("the fixture's fourth section is cards")
    cv.sections[3] = { ...cards, columns: 1 }
    expect(renderCvAtoms(cv)).toContain('<div class="cv-cards cv-cols-1">')
    expect(renderCvAtoms(cv)).toContain('<div class="cv-skills cv-cols-2">')
  })
})

describe("renderCvHtml with a template", () => {
  const withTemplate = (template: string) => {
    const cv = syntheticCv(2)
    return { ...cv, theme: { ...cv.theme, template } }
  }
  const between = (html: string, start: string, end: string) =>
    html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)))

  it("loads every template's CSS and switches on the CV's own", () => {
    const html = renderCvHtml(withTemplate("band"))
    expect(html).toContain(TEMPLATES_CSS)
    expect(html).toContain(
      '<div class="cv-doc cv-tpl-band" style="--cv-accent:#175c72;--cv-on-accent:#ffffff">'
    )
    expect(html).not.toContain('id="cv-flow-side"')
    expect(renderCvHtml(syntheticCv(1))).toContain('<div class="cv-doc cv-tpl-classic"')
  })

  it("gives a two-column template a side flow with the contact details, skills and languages", () => {
    const html = renderCvHtml(withTemplate("sidebar"))
    const main = between(html, '<div class="cv-flow" id="cv-flow">', 'id="cv-flow-side"')
    const side = between(html, 'id="cv-flow-side"', '<div id="cv-pages">')
    expect(side).toContain('<div class="cv-contact-card">')
    expect(side).toContain("cv-atom--skills cv-atom--side")
    expect(side).toContain("Języki")
    expect(side).not.toContain("cv-atom--job-head")
    expect(main).toContain("cv-atom--job-head")
    expect(main).toContain('<h1 class="cv-name">')
    expect(main).not.toContain('class="cv-contact"')
    expect(main).not.toContain("cv-atom--skills")
    expect(html).toContain('getElementById("cv-flow-side")')
  })
})

describe("findChrome", () => {
  it("prefers CHROME_PATH when it exists and ignores a wrong one", () => {
    expect(findChrome({ CHROME_PATH: process.execPath })).toBe(process.execPath)
    const fallback = findChrome({ CHROME_PATH: "/nope/chrome" })
    expect(fallback === null || fallback !== "/nope/chrome").toBe(true)
  })
})
