import { PAGE_MM } from "../styles"
import type { CvTemplate } from "../templates"

const S = ".cv-doc.cv-tpl-band"
const { top, side } = PAGE_MM

/**
 * One column under a header band in the accent that runs to the sheet's edges. The header atom
 * keeps its height in the flow (flow-root), and the band reaches past the page margins with
 * negative margins, so page breaks are measured as in the classic layout.
 */
export const band = {
  id: "band",
  css: `
${S} .cv-atom--header{display:flow-root}
${S} .cv-header{margin:-${top}mm -${side}mm 0;padding:11mm ${side}mm 7mm;background:var(--cv-accent);
color:var(--cv-on-accent);border-bottom:0;caret-color:var(--cv-on-accent)}
${S} .cv-headline,${S} .cv-contact,${S} .cv-contact a{color:var(--cv-on-accent)}
${S} .cv-contact{opacity:.88}
${S} .cv-sep{color:inherit;opacity:.6}
${S} .cv-photo{border-color:var(--cv-on-accent)}
${S} .cv-h2{color:var(--cv-ink);border-bottom:0;border-left:3px solid var(--cv-accent);padding:0 0 0 2.5mm;
line-height:1.25}
${S} .cv-company{color:var(--cv-ink)}
`,
  accents: ["#175c72", "#1f3a93", "#7a2e3b", "#2f6b3a", "#333a44"],
  preview: `<svg viewBox="0 0 60 84" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<rect width="60" height="84" fill="#fff"/>
<rect width="60" height="24" fill="currentColor"/>
<rect x="6" y="7" width="27" height="4" rx="1" fill="#fff"/>
<rect x="6" y="13" width="20" height="2" rx="1" fill="#fff" fill-opacity=".85"/>
<rect x="6" y="17" width="30" height="1.4" rx=".7" fill="#fff" fill-opacity=".65"/>
<circle cx="47" cy="12.5" r="6" fill="#fff" fill-opacity=".35"/>
<rect x="6" y="29" width="1.2" height="2.4" fill="currentColor"/>
<rect x="8.5" y="29.3" width="14" height="1.8" fill="#172333"/>
<rect x="6" y="34" width="48" height="1.2" fill="#d8e0e7"/>
<rect x="6" y="36.5" width="40" height="1.2" fill="#d8e0e7"/>
<rect x="6" y="41" width="1.2" height="2.4" fill="currentColor"/>
<rect x="8.5" y="41.3" width="20" height="1.8" fill="#172333"/>
<rect x="6" y="46" width="26" height="1.6" fill="#536273"/>
<rect x="44" y="46" width="10" height="1.4" fill="#a3afba"/>
<rect x="8" y="49.5" width="44" height="1.2" fill="#d8e0e7"/>
<rect x="8" y="52" width="38" height="1.2" fill="#d8e0e7"/>
<rect x="6" y="57" width="24" height="1.6" fill="#536273"/>
<rect x="44" y="57" width="10" height="1.4" fill="#a3afba"/>
<rect x="8" y="60.5" width="42" height="1.2" fill="#d8e0e7"/>
<rect x="6" y="66" width="1.2" height="2.4" fill="currentColor"/>
<rect x="8.5" y="66.3" width="16" height="1.8" fill="#172333"/>
<rect x="6" y="71" width="30" height="1.6" fill="#536273"/>
<rect x="44" y="71" width="10" height="1.4" fill="#a3afba"/>
</svg>`,
} as const satisfies CvTemplate
