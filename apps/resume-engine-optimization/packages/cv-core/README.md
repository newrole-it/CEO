# @newrole/cv-core

The CV and cover letter document model behind [newrole.it](../../../../README.md): one JSON shape for a CV, and the rules every app applies to it. No I/O and no React, so it runs in the browser and in Node. Depends on zod only.

| Module | What it does |
|---|---|
| `schema` | `CvContent` (zod) and `parseCvContent`: header, sections (text, skills, experience, cards, education, letter), theme, consent |
| `sanitize` | The small inline HTML a CV allows (`<strong>`, `<em>`, `<a>`, `<br>`), text ↔ inline |
| `blank`, `from-profile`, `import-html` | A CV to start from: an empty layout, an imported profile, an HTML CV (needs a DOM) |
| `edit`, `patch`, `fields` | Immutable edits of a section, item, bullet or paragraph, by id |
| `flow`, `paginate`, `styles` | The CV as atoms, A4 page breaks, and the one stylesheet the editor and the PDF share |
| `letter` | A cover letter on the CV's own sheet |
| `tailor` | Merging a model's proposal into a CV: employers, dates, contact details and numbers stay as they are; what the CV cannot back up is listed |
| `audit`, `diff`, `text`, `language`, `filename` | Audit notes, version diffs, plain text for prompts, pl/en detection, the PDF's file name |
| `views` | What a store hands an editor: versions, the tailoring context and result |

```ts
import { parseCvContent } from "@newrole/cv-core/schema"
import { cvPlainText } from "@newrole/cv-core/text"

const cv = parseCvContent(JSON.parse(stored))
if (cv) console.log(cvPlainText(cv))
```

Tests: `npm test -w @newrole/cv-core`. Licence: AGPL-3.0-only, like the repository. [docs/architecture.md](../../docs/architecture.md) shows where this package sits.
