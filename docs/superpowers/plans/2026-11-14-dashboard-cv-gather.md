# Dashboard and "Gather everything into the general CV" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in person lands on a dashboard at `/` (their CVs, reply numbers), with a button that merges what they added by hand in any CV into a new version of the general CV.

**Architecture:** Pure code in `@newrole/cv-core` finds each CV's hand-made changes (against its last model-generated version) and applies the model's merged sections under fixed rules. `@newrole/cv-engine` holds the prompt. `src/server/cv/gather.ts` reads the documents and versions, makes the draft and stores it as a `merged` version. The dashboard is a server component with one client dialog.

**Tech Stack:** Next.js 16 (app router, server actions through `resolver`), Prisma/Postgres, zod 4, vitest (packages), `node:test` flow tests on the `_test` database.

**Spec:** `docs/superpowers/specs/2026-11-13-dashboard-cv-merge-design.md`

Paths are relative to `apps/resume-engine-optimization/` unless they start with `docs/`.

## Global Constraints

- No database migration. Never run `prisma migrate dev`, `migrate reset`, `db push`, or anything destructive against the database in `.env`. Tests only on the `_test` database (`npm run test:db` once).
- **No commits.** The owner commits. No `git checkout`, `git stash`, `git reset`; other sessions have uncommitted changes in this tree. Format only the files you touched.
- Every string a person reads goes in a copy file, in Polish and English in the same change; Polish is the source and uses the informal, capitalised "Ty". Whole sentences per key, `{placeholders}`, plurals with `.one/.few/.many` and `pluralKind(n, locale)`. No `locale === "pl" ? … : …`, no default locale parameter.
- Server returns codes (`CvError` code), the interface translates them. Never show `error.message`.
- Dates and numbers through `Intl` with `intlLocale(locale)` / `numberFormat(locale)`.
- Prompts in English; the output language comes from the data (the general CV's language; notes in the person's interface language).
- The feature never removes a section, role or item from the general CV, and stores nothing before the person presses "Save".
- Before finishing: `npm run lint`, `npm run check:boundaries`, `npm run check:i18n`, `npm run typecheck`, `npm test` from the repository root.

## Review Focus

1. A tailored CV that was tailored again after the person's hand edits: only edits after the newest `generated` version count. Expected: no error, fewer changes. (Task 1 test "reference is the newest generated".)
2. The model's reply names a section or item id the general CV does not have, or the same id twice. Expected: unknown item ids become new items, unknown section ids are ignored, a repeated id is applied once. (Task 2.)
3. The model's reply leaves out items of a skills or cards section. Expected: they stay, in place. (Task 2.)
4. Many sources or another general CV in another language make the input very large. Expected: sources are dropped oldest first past 60,000 characters of changes and listed as skipped with reason `too-much`. (Task 4.)
5. The general CV is edited in another tab between the draft and "Save". Expected: code `changed`, nothing written. (Task 4 flow test.)

---

### Task 1: The person's own changes in one CV

**Files:**

- Create: `packages/cv-core/src/own-changes.ts`
- Test: `packages/cv-core/src/own-changes.test.ts`

**Interfaces:**

- Produces:

```ts
type Where = { id: string; type: CvSection["type"]; title: string }
type Item = { id: string; label: string } // role: "company · role"; skill: label; card: title; education: "school · degree"
export type OwnChange =
  | {
      kind: "field"
      section: Where
      item: Item | null
      field: "body" | "summary" | "tech" | "label" | "text" | "title"
      before: string
      after: string
    }
  | { kind: "bullets"; section: Where; item: Item; added: string[] }
  | {
      kind: "item"
      section: Where
      item: CvExperienceItem | CvSkillItem | CvCardItem | CvEducationItem
    }
  | { kind: "section"; section: CvSection }
/** What `now` holds that `reference` does not. Never reports removals, header, photo, theme, consent, hidden flags or letter sections. */
export function ownChanges(now: CvContent, reference: CvContent): OwnChange[]
/** Characters of the changes as the model will read them. */
export function changesSize(changes: OwnChange[]): number
```

Rules the tests pin: sections match by `id`, else by `type` + folded title; items by `id`, else by folded company + role / label / title / school + degree. Text is compared as plain text with whitespace and case folded (use `fold` from `@newrole/matching/text`, as `src/server/cv/company-free.ts` does, after stripping tags the way `text.ts` does), so a change of formatting alone is no change. A bullet is "added" when no reference bullet of that role has the same folded text. Hidden sections of `now` are skipped.

- [ ] **Step 1: Write the failing tests** with `syntheticCv` from `./fixtures`:

```ts
test("identical CVs have no changes", …)                         // ownChanges(cv, cv) → []
test("a bullet added to a role", …)                              // one { kind: "bullets", added: ["<the new bullet>"] }, item.label has company and role
test("a reworded bullet is reported as added, the old one not as removed", …)
test("a changed summary and tech line are field changes with before and after", …)
test("a new skill item and a new role are item changes", …)
test("a new section is a section change", …)
test("a removed bullet, role or section is not a change", …)     // ownChanges(shorter, longer) → []
test("header, photo, theme, consent and hidden are never changes", …)
test("bold added to an unchanged bullet is not a change", …)
test("items match by company and role when ids differ", …)       // reference with fresh ids, one added bullet → exactly one change
test("reference is the newest generated: an edit already in it is not a change", …)
```

- [ ] **Step 2: Run** `npm test -w @newrole/cv-core -- src/own-changes.test.ts` — FAIL, module not found.
- [ ] **Step 3: Implement** `ownChanges` and `changesSize` (`JSON.stringify(changes).length`).
- [ ] **Step 4: Run** the same command — PASS.

### Task 2: Applying the model's merged sections

**Files:**

- Create: `packages/cv-core/src/gather.ts`
- Modify: `packages/cv-core/src/tailor.ts` (export `createWriter` and `unverifiedTerms`, which `applySectionRewrite` uses; no change of behaviour)
- Modify: `packages/cv-core/src/views.ts` (`CvVersionOrigin` gains `"merged"`, with a doc line: "`merged`: the person's changes in other CVs gathered into this one")
- Test: `packages/cv-core/src/gather.test.ts`

**Interfaces:**

- Produces:

```ts
const GatherItem = z.object({
  id: z.string().max(40).optional(), // absent or unknown: a new item
  company: z.string().optional(),
  role: z.string().optional(),
  dates: z.string().optional(),
  summary: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  tech: z.string().optional(),
  label: z.string().optional(),
  text: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  school: z.string().optional(),
  degree: z.string().optional(),
})
const GatherSection = z.object({
  id: z.string().max(40).optional(), // absent: a new section, needs type and title
  type: z.enum(CV_SECTION_TYPES).optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  items: z.array(GatherItem).optional(),
})
export const GatherNote = z.object({
  source: z.string().max(200), // the source CV's title as given to the model
  outcome: z.enum(["added", "merged", "skipped"]),
  text: z.string().max(600),
})
export const GatherReply = z.object({
  sections: z.array(GatherSection).max(CV_LIMITS.sections),
  notes: z.array(GatherNote).max(80).catch([]),
})
export type GatherReply = z.infer<typeof GatherReply>
export type GatherNote = z.infer<typeof GatherNote>
export type Gathered = { content: CvContent; reverted: number; unverified: string[] }
/** The general CV with the model's sections merged in; null when the result is not a valid CV. */
export function applyGather(
  target: CvContent,
  sections: GatherReply["sections"],
  opts: { evidence: string }
): Gathered | null
```

Rules: a known section id merges into that section: `body` for text; for item sections each proposed item with a known id overwrites only the fields tailoring may write (`summary`, `bullets`, `tech` of a role; `label`, `text` of a skill; `body` of a card; nothing of an education item), all through the writer from `createWriter(target, opts.evidence)` so the number and link guards of tailoring apply. A proposed item with no id or an unknown one is appended to its section with `cvId("i")`, its plain fields taken from the proposal (`compact: false` for a role). Items and sections the reply does not mention stay as they are, in place and order; `hidden`, `side`, `columns`, the header, consent and theme are never touched. An unknown section id is ignored; a section with no id is appended with `cvId("s")` when it has `type` and `title`. A repeated id is applied once (the first). `unverified` is `unverifiedTerms(writer.written, opts.evidence).slice(0, 12)`. The result goes through `parseCvContent`.

- [ ] **Step 1: Write the failing tests:**

```ts
test("merges a role's bullets and keeps company, role and dates", …)
test("a skills section returned with one item keeps the other items in place", …)
test("an item without an id is appended with a new id", …)
test("a section without an id is appended; one without type or title is ignored", …)
test("an unknown section id is ignored and a repeated id applies once", …)
test("every section id and item id of the target is in the result", …)      // over a reply that mentions half of them
test("a bullet with a number the evidence lacks keeps the old bullets and counts as reverted", …)
test("header, consent, theme and hidden sections are unchanged", …)
test("41 bullets in one role gives null", …)                                 // CV_LIMITS.bullets is 40
```

- [ ] **Step 2: Run** `npm test -w @newrole/cv-core -- src/gather.test.ts` — FAIL.
- [ ] **Step 3: Implement** `gather.ts`; export the two helpers from `tailor.ts`; add `"merged"` to `CvVersionOrigin`.
- [ ] **Step 4: Run** `npm test -w @newrole/cv-core` — PASS (the tailor tests too).
- [ ] **Step 5: Run** `npm run typecheck`. It fails wherever a `Record<CvVersionOrigin, …>` or a switch over origins lacks `merged`. Add the label in each place it names: in `packages/cv-editor/src/copy-cv.ts`, next to the other origin labels, Polish "Zebrane z innych CV", English "Gathered from other CVs". Run again — PASS.

### Task 3: The prompt

**Files:**

- Create: `packages/cv-engine/src/gather.ts`
- Modify: `packages/llm/src/common.ts` (`PERSONAL_LLM_PURPOSES` gains `"cv-gather"`)
- Test: `packages/cv-engine/src/gather.test.ts` (model the fake `LlmClient` on `improve.test.ts`)

**Interfaces:**

- Consumes: `OwnChange` (Task 1); `GatherReply`, `GatherNote`, `applyGather`, `Gathered` (Task 2); `cvForModel` from `@newrole/cv-core/tailor`; `humanStyle`, `wrapUntrusted`, `WRITING_TIMEOUT_MS` as `improve.ts` uses them.
- Produces:

```ts
export type GatherSourceInput = {
  title: string
  company: string | null
  role: string | null
  language: CvLocale
  changes: OwnChange[]
  text: string
}
export type GatherDraft = Gathered & { notes: GatherNote[] }
/** The general CV with the changes merged in, not stored. Null when the model gives nothing usable. */
export async function gatherCv(input: {
  llm: LlmClient
  cv: CvContent
  language: CvLocale
  locale: CvLocale
  sources: GatherSourceInput[]
  context: string
  userId?: number
}): Promise<GatherDraft | null>
```

The system prompt, in English, states these rules and no others (wording is the implementer's; follow `IMPROVE_SYSTEM`'s structure):

- You merge changes the candidate made by hand in other versions of their CV into their general CV. Code merges your reply, so name sections and items by their ids; leave the id out for a new item or section.
- Every fact in the changes ends up in the CV once, in the role, skills line or section it is about.
- Where a change and the CV say the same thing, write one line that holds everything both say. Where they disagree on a fact (a number, a date, a name), keep the CV's line and report it in notes as skipped.
- Use only facts in the CV, the changes and the candidate context. Keep every number exactly as written. Drop no fact the CV has; return a role's full bullet list when you change it.
- Write nothing about the company a source CV was written for, and no wording aimed at one offer.
- Skills and technology lines: add what is missing in place, keep the rest and the line's form (`<strong>Label:</strong> a, b, c`).
- Write in the CV's language, in its voice, grammatical person and line length; translate a change written in another language.
- Return only the sections you change. `notes`: one per change, with the source's title, the outcome (`added`, `merged`, `skipped`) and one sentence in the notes language saying where it went or why it was left out.
- The allowed inline tags, as in `IMPROVE_FORMAT`.

The user message carries: `Write in:`, `Language for notes:`, the candidate context, the CV as `JSON.stringify(cvForModel(cv))`, and per source a block `<source title="…" written_for="company · role" language="…">` + JSON of its changes, wrapped with `wrapUntrusted`. Call `llm.completeJson` with `purpose: "cv-gather"`, `schema: GatherReply`, `timeoutMs: WRITING_TIMEOUT_MS`, `maxTokens: Math.min(16000, Math.ceil(JSON.stringify(cvForModel(cv)).length / 2.5) + 3000)`. Evidence for `applyGather`: the CV's plain text, every source's `text`, and the context, joined by newlines.

- [ ] **Step 1: Write the failing tests:**

```ts
test("the prompt names the CV's language, the notes language, and carries each source's changes and title", …)
test("the reply is applied: the new bullet is in the draft and the notes come back", …)
test("no reply gives null", …)                    // completeJson resolves null
test("a reply that makes an invalid CV gives null", …)
test("with no sources the model is not called and the result is null", …)
```

- [ ] **Step 2: Run** `npm test -w @newrole/cv-engine -- src/gather.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again — PASS.

### Task 4: Server: sources, draft, save

**Files:**

- Create: `src/server/cv/gather.ts`
- Create: `src/app/cv/queries/getGatherPreview.ts`, `src/app/cv/mutations/draftGatheredCv.ts`, `src/app/cv/mutations/saveGatheredCv.ts` (same shape as `src/app/cv/mutations/saveCvToGeneral.ts`: `resolver.pipe(resolver.zod(…), …)` with `requireMember`)
- Modify: `src/server/cv/service.ts` (`CvErrorCode` gains `"no-changes"` and `"changed"` if it lacks them)
- Test: `test/cv-gather.test.ts` (flow test; first import `./only-test-db`; model the setup on `test/quick-tailor.test.ts`)

**Interfaces:**

- Consumes: `ownChanges`, `changesSize` (Task 1); `gatherCv`, `GatherDraft` (Task 3); `keepCurrentState`, `appendVersion`, `toStoredJson` from `./versions`; `createWritingClient` from `src/server/llm/writing`; `candidateContext` from `src/server/profile/context`; `cvText`, `CvError` from `./service`.
- Produces:

```ts
export const MAX_GATHER_CHARS = 60_000
export type GatherSource = {
  id: string
  title: string
  company: string | null
  role: string | null
  language: CvLanguage
  changes: number
}
export type GatherPreview = {
  target: { id: string; title: string; language: CvLanguage } | null // null: the person has no editable general CV
  targets: { id: string; title: string; isDefault: boolean }[]
  sources: GatherSource[]
  skipped: { id: string; title: string; reason: "no-content" | "too-much" }[]
}
export async function gatherPreview(userId: number, targetId?: string): Promise<GatherPreview>
export type GatherResult = GatherDraft & {
  targetId: string
  updatedAt: string
  before: CvContent
  warnings: string[]
}
/** Throws CvError: not-found, no-changes, llm-unavailable, llm-failed. `llm` is injectable for tests. */
export async function draftGather(input: {
  userId: number
  targetId: string
  locale: CvLanguage
  llm?: LlmClient | null
}): Promise<GatherResult>
/** Throws CvError: not-found, changed, invalid-content. `number` is null when the CV already had this content. */
export async function saveGathered(input: {
  userId: number
  targetId: string
  updatedAt: string
  content: unknown
}): Promise<{ cvId: string; number: number | null }>
```

Decisions:

- Targets: the person's documents with `docType: "CV"`, `kind: "EDITABLE"`, `jobId: null`, `targetCompany: null`, and parseable content. The default target is the one with `isDefault`, else the most recently updated.
- Sources: every other `docType: "CV"` document of the person. No parseable content → skipped `no-content`. Reference for `ownChanges`: the content of its newest `CvVersion` with origin `generated`; else of its newest with origin `base`; else the target's content. Sources with no changes are left out silently. Order: most recently updated first; once the running sum of `changesSize` passes `MAX_GATHER_CHARS`, the remaining sources are skipped `too-much`.
- `company`/`role` are `targetCompany`/`targetTitle`.
- `warnings`: lines of the draft's plain text that the target's plain text does not have and that name a source's `targetCompany`, found the way `src/server/cv/company-free.ts` finds lines naming a company; at most 8.
- `draftGather` with no sources throws `no-changes` without calling the model. `updatedAt` is the target's `updatedAt` as ISO, read with the content.
- `saveGathered` follows `applyCvSection` in `src/server/cv/improve.ts`: one transaction; read the row; `row.updatedAt.toISOString() !== input.updatedAt` → `changed`; `parseCvContent(input.content)` null → `invalid-content`; every section id and item id of the stored content must be in the new content, else `invalid-content`; same `contentHash` → return `number: null`; else `keepCurrentState`, update content and `versionCheckedAt`, null the three `pdf` fields, `appendVersion` with `origin: "merged"`.

- [ ] **Step 1: Write the failing flow test** with a fake `LlmClient` whose `completeJson` returns a `GatherReply` adding one bullet to the first role:

```ts
test("a hand edit after the generated version is a source; the tailoring's own text is not", …)
   // general CV; tailored copy with a `generated` version equal to its content, then updateCv adds a bullet
   // gatherPreview → sources.length === 1, sources[0].changes === 1
test("a tailored CV with no hand edits is not a source, and draftGather throws no-changes", …)
test("an uploaded PDF without content is skipped as no-content", …)
test("sources past MAX_GATHER_CHARS are skipped as too-much", …)
test("draftGather stores nothing", …)                 // cvVersion count and cvDocument.updatedAt unchanged
test("saveGathered writes the content, a merged version, and keeps the state before", …)
   // newest version origin "merged"; a version with the old contentHash exists; restoreVersion to it brings the old content back
test("saveGathered with a stale updatedAt throws changed and writes nothing", …)
test("saveGathered refuses content that lacks one of the CV's roles", …)   // invalid-content
test("no model configured: draftGather throws llm-unavailable", …)        // llm: null
```

Use `updateCv` for the hand edit, and company names without digits (tailoring's guards revert sentences naming digits).

- [ ] **Step 2: Run** `cd apps/resume-engine-optimization && node scripts/test-db.mjs run npx tsx --test test/cv-gather.test.ts` — FAIL.
- [ ] **Step 3: Implement** `src/server/cv/gather.ts`, then the query and the two mutations. Input schemas: `{ targetId: z.string().min(1).max(64).optional() }`; `{ targetId: z.string().min(1).max(64) }` (locale from `getLocale()`); `{ targetId, updatedAt: z.string().max(40), content: z.unknown() }`. They surface `CvError` codes the way the existing CV mutations do.
- [ ] **Step 4: Run** the flow test — PASS.

### Task 5: The dashboard at `/`

**Files:**

- Create: `src/app/dashboard/Dashboard.tsx` (server component), `src/app/dashboard/reply-numbers.ts`, `src/app/i18n/copy-dashboard.ts`
- Modify: `src/app/i18n/copy.ts` (merge `dashboardPl`/`dashboardEn` like the other feature files)
- Modify: `src/app/page.tsx` (render the dashboard where it redirects to `/cv`)
- Modify: `src/app/applications/stats/StatsScreen.tsx:70-73` (use `replyNumbers`)
- Modify: `src/app/components/site/SiteHeader.tsx` (first nav item `{ href: "/", key: "nav.dashboard", icon: LayoutDashboard }` from the icon set it already imports from; brand `href` is `/` in the app too)
- Modify, after reading each: `src/app/(auth)/components/LoginForm.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/verify/VerifyToken.tsx`, `src/app/setup/SetupScreen.tsx`, `src/app/connect/page.tsx` — where `/cv` is the place a signed-in person is sent as "home" (a default `returnTo`, "go to the app"), change it to `/`; where it means the CV list, leave it. If `src/shared/return-to.ts` holds the default, change it there and update its test.
- Test: `src/app/dashboard/reply-numbers.test.ts`

**Interfaces:**

- Produces: `export function replyNumbers(insights: Insights): { sent: number; replied: number; interviews: number; offers: number }` — the derivation now at `StatsScreen.tsx:70-73`, moved, not rewritten. `Dashboard` props: `{ locale: Locale; cvs: CvView[]; offers: OfferRow[]; replies: ReturnType<typeof replyNumbers>; gather: ReactNode }`.

Decisions:

- `page.tsx`: for a person with a profile, load `listCvs(user.id)`, `listOffers(user.id)`, `computeInsights(await loadInsightsInput(user.id), { weeks: null, now: new Date() })` in parallel and render `<SiteFrame user locale><Dashboard …/></SiteFrame>`. Check `InsightsOptions` for the exact way `StatsScreen` asks for "all time" and use the same. Add `generateMetadata` so the dashboard's title is `t("dash.title")` while the guest landing keeps the layout's title; keep `alternates.canonical: "/"`.
- Three blocks, in this order: replies; general CVs; CVs for offers.
  - Replies: four numbers with labels; the reply share as a percentage through `Intl.NumberFormat(intlLocale(locale), { style: "percent" })` when `sent > 0`; link to `/applications/stats`. With `sent === 0`: an `EmptyState` with a link to `/applications`.
  - General CVs (`!cv.target`): all, each a link to `/cv/{id}` with title, language, the default marked, and the date of the last change through `Intl.DateTimeFormat`. The `gather` slot sits in this block's head. No general CV: an `EmptyState` linking to `/cv`.
  - CVs for offers (`cv.target`): the 8 most recently updated, each a link to `/cv/{id}` with company, role, the application's status (from `offers` by `jobId`, labelled with the existing status copy keys) and the date; a link "All ({n})" to `/cv?tab=offers` when there are more than 8.
- Copy keys start with `dash.`; `nav.dashboard` is "Pulpit" / "Dashboard". Use `page-head`, the cards and `EmptyState`/`Badge` from `@newrole/ui/primitives` as `/cv` and `/applications` do.

- [ ] **Step 1: Write the failing test** `reply-numbers.test.ts`: for an `InsightsInput` of 4 applications (2 with a reply event, 1 that reached INTERVIEW, none at OFFER), `replyNumbers(computeInsights(input, { weeks: null, now }))` equals `{ sent: 4, replied: 2, interviews: 1, offers: 0 }`. Build the input from the shapes in `src/server/applications/insights.ts`; if its existing test has a fixture builder, use it.
- [ ] **Step 2: Run** `npm test -w @newrole/app -- src/app/dashboard/reply-numbers.test.ts` — FAIL.
- [ ] **Step 3: Implement** `replyNumbers`, switch `StatsScreen` to it, run again — PASS.
- [ ] **Step 4: Build** the copy file, `Dashboard.tsx`, the `page.tsx` branch (pass `gather={null}` for now), the nav item and the home links.
- [ ] **Step 5: Run** `npm run check:i18n && npm run typecheck && npm test -w @newrole/app` — PASS. If a test asserted the redirect to `/cv` or the old default `returnTo`, update it to the new behaviour.
- [ ] **Step 6: Look at it.** Restart the dev server on port 43123 if it runs, open `/` signed in: the three blocks show real rows, each link opens the right page, the nav item is current, the brand leads to `/`. Open `/` signed out: the landing. Switch the interface to English and read every string.

### Task 6: The "Gather everything" dialog

**Files:**

- Create: `src/app/dashboard/GatherCv.tsx` (client component)
- Modify: `src/app/page.tsx` (pass `<GatherCv preview={…} />` as `gather`, with `gatherPreview(user.id)` loaded with the rest)
- Modify: `src/app/i18n/copy-dashboard.ts`
- Test: `src/app/dashboard/GatherCv.test.tsx` only if the app already has component tests set up (check for an existing `*.test.tsx` under `src/app`); otherwise the flow is covered by Task 4 and Step 3 below.

**Interfaces:**

- Consumes: `getGatherPreview`, `draftGatheredCv`, `saveGatheredCv` (Task 4) through the hooks in `src/app/rpc-hooks.ts`, as the CV screens call their mutations; `diffCv`, `compactDiff`, `hasChanges` from `@newrole/cv-core/diff`; `DiffRows` from `packages/cv-editor/src/DiffRows.tsx` (import it the way `ImproveTab.tsx` does; if `@newrole/cv-editor` does not export it, add the export).

Decisions:

- The button is disabled with a hint when `preview.target` is null ("make a general CV first", linking to `/cv`).
- Dialog steps, using the dialog component `packages/cv-editor/src/SaveToGeneral.tsx` uses:
  1. **Start.** The target (a select when `targets.length > 1`; changing it refetches the preview). The sources as a list: title, company and role, the number of changes (plural keys). The skipped ones with the reason. No sources: "Nothing to add: your other CVs hold nothing you added by hand that this CV lacks", and no start button. Otherwise "Start".
  2. **Working.** A pending state with a line that it can take a few minutes; the dialog cannot be closed by a click outside.
  3. **Review.** Notes grouped by outcome (added, merged, skipped), each with its source. Warnings (lines naming a company) in a `Banner`. When `reverted > 0`, a line saying how many lines kept their old text because the new one added a number the CVs do not have. `unverified` terms listed as "check these". Then `DiffRows` over `compactDiff(diffCv(before, content))`. When `!hasChanges(rows)`: "The model found nothing to change" and only "Close". Actions: "Save as a new version", "Discard".
  4. **Saved.** Links to `/cv/{id}` and to its history; `router.refresh()`.
- Errors by code, each its own key `dash.gather.err.{code}`: `not-found`, `no-changes`, `llm-unavailable`, `llm-failed`, `changed` (with a "Run again" action), `invalid-content`; one fallback key for anything else.

- [ ] **Step 1: Implement** the component and its copy in both languages.
- [ ] **Step 2: Run** `npm run check:i18n && npm run typecheck && npm run lint` — PASS.
- [ ] **Step 3: Try it against a copy, not the real general CV.** In the app, duplicate the general CV, make it the target in the dialog, run the gather, read the notes and the diff, press "Discard" and confirm in the CV's history that nothing was added. Report what the dialog showed. Do **not** press "Save" on the owner's data; the owner does that.

### Task 7: Docs and the full check

**Files:**

- Modify: `CHANGELOG.md` (root; follow its existing entry style), `apps/resume-engine-optimization/docs/architecture.md` if it lists pages or the CV modules.

- [ ] **Step 1:** Add the changelog entry and the doc lines.
- [ ] **Step 2: Run from the repository root** `npm run lint && npm run check:boundaries && npm run check:i18n && npm run typecheck && npm test` — all PASS. Local lint may trip on copies under `.ai/cezar/worktrees`; those are not part of this change.
- [ ] **Step 3:** Report to the owner: what was built, what was run with its output, what was not checked (saving a gathered version on real data), and the list of files changed, so they can commit.
