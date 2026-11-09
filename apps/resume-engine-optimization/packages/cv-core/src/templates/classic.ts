import type { CvTemplate } from "../templates"

/** The reference layout: CV_CSS in ./styles is this template, so it adds nothing. */
export const classic = {
  id: "classic",
  css: "",
  accents: ["#175c72", "#1f3a93", "#7a2e3b", "#2f6b3a", "#333a44"],
  preview: `<svg viewBox="0 0 60 84" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<rect width="60" height="84" fill="#fff"/>
<rect x="6" y="7" width="27" height="4" rx="1" fill="#172333"/>
<rect x="6" y="13" width="20" height="2" rx="1" fill="currentColor"/>
<rect x="6" y="17" width="30" height="1.4" rx=".7" fill="#a3afba"/>
<circle cx="47" cy="12.5" r="6" fill="#c9d4dc"/>
<rect x="6" y="22" width="48" height=".9" fill="currentColor"/>
<rect x="6" y="27" width="14" height="1.8" fill="currentColor"/>
<rect x="6" y="31" width="48" height="1.2" fill="#d8e0e7"/>
<rect x="6" y="33.5" width="40" height="1.2" fill="#d8e0e7"/>
<rect x="6" y="39" width="20" height="1.8" fill="currentColor"/>
<rect x="6" y="43" width="26" height="1.6" fill="#536273"/>
<rect x="44" y="43" width="10" height="1.4" fill="#a3afba"/>
<rect x="8" y="46.5" width="44" height="1.2" fill="#d8e0e7"/>
<rect x="8" y="49" width="38" height="1.2" fill="#d8e0e7"/>
<rect x="6" y="54" width="24" height="1.6" fill="#536273"/>
<rect x="44" y="54" width="10" height="1.4" fill="#a3afba"/>
<rect x="8" y="57.5" width="42" height="1.2" fill="#d8e0e7"/>
<rect x="6" y="64" width="16" height="1.8" fill="currentColor"/>
<rect x="6" y="68" width="30" height="1.6" fill="#536273"/>
<rect x="44" y="68" width="10" height="1.4" fill="#a3afba"/>
</svg>`,
} as const satisfies CvTemplate
