import { SECTION_TITLES } from "./blank"
import { letterSection, type CvContent, type CvSection } from "./schema"
import { PAGE_MM } from "./styles"
import { band } from "./templates/band"
import { classic } from "./templates/classic"
import { sidebar } from "./templates/sidebar"

/**
 * The looks a CV can take. The editor, the print view and the PDF render every CV with CV_CSS
 * (./styles, the classic look) and then the CSS of its template, scoped under
 * `.cv-doc.cv-tpl-<id>`, so a template restyles the same atoms and never changes the content.
 *
 * To add a template:
 * 1. Write templates/<id>.ts: a CvTemplate whose CSS rules all start with `.cv-doc.cv-tpl-<id>`
 *    (templates.test.ts checks it). Give it `columns` for a side column next to the main one.
 * 2. Add it to CV_TEMPLATES below; the order is the order in the look panel.
 * 3. Name it in packages/cv-editor/src/copy-look.ts, "look.tpl.<id>" and "look.tpl.<id>.hint", in
 *    every language (npm run typecheck fails until both are there).
 */

/** A column on the A4 sheet: mm from the sheet's left edge, and its width in mm. */
export type CvColumnBox = { left: number; width: number }

export type CvTemplate = {
  /** Stored in content.theme.template; lowercase letters, digits and hyphens */
  id: string
  /** Rules after CV_CSS, each under `.cv-doc.cv-tpl-<id>`. The accent is var(--cv-accent), the
   * text colour that reads on it var(--cv-on-accent). */
  css: string
  /** The accents the look panel offers, the template's own first */
  accents: readonly string[]
  /** The layout in miniature for the look panel: SVG markup, viewBox 0 0 60 84;
   * `currentColor` is the accent. */
  preview: string
  /** Two columns: where the main and the side column sit. Without it the CV is one column. */
  columns?: { main: CvColumnBox; side: CvColumnBox }
}

export const CV_TEMPLATES = [classic, band, sidebar] as const

export type CvTemplateId = (typeof CV_TEMPLATES)[number]["id"]

export const DEFAULT_TEMPLATE: CvTemplateId = "classic"

export function templateById(id: string | null | undefined): CvTemplate {
  return CV_TEMPLATES.find((template) => template.id === id) ?? classic
}

/**
 * The template a document is drawn with: the stored one, the classic look when it is unset or no
 * longer exists, and the classic look for a cover letter in a two-column template, as a letter
 * is one block of text.
 */
export function documentTemplate(content: Pick<CvContent, "theme" | "sections">): CvTemplate {
  const template = templateById(content.theme?.template)
  if (template.columns && letterSection(content as CvContent)) return classic
  return template
}

/** The class on .cv-doc that switches a template's CSS on. */
export function templateClass(template: CvTemplate): string {
  return `cv-tpl-${template.id}`
}

/** The section titles that mean "languages", in every CV language. */
const LANGUAGE_TITLES = new Set(
  Object.values(SECTION_TITLES).map((titles) => titles.languages.trim().toLowerCase())
)

/**
 * Whether a section sits in the side column of a two-column template: what the person chose, else
 * skills and languages do and the rest goes to the main column.
 */
export function sectionOnSide(section: CvSection): boolean {
  if (section.side != null) return section.side
  if (section.type === "skills") return true
  return section.type === "text" && LANGUAGE_TITLES.has(section.title.trim().toLowerCase())
}

/** Ink or white, whichever reads better on the accent (WCAG relative luminance). */
export function onAccent(accent: string): string {
  const hex = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent.slice(1) : "175c72"
  const channel = (at: number) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  // contrast with white (1.05) against contrast with #172333 (luminance ≈ 0.016)
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.066 ? "#ffffff" : "#172333"
}

/** Where the columns of a two-column template sit, for the print view's sheets. */
function columnsCss(template: CvTemplate): string {
  const columns = template.columns
  if (!columns) return ""
  const scope = `.cv-doc.${templateClass(template)}`
  const { main, side } = columns
  return [
    `${scope} .cv-flow,${scope} .cv-page__content{width:${main.width}mm}`,
    `${scope} .cv-page__content{left:${main.left}mm}`,
    `${scope} .cv-flow--side,${scope} .cv-page__side{width:${side.width}mm}`,
    `${scope} .cv-page__side{position:absolute;top:${PAGE_MM.top}mm;left:${side.left}mm}`,
  ].join("\n")
}

/** Every template's CSS, loaded after CV_CSS by the editor and the print view. */
export const TEMPLATES_CSS = CV_TEMPLATES.map(
  (template) => `${template.css}\n${columnsCss(template)}`
).join("\n")
