# @newrole/cv-editor

The A4 CV and cover letter editor of newrole.it, for React and Next.js: real pages edited in place, undo and redo, autosave, links and photo, versions with compare and restore, what the model changed, and the CV audit. `TailorStart` is the form that starts a tailoring for an offer.

The editor keeps no data. The app around it passes one `CvEditorBackend` (`backend.tsx`): autosave, the PDF and print URLs, versions, tailoring, the letter, the audit (optional) and its routes. Pass the same object on every render, for example a module constant.

```tsx
"use client"
import { CvEditor } from "@newrole/cv-editor/CvEditor"
import { myBackend } from "./backend"

export function Editor(props) {
  return <CvEditor backend={myBackend} {...props} />
}
```

Load the CSS after `@newrole/ui/styles.css`: `@newrole/cv-editor/cv.css` and `@newrole/cv-editor/tailor.css`. Strings are in `copy-cv.ts` and `copy-tailor.ts` (Polish and English); the language comes from `@newrole/ui/locale`'s `LocaleProvider`. Uses `useToast`, so render it under `ToastProvider` from `@newrole/ui/interactive`.

newrole.it's backend: `apps/resume-engine-optimization/src/app/cv/backend.ts` (Server Actions).
