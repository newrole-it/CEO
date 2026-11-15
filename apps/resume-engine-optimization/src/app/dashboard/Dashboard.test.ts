import { createElement, type ReactNode } from "react"
// @ts-expect-error react-dom ships no types and the repository does not install @types/react-dom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { CvView } from "src/server/cv/service"
import type { OfferRow } from "src/server/offers/service"
import { Dashboard, DASHBOARD_OFFER_CVS } from "./Dashboard"

let counter = 0
function cv(over: Partial<CvView>): CvView {
  counter += 1
  return {
    id: `cv${counter}`,
    title: `CV ${counter}`,
    language: "pl",
    kind: "EDITABLE",
    docType: "CV",
    isDefault: false,
    hasPdf: false,
    hasContent: true,
    updatedAt: new Date(2026, 10, 1, 12, counter),
    target: null,
    forCvId: null,
    original: null,
    ...over,
  }
}

function offer(jobId: string, status: string | null): OfferRow {
  return {
    jobId,
    title: "Staff Engineer",
    company: "Firma",
    location: null,
    url: "https://example.com",
    closed: false,
    addedAt: new Date(2026, 10, 1),
    textChars: 0,
    cvId: null,
    letterId: null,
    match: null,
    application: status ? { id: `app-${jobId}`, status } : null,
    hiring: null,
  }
}

const none = { sent: 0, replied: 0, interviews: 0, offers: 0 }

function render(props: Partial<Parameters<typeof Dashboard>[0]>): string {
  const toHtml: (node: ReactNode) => string = renderToStaticMarkup
  return toHtml(
    createElement(Dashboard, {
      locale: "pl",
      cvs: [],
      offers: [],
      replies: none,
      gather: null,
      ...props,
    })
  )
}

describe("Dashboard", () => {
  it("shows the reply numbers with the share of replies and a link to all-time statistics", () => {
    const html = render({ replies: { sent: 40, replied: 10, interviews: 3, offers: 1 } })
    expect(html).toContain("Wysłane aplikacje")
    expect(html).toContain("<dd>40</dd>")
    expect(html).toContain("<dd>10</dd>")
    expect(html).toContain("25% wysłanych")
    expect(html).toContain('href="/applications/stats?w=all"')
  })

  it("has empty states with links when there is nothing yet", () => {
    const html = render({})
    expect(html).toContain("Nie masz jeszcze wysłanych aplikacji")
    expect(html).toContain('href="/applications"')
    expect(html).toContain("Nie masz jeszcze CV ogólnego")
    expect(html).toContain("Nie masz jeszcze CV pod konkretną ofertę.")
    expect(html).not.toContain("/applications/stats")
  })

  it("lists general CVs with the default one marked and the gather slot", () => {
    const html = render({
      cvs: [
        cv({ id: "g1", title: "CV backend", isDefault: true }),
        cv({ id: "g2", language: "en" }),
      ],
      gather: createElement("button", null, "zbierz"),
    })
    expect(html).toContain('href="/cv/g1"')
    expect(html).toContain("CV backend")
    expect(html).toContain("Domyślne")
    expect(html).toContain("Angielski · zmienione")
    expect(html).toContain("<button>zbierz</button>")
  })

  it("lists the newest CVs for offers with the application's status, and links to the rest", () => {
    const tailored = Array.from({ length: DASHBOARD_OFFER_CVS + 2 }, (_, index) =>
      cv({
        id: `t${index}`,
        updatedAt: new Date(2026, 10, 1 + index),
        target: { jobId: `job${index}`, company: `Spółka ${index}`, title: "Staff Engineer" },
      })
    )
    const html = render({
      cvs: tailored,
      offers: [offer("job9", "INTERVIEW"), offer("job8", null)],
    })
    // the two oldest are left for My CV
    expect(html).toContain("Spółka 9")
    expect(html).toContain("Spółka 2")
    expect(html).not.toContain("Spółka 1<")
    expect(html).not.toContain("Spółka 0<")
    expect(html).toContain("Wszystkie (10)")
    expect(html).toContain('href="/cv?tab=offers"')
    expect(html).toContain('data-tone="progress">Rozmowy<')
    expect(html).toContain("Niewysłane")
    expect(html.indexOf("Spółka 9")).toBeLessThan(html.indexOf("Spółka 2"))
  })

  it("is in English when the interface is", () => {
    const html = render({
      locale: "en",
      replies: { sent: 4, replied: 1, interviews: 0, offers: 0 },
    })
    expect(html).toContain("Applications sent")
    expect(html).toContain("25% of those sent")
    expect(html).not.toContain("Wysłane")
  })
})
