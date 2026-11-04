# @newrole/cv-engine

The server side of newrole.it's CV tools, without storage: the caller passes a CV and an offer and keeps what comes back. Node only.

| Module | What it does |
|---|---|
| `tailor` | `tailorCv` (a CV aimed at one offer) and `writeCoverLetter`, with the prompts newrole.it uses; `tailoredCvLanguage` and `coverLetterLanguage` pick the language. Both return null when the model gives nothing usable |
| `structure` | CV text → structured CV with a model (plain text without one). A PDF's text comes from `@newrole/profile/pdf` |
| `audit` | The CV audit: notes with a quote, why and a rewrite, a 0–100 score; demand facts come from the app (`noIndex` where it has no offer index) |
| `render` | The print HTML (A4 sheets, the editor's own pagination) and a PDF from local Chrome or Chromium (`CHROME_PATH`) |
| `http` | The PDF's file name, and responses for the PDF and the print view |
| `versions` | `contentHash`, stable across key order, for version history |

```ts
import { tailorCv } from "@newrole/cv-engine/tailor"
import { createWritingClient } from "@newrole/llm/writing"

const llm = createWritingClient()
const result = llm && (await tailorCv({
  llm,
  base: { content: cv, language: "pl" },
  offer: { company: "Acme", title: "Staff Engineer", location: null, text: offerText, origin: "full" },
  language: "pl",
  context: "",
}))
```

Depends on `@newrole/cv-core`, `@newrole/llm`, `@newrole/profile` (the demand facts' labels) and zod. Tests: `npm test -w @newrole/cv-engine`.
