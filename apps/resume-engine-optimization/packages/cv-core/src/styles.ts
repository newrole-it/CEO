import type { PageGeometry } from "./paginate"

/**
 * The one stylesheet for a CV page, used by the editor and by the print/PDF HTML, so both
 * lay text out identically. Everything is scoped under .cv-doc and every property that the
 * app's global CSS touches is set explicitly. Values reproduce the reference layout:
 * A4, Helvetica Neue 9.6pt, ink #172333, muted #536273,
 * accent #175c72, rules #d8e0e7. Spacing between atoms is their top padding (see ./flow).
 */

/** CSS px per mm at 96 dpi */
export const MM = 96 / 25.4

/** A4 page and margins in mm. The footer sits inside the bottom margin. */
export const PAGE_MM = { width: 210, height: 297, top: 14, side: 16, bottom: 15 } as const

export const CONTENT_WIDTH_MM = PAGE_MM.width - 2 * PAGE_MM.side

/** Geometry for computePageBreaks in CSS px; `gap` is the space between stacked sheets. */
export function pageGeometry(gap = 0): PageGeometry {
  return {
    pageHeight: PAGE_MM.height * MM,
    marginTop: PAGE_MM.top * MM,
    marginBottom: PAGE_MM.bottom * MM,
    gap,
  }
}

export const CV_CSS = `
.cv-doc{--cv-ink:#172333;--cv-muted:#536273;--cv-accent:#175c72;--cv-line:#d8e0e7;--cv-faint:#84919d;--cv-sep:#a3afba;
color:var(--cv-ink);font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:9.6pt;line-height:1.42;font-weight:400;
font-style:normal;font-variant:normal;font-kerning:auto;font-feature-settings:normal;letter-spacing:normal;word-spacing:normal;
text-align:left;text-indent:0;text-transform:none;text-decoration:none;text-rendering:auto;white-space:normal;
overflow-wrap:break-word;hyphens:manual;-webkit-text-size-adjust:100%;text-size-adjust:100%}
.cv-doc *,.cv-doc *::before,.cv-doc *::after{box-sizing:border-box}
.cv-doc :where(div,p,h1,h2,h3,span,a,strong,em,b,i,img,br){margin:0;padding:0;border:0 solid;font:inherit;color:inherit;
letter-spacing:inherit;text-transform:inherit;text-decoration:none;background:none;outline-offset:1px}
.cv-doc strong,.cv-doc b{font-weight:700}
.cv-doc em,.cv-doc i{font-style:italic}
.cv-doc a{color:inherit;text-decoration:none}
.cv-doc .cv-atom{display:block;position:relative}
.cv-doc .cv-header{display:grid;grid-template-columns:1fr 30mm;column-gap:10mm;align-items:center;padding-bottom:6mm;
border-bottom:2px solid var(--cv-accent)}
.cv-doc .cv-header--nophoto{grid-template-columns:1fr}
.cv-doc .cv-header__main{display:block;min-width:0}
.cv-doc .cv-name{display:block;font-size:26pt;line-height:1.05;letter-spacing:-.5px;font-weight:700;padding-bottom:2mm}
.cv-doc .cv-headline{display:block;color:var(--cv-accent);font-size:11pt;font-weight:700;padding-bottom:3mm}
.cv-doc .cv-contact{display:block;color:var(--cv-muted);font-size:9pt}
.cv-doc .cv-contact__item{white-space:nowrap}
.cv-doc .cv-contact a{color:var(--cv-accent)}
.cv-doc .cv-sep{margin:0 1.6mm;color:var(--cv-sep)}
.cv-doc .cv-photo{display:block;width:30mm;height:30mm;max-width:none;border-radius:50%;object-fit:cover;border:2px solid #e0e8ed}
.cv-doc .cv-photo--square{border-radius:0}
.cv-doc .cv-h2{display:block;font-size:10.5pt;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--cv-accent);
padding-bottom:1.5mm;border-bottom:1px solid var(--cv-line)}
.cv-doc .cv-text{display:block}
.cv-doc .cv-skills{display:grid;grid-template-columns:1fr 1fr;column-gap:8mm}
.cv-doc .cv-skill{display:block;min-width:0}
.cv-doc .cv-job-head{display:flex;justify-content:space-between;column-gap:8mm;align-items:baseline}
.cv-doc .cv-company{display:block;min-width:0;font-size:10.8pt;line-height:1.25;font-weight:700}
.cv-doc .cv-role{color:var(--cv-muted);font-weight:700}
.cv-doc .cv-dates{display:block;flex-shrink:0;color:var(--cv-muted);font-size:9pt;text-align:right;white-space:nowrap}
.cv-doc .cv-summary{display:block}
.cv-doc .cv-bullet{display:list-item;list-style:disc outside;margin-left:4.5mm;padding-left:.5mm}
.cv-doc .cv-tech{display:block;color:var(--cv-muted);font-size:8.5pt}
.cv-doc .cv-tech strong,.cv-doc .cv-tech b{color:var(--cv-ink)}
.cv-doc .cv-cards{display:grid;grid-template-columns:1fr 1fr;column-gap:7mm}
.cv-doc .cv-card{display:block;min-width:0}
.cv-doc .cv-card__title{display:block;font-size:10pt;font-weight:700;padding-bottom:1mm}
.cv-doc .cv-card__body{display:block;font-size:9pt;padding-bottom:2mm}
.cv-doc .cv-edu{display:flex;justify-content:space-between;column-gap:6mm}
.cv-doc .cv-edu__main{display:block;min-width:0}
.cv-doc .cv-edu__school{display:block;font-weight:700}
.cv-doc .cv-small{color:var(--cv-muted);font-size:9pt}
.cv-doc .cv-consent{display:block;color:var(--cv-faint);font-size:7pt;line-height:1.35}
.cv-doc .cv-letter-date{display:block;text-align:right;color:var(--cv-muted);font-size:10pt}
.cv-doc .cv-letter-to{display:block;font-size:10.5pt;font-weight:700}
.cv-doc .cv-letter-subject{display:block;color:var(--cv-accent);font-size:10.5pt;font-weight:700}
.cv-doc .cv-letter-text{display:block;font-size:10.5pt;line-height:1.5}
.cv-doc .cv-letter-sign{display:block;font-size:10.5pt;font-weight:700;padding-top:2mm}
.cv-doc .cv-page{position:relative;width:210mm;height:297mm;background:#fff;overflow:hidden}
.cv-doc .cv-page__content{position:absolute;top:14mm;left:16mm;width:178mm}
.cv-doc .cv-footer{position:absolute;right:16mm;bottom:0;height:15mm;display:flex;align-items:center;color:var(--cv-faint);
font-size:8pt;line-height:1.2;white-space:nowrap}
.cv-doc .cv-flow{width:178mm}
`
