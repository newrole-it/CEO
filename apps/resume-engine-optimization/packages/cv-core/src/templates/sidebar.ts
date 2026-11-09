import type { CvTemplate } from "../templates"

const S = ".cv-doc.cv-tpl-sidebar"
/** The tinted strip on the left of every sheet, in mm */
const STRIP = 64

/**
 * Two columns: a tinted strip on the left with the photo, the contact details and the sections
 * marked `side` (skills and languages unless the person moves them), and the name, the headline
 * and the rest on the right. Each column breaks across pages on its own.
 */
export const sidebar = {
  id: "sidebar",
  columns: {
    side: { left: 8, width: STRIP - 16 },
    main: { left: STRIP + 8, width: 210 - STRIP - 24 },
  },
  css: `
${S} .cv-page::before{content:"";position:absolute;left:0;top:0;bottom:0;width:${STRIP}mm;
background:color-mix(in srgb,var(--cv-accent) 11%,#fff)}
${S} .cv-header{display:block;border-bottom:0;padding-bottom:0}
${S} .cv-name{font-size:24pt}
${S} .cv-headline{padding-bottom:0}
${S} .cv-contact-card{display:block}
${S} .cv-contact-card .cv-photo{width:34mm;height:34mm;margin:0 auto 5mm}
${S} .cv-contact-card .cv-contact{color:var(--cv-ink);font-size:8.6pt}
${S} .cv-contact-card .cv-contact__item{display:block;white-space:normal;overflow-wrap:anywhere;padding-bottom:1.2mm}
${S} .cv-contact-card .cv-sep,${S} .cv-contact-card br{display:none}
${S} .cv-atom--side .cv-h2{border-bottom-color:color-mix(in srgb,var(--cv-accent) 30%,#fff)}
${S} .cv-atom--side .cv-skills,${S} .cv-atom--side .cv-cards{grid-template-columns:1fr;row-gap:1.5mm}
${S} .cv-atom--side .cv-edu,${S} .cv-atom--side .cv-job-head{display:block}
${S} .cv-atom--side .cv-dates{text-align:left}
`,
  accents: ["#175c72", "#1f3a93", "#7a2e3b", "#2f6b3a", "#333a44"],
  preview: `<svg viewBox="0 0 60 84" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<rect width="60" height="84" fill="#fff"/>
<rect width="19" height="84" fill="currentColor" fill-opacity=".14"/>
<circle cx="9.5" cy="11" r="6" fill="#c9d4dc"/>
<rect x="3" y="21" width="13" height="1.2" fill="#536273"/>
<rect x="3" y="23.5" width="11" height="1.2" fill="#536273"/>
<rect x="3" y="26" width="12" height="1.2" fill="#536273"/>
<rect x="3" y="31" width="10" height="1.6" fill="currentColor"/>
<rect x="3" y="34.5" width="13" height="1.2" fill="#a3afba"/>
<rect x="3" y="37" width="12" height="1.2" fill="#a3afba"/>
<rect x="3" y="39.5" width="10" height="1.2" fill="#a3afba"/>
<rect x="3" y="45" width="9" height="1.6" fill="currentColor"/>
<rect x="3" y="48.5" width="12" height="1.2" fill="#a3afba"/>
<rect x="3" y="51" width="10" height="1.2" fill="#a3afba"/>
<rect x="23" y="7" width="26" height="4" rx="1" fill="#172333"/>
<rect x="23" y="13" width="18" height="2" rx="1" fill="currentColor"/>
<rect x="23" y="20" width="12" height="1.6" fill="currentColor"/>
<rect x="23" y="23.5" width="32" height="1.2" fill="#d8e0e7"/>
<rect x="23" y="26" width="28" height="1.2" fill="#d8e0e7"/>
<rect x="23" y="31" width="16" height="1.6" fill="currentColor"/>
<rect x="23" y="35" width="18" height="1.5" fill="#536273"/>
<rect x="47" y="35" width="8" height="1.3" fill="#a3afba"/>
<rect x="25" y="38.5" width="30" height="1.2" fill="#d8e0e7"/>
<rect x="25" y="41" width="26" height="1.2" fill="#d8e0e7"/>
<rect x="23" y="46" width="17" height="1.5" fill="#536273"/>
<rect x="47" y="46" width="8" height="1.3" fill="#a3afba"/>
<rect x="25" y="49.5" width="28" height="1.2" fill="#d8e0e7"/>
<rect x="23" y="56" width="14" height="1.6" fill="currentColor"/>
<rect x="23" y="60" width="20" height="1.5" fill="#536273"/>
<rect x="47" y="60" width="8" height="1.3" fill="#a3afba"/>
</svg>`,
} as const satisfies CvTemplate
