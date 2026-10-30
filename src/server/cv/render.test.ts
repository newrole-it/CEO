import { describe, expect, it } from "vitest"
import { syntheticCv } from "src/shared/cv/fixtures"
import { CV_CSS } from "src/shared/cv/styles"
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
})

describe("findChrome", () => {
  it("prefers CHROME_PATH when it exists and ignores a wrong one", () => {
    expect(findChrome({ CHROME_PATH: process.execPath })).toBe(process.execPath)
    const fallback = findChrome({ CHROME_PATH: "/nope/chrome" })
    expect(fallback === null || fallback !== "/nope/chrome").toBe(true)
  })
})
