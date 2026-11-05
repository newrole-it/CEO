# @newrole/profile

A person's professional profile, as newrole.it builds it. Node only; it keeps no data: the app stores the profile, the sections and the form details.

| Module | What it does |
|---|---|
| `schema` | The profile (`ProfileDraft`): role and past titles, seniority, years, skills, industries, places, languages, salary, contracts, work mode |
| `import-text` | What a person gives, as text: pasted text, a CV or LinkedIn PDF (`pdf`), LinkedIn's data export ZIP (`linkedin-export`), with the size checks and messages; `draftFromText` turns it into a draft and the sections it came from |
| `extract`, `industry`, `salary-text` | Text → draft, with a model or by rules (uses `@newrole/matching` for titles and seniority) |
| `linkedin`, `linkedin-layout` | The imported CV/LinkedIn sections (`LinkedInDocument`), parsed from one text layout |
| `linkedin-browser`, `linkedin-jobs`, `linkedin-import` | Reading the person's own LinkedIn page through Claude in their Chrome (`claude -p` with the five Claude in Chrome read tools, only `/in/me` and its `/details/` pages), as a background job the page polls |
| `demand` | Demand facts: phrases common in the offers a person matched and missing from a text |
| `audit`, `linkedin-audit` | The profile audit (0–100, notes with a quote, why and a rewrite) and what newrole.it's extension shows of it |
| `applicant` | Form details: schema, the facts in a CV header, defaults, cleaning |
| `context` | `candidateContextText`: what a model may know about the candidate when writing for them |

```ts
import { draftFromText, importText } from "@newrole/profile/import-text"
import { createLlmClient } from "@newrole/llm/client"

const read = await importText({ text: "", file })   // a PDF or LinkedIn's ZIP
if (read.ok) {
  const { draft, document } = await draftFromText(read.text, createLlmClient())
}
```

Tests: `npm test -w @newrole/profile`.
