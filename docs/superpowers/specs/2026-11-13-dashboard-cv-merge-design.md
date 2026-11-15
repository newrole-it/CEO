# Dashboard as the home page, and "gather everything into the general CV"

Date: 2026-11-13. Status: waiting for the owner's approval.

Paths below are relative to `apps/resume-engine-optimization/` unless they start with `packages/`
(then `apps/resume-engine-optimization/packages/`).

## Intent

The owner writes a CV per offer. A fact added by hand while working on one CV (a project, a
bullet, a skill) stays in that CV only, so the general CV slowly falls behind and the next
tailored CV starts without it. They want one place to land on after signing in that shows their
CVs and how the applications are going, and one button there that brings the general CV up to date
with everything they added elsewhere.

## What the owner decided

- A dashboard as the home page of the project.
- On it: the general CVs and the CVs per application.
- On it: statistics of replies.
- A button that takes the context of all CVs made so far, orders it, finds the differences ("I
  added something to one CV and another does not have it") and creates a new version of the
  general CV that holds all the information from the other CVs.
- **Only the person's own changes count**, not the sentences the tailoring model wrote for an offer.
- **The model does the merge, through Claude Code.** No picking "this line or that line": the
  model reads the CVs, knows what is where, decides what to merge, and writes a new, coherent,
  unambiguous line. (This replaces the earlier idea of a list of checkboxes.)

## Goals

1. A signed-in person with a profile sees the dashboard at `/` instead of being redirected to `/cv`.
2. The dashboard shows general CVs, CVs for offers (with the application's status), and a short
   summary of replies with a link to the full statistics.
3. "Gather everything" makes a new version of the general CV that holds the facts the person
   added by hand in their other CVs, written as one coherent CV. The state before stays in the
   history and can be restored.

## Non-goals

- No change to `/cv`, `/applications` or `/applications/stats`; the dashboard links to them.
- No new statistics: the dashboard shows numbers the app already computes.
- Cover letters are not merged.
- No database migration (see Constraints).
- No MCP prompt or tool for the merge in this version; the button is the way in.

## Anti-goals

- A fact that is in none of the person's CVs ends up in the general CV. The model writes the
  lines, but only from what the CVs say.
- A fact the general CV has is lost in the merge.
- A line written for one company ("…which matches Allegro's stack") goes into the general CV.
- The general CV is changed without the person seeing what changed, or in a way that cannot be undone.

## Constraints

- The database in `.env` is the owner's real data (root `AGENTS.md`). This design needs no schema
  change: the draft is not stored; the result is a `CvVersion` and an update of
  `CvDocument.content`, both existing.
- Interface text rules in root `AGENTS.md`: every string in a copy file, in Polish and English,
  looked up by locale; server returns codes; dates and numbers through `Intl`.
- Prompts are in English and name the output language from the data (the general CV's language).
- Tests run only on the `_test` database.

## How things work today (opened in the code on 2026-11-13)

- `src/app/page.tsx`: guests get `Landing`; a signed-in person with a `CandidateProfile` is
  redirected to `/cv`; a local install may redirect to `/setup` first.
- `src/app/cv/page.tsx` + `CvList.tsx`: tabs "general" and "offers", fed by
  `listCvs(userId, { letters: true })` and `listOffers(userId)`. A CV for an offer has `target`
  set in its `CvView`.
- `src/app/applications/stats/page.tsx`: `StatsScreen` computes on the client from
  `loadInsightsInput(userId)`.
- Tailoring (`mergeSection` in `packages/cv-core/src/tailor.ts`) rewrites the base CV's text with
  the model: section bodies, skill texts, card bodies, each role's summary, bullets and tech line.
  It spreads `...section` and `...item`, so section and item ids are kept; bullets are plain
  strings without ids.
- A tailored CV's history holds a `base` version and a `generated` version per model run
  (`storeGenerated` in `src/server/cv/tailor.ts`).
- `saveToGeneralCv` in `src/server/cv/tailor.ts` replaces the general CV with one tailored CV's
  content and runs it through `companyFree` (`src/server/cv/company-free.ts`), which lists lines
  naming the offer's company.
- `src/server/cv/improve.ts` is the pattern for a model change the person sees before it is
  stored: `improveCvSection` returns the rewrite, `applyCvSection` stores it in a transaction
  (`keepCurrentState`, update content, clear the stored PDF, `appendVersion`).
- The app's writing model: `createWritingClient` (`packages/llm/src/writing.ts`). With the
  `claude-cli` provider it runs the Claude Code CLI with `CLAUDE_WRITING_MODEL` (default
  `sonnet`) and a 150 s timeout; it returns null when no model is available.
- `packages/cv-core/src/diff.ts` compares two CVs line by line for the person to read.
- `SiteHeader.tsx`: nav items `/cv` and `/applications`; the brand links to `/cv` inside the app.

Reported by the reviewer, not opened by the author; the builder verifies:

- `computeInsights(input, { weeks: null, now })` in `src/server/applications/insights.ts` is pure
  and `StatsScreen.tsx:70-73` derives sent, replied, interviews and offers from it.
- `CvVersionOrigin` is a string union in `packages/cv-core/src/views.ts`.
- `/cv` is used as home in `src/app/page.tsx`, `SiteHeader.tsx` (nav and brand),
  `(auth)/components/LoginForm.tsx`, `(auth)/login/page.tsx`, `(auth)/login/verify/VerifyToken.tsx`,
  `setup/SetupScreen.tsx`, `connect/page.tsx`.

## Approaches to the merge

1. **Code finds differences, the person ticks lines.** Predictable, no model needed. Rejected by
   the owner: they do not want to choose between lines, and it cannot join two half-overlapping
   lines into one.
2. **The model gets every CV whole and writes the general CV.** Simple, but most of a tailored
   CV is the tailoring model's own rewrite for one company; the hand-added facts drown in it and
   offer-specific wording leaks in.
3. **Code isolates the person's own changes, the model merges them (chosen).** Code compares each
   CV with what the model last generated for it, so the model receives the general CV plus only
   what the person changed by hand, each change with its source. The model writes the merged
   sections. Code then checks the result. The person sees before/after and saves.

Chosen: 3. It is what the owner asked for in both answers, and it keeps the input small.

## Design

### Dashboard (`/`)

`src/app/page.tsx` keeps the guest and setup branches. For a signed-in person with a profile it
renders a new `src/app/dashboard/Dashboard.tsx` inside `SiteFrame` instead of `redirect("/cv")`.
A signed-in person without a profile still sees `Landing finish`.

```
Pulpit
┌ Odpowiedzi ──────────────────────────────────────────────┐
│ Wysłane 42   Z odpowiedzią 17 (40%)   Rozmowy 6   Oferty 1│
│                                    Pełne statystyki →     │
└───────────────────────────────────────────────────────────┘
┌ CV ogólne ────────────────────────┐ [ Zbierz wszystko do CV ogólnego ]
│ ★ CV backend (PL) · zmienione 3 dni temu                  │
│   CV backend (EN) · zmienione 2 tyg. temu                 │
│                                   Wszystkie CV →          │
└───────────────────────────────────────────────────────────┘
┌ CV pod oferty ────────────────────────────────────────────┐
│ Allegro · Senior Backend    Rozmowa      zmienione wczoraj│
│ XYZ · Staff Engineer        Wysłane      zmienione 5 dni… │
│                                   Wszystkie (12) →        │
└───────────────────────────────────────────────────────────┘
```

(The numbers and names in the sketch are made up.)

- Data: `listCvs(userId)` (no letters), `listOffers(userId)` for the application status per job,
  and the reply numbers. The reply numbers must be the same ones `/applications/stats` shows for
  "all time": reuse its computation, do not write a second definition of "reply".
- CVs for offers: the newest 8, with a link to `/cv?tab=offers`. General CVs: all.
- Empty states: no CV yet (link to `/cv`), no applications yet (link to `/applications`).
- Navigation: add a "Pulpit" / "Dashboard" item first in `SiteHeader`'s nav, and point the brand
  link to `/` in the app. In the places listed above that send a signed-in person to `/cv` as
  "home", send them to `/`; leave links that mean the CV list.
- Page title through `generateMetadata`; the canonical stays `/`.
- New copy file `src/app/i18n/copy-dashboard.ts`, merged in `copy.ts`.

### Gather everything

**Target.** One general CV (`docType` CV, no target, editable, with content). With several, the
person picks in the dialog; the default CV is preselected.

**The person's own changes (code, pure, unit-tested; `packages/cv-core/src/own-changes.ts`).**
For each other CV of the person that has content:

- a CV with a `generated` version: its content now against its newest `generated` version;
- a tailored CV without one: against its `base` version;
- a CV with neither (another general CV, a copy): against the target itself.

Sections and items match by `id`, then by type + folded title / company + role / label. The
output per source is a list of changes in the model's terms: where (section, item), what the text
was, what it is now; a whole new item or section when nothing matches. Removals the person made
in a tailored CV are not changes to carry over (cutting for one offer is not a statement about the
general CV). Header, photo, theme, consent and hidden flags are never changes. A source with no
changes is left out. Sources in any language are included; the model writes in the target's language.

**The merge (model, `packages/cv-engine/src/gather.ts`, next to `improve.ts`).** Through
`createWritingClient` (Claude Code CLI on a `claude-cli` install). Input: the target CV as the
model sees it (the same view tailoring gives it: visible text with ids, no photo, contact details
or theme), the list of changes per source with the source's company and role, and the candidate
context (`candidateContext(userId)`, as `improve.ts` passes it). The prompt's rules:

- every fact in the changes ends up in the CV once, where it belongs: in the role, skill line or
  section it is about;
- where a change and the CV say the same thing, write one line that holds everything both say;
  where they disagree on a fact (a number, a date, a name), keep the CV's line and report it;
- no fact that is in neither; no fact of the CV dropped; no role, section or item removed;
- nothing about the company the source was written for, no wording aimed at one offer;
- skills and technology lines: add what is missing in place, keep the rest;
- write in the CV's language; keep its tone and line length.

Structured output: the sections it changed (by id, same shape as the CV's sections, new items
without ids), and notes for the person: per change, where it went, or why it was left out
(already there, about the offer's company, contradicts the CV). Notes are written in the person's
interface language.

**Checks on the result (code).** Sections the model did not return stay as they are. The result
must parse (`parseCvContent`); every role, item and section id of the target must still be there;
new items get ids from `cvId`. Lines naming a source's `targetCompany` that the person's general
CV did not name are listed as warnings, with the matching `company-free.ts` uses. A result that
fails a check is not shown; the dialog reports code `llm-failed`. Whether to reuse tailoring's
`mergeSection`/`applyTailoring` or write a smaller applier is the builder's choice; tailoring's
`picked` can drop items, which this feature must not.

**What the person sees.** The button opens a dialog: target choice (if several), the sources that
have changes, and "Start". While the model works, a pending state (the call can take minutes).
Then: the notes, any warnings, and the before/after of the CV with `diff.ts`, in the way the
version history shows a comparison if it has one. Two actions: "Save as a new version" and
"Discard". Nothing is stored before "Save". "Nothing to add" when no source has changes; the model
is not called then.

**Saving.** The client sends the target id, the `updatedAt` the draft was made from, and the
draft content. The server validates it, and in one transaction: `keepCurrentState`, update
content, clear the stored PDF, `appendVersion` with a new origin `merged` (added to
`CvVersionOrigin` with its label in copy). If the target changed since (`updatedAt` differs):
code `changed`, and the dialog offers to run again. After saving: links to the CV and its history.

**Errors as codes:** `not-found`, `no-changes`, `llm-unavailable`, `llm-failed`, `changed`,
`invalid-content`.

### Tests

- `own-changes.test.ts`: against `generated`, against `base`, against the target; matching by id
  and by fallback; removals ignored; header and consent ignored; no changes.
- `gather` with a fake `LlmClient`: the prompt carries the changes and the language; a result
  that drops a role or does not parse is refused; untouched sections stay; warnings for a
  source's company.
- A flow test on the test database: a general CV, a tailored CV with a `generated` version and a
  hand edit after it; the draft holds the edit; saving makes a `merged` version and keeps the
  state before; restoring brings it back. (Test company names with digits make tailoring revert
  sentences; use `updateCv` for the hand edit.)
- Dashboard page: the dashboard for a person with a profile, the landing for a guest.
- `npm run lint`, `check:boundaries`, `check:i18n`, `typecheck`, `npm test` before finishing.

## Builder's calls (the owner did not decide these; correct any of them)

- "Through Claude Code" is read as: the dashboard button calls the app's writing model, which on
  the owner's install is the Claude Code CLI. No separate chat prompt in this version.
- The merged CV is shown before/after with the model's notes, and stored only on "Save".
- Sources in every language are included; the model writes in the general CV's language.
- What the person removed from a tailored CV is not carried over.
- Where a hand change contradicts the general CV on a fact, the general CV's line stays and the
  notes say so.
- The reply summary shows four numbers taken from the existing statistics; no chart on the dashboard.
- 8 newest CVs for offers on the dashboard.
- "Dashboard" joins the nav as the first item; `/cv` stays as it is.

## Left to the builder

- The exact four reply numbers, read from what `StatsScreen` already computes.
- Component structure and styling, following the existing `page-head`, cards and `@newrole/ui`
  primitives.
- The pending state: plain, or with steps like `tailor-progress.ts`.
- How much of tailoring's applier and its "unverified" check to reuse.

## Changed while building (2026-11-14)

The final review found that the design above was wrong or silent in these places; the code does this instead.

- **Which steps are the person's.** "Improve with AI" and accepting a tailoring proposal also store
  a `generated` version, which then holds the person's earlier edits. So a CV for an offer is not
  compared with its newest `generated` version. Its history is walked: a step into an automatic,
  named or PDF version, and the step from the newest version to now, is the person's; a step into
  a `generated` version is the model's. A change the CV no longer holds is dropped.
- **Nothing is gathered twice.** Saving a draft adds to each source CV a version with the new
  origin `gathered`, whose label is the general CV's id. The next run starts after it. A source
  that changed between the draft and the save gets no mark and is offered again whole. A draft
  that changed nothing can still be confirmed ("Do not offer these changes again").
- **No source is skipped for size.** Changes past 60,000 characters go to the model in a further
  call that merges into the result of the one before.
- **Code checks that nothing is lost.** A merged text must keep every number of the text it
  replaces and at least 80% of its length; a skills or technology line must keep every term. Else
  the old text stays and the dialog says how many passages were kept.
- **Matching by name is one-to-one**, so a second stint at the same company and role is a new role.
- The stale-draft code is the existing `conflict`. The dashboard does not compute the preview on
  render; the dialog loads it when opened.
