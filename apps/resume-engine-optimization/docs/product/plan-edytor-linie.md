# Edytor CV i listu: nowa linia jak w dokumencie. Plan wdrożenia (13.11.2026)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enter adds a line everywhere on the sheet, text sections and job summaries break across pages paragraph by paragraph, and header links are added on the sheet.

**Architecture:** A text section's body and a job summary stay one stored string and one `Editable`; the field draws its paragraphs as `<div>` blocks and `usePagination` breaks pages between those blocks. The print HTML gets one atom per paragraph from `cvFlow`. Single-line fields get an `onEnter` that moves to or creates the next line.

**Tech Stack:** React 19, TypeScript, contenteditable, zod, vitest. Paths below are relative to `apps/resume-engine-optimization/packages/`.

**Spec:** [projekt-edytor-linie.md](projekt-edytor-linie.md)

## Global Constraints

- No Prisma schema change, no migration, no command from the list in `AGENTS.md` against the database in `.env`. Browser checks run on an editor with an in-memory backend only.
- Stored values keep their shape: `body` and `summary` are one inline-HTML string with `<br>`.
- Existing CVs and letters look the same in the editor and in the PDF.
- The caret never jumps while typing: the DOM owns the text of a field.
- Every new string a person reads goes into `cv-editor/src/copy-cv.ts` in Polish and English; no text in `.tsx`.
- No commits: the owner commits.

## Review Focus

- A field emptied with select-all + Backspace, then typed into: the text is still saved and still in blocks.
- Undo after splitting or joining paragraphs: the field shows the stored value and pages are laid out again.
- A blank line in the middle of a text (`a<br><br>b`): one empty line in the editor and in the print HTML, as before.
- Enter at a schema limit (20 letter paragraphs, 40 bullets, 8 links): no row is added, a message is shown, the save does not fail.
- An audit quote that sits in the second paragraph of a field is still found by `quoteRange`.

---

### Task 1: Paragraphs of an inline value (`cv-core`)

**Files:** Create `cv-core/src/paragraphs.ts`, `cv-core/src/paragraphs.test.ts`.

**Produces:** `splitParagraphs(html: string | null | undefined): string[]`: the sanitized value cut at every `<br>`; inline tags open across a cut are closed before it and reopened after it; a blank value gives `[]`.

- [ ] Tests: `"a<br>b"` → `["a","b"]`; `"<strong>a<br>b</strong>"` → `["<strong>a</strong>","<strong>b</strong>"]`; `"a<br><br>b"` → `["a","","b"]`; `'<a href="https://x.pl">x<br>y</a>'` keeps the href on both; `""` → `[]`; for each case `sanitizeInline(parts.join("<br>"))` has the same `inlineToText` as the input.
- [ ] Run `npm test -w @newrole/cv-core -- src/paragraphs.test.ts`, see it fail, implement, see it pass.

### Task 2: One atom per paragraph in print (`cv-core/flow.ts`, `cv-engine/render.ts`)

**Consumes:** `splitParagraphs`.

**Produces:** in print mode (`editing` false) `cvFlow` emits for a text section atoms `kind: "text"`, `index: i`, key `atomKey(sid, "text", i)`, and for a job summary `kind: "job-summary"`, `index: i`, key `atomKey(sid, iid, "summary", i)`. The first keeps today's lead, the rest get `LEAD.paragraph = 0`. In editing mode both stay one atom with today's key and no `index`. `render.ts` draws `splitParagraphs(value)[atom.index]` in a `<p>`; a blank paragraph is `<br>`.

- [ ] Tests in new `cv-core/src/flow.test.ts`: print atoms for a body `"a<br>b<br><br>c"` are four `text` atoms with leads `[3,0,0,0]`; editing gives one; the tech line still sets `keepWithNext` on the last summary paragraph; title keeps with the first paragraph.
- [ ] Test in `cv-engine` (next to its existing render test, or a new `render.test.ts`): `renderCvAtoms` of `syntheticCv()` contains the same text as before, and a two-paragraph body renders two `<p class="cv-text">`.
- [ ] Implement, run both packages' tests.

### Task 3: Paragraph blocks in the editor (`cv-editor`)

**Files:** Modify `Editable.tsx`, `usePagination.ts`, `atoms.tsx` (text and job-summary fields), `audit-dom.ts`, `cv.css`.

**Produces:** `Editable` prop `paragraphs?: boolean`. In that mode the host carries `data-paras="1"`, renders each paragraph of `splitParagraphs(value)` as a `<div>` (blank one: `<div><br></div>`; blank value: empty host, so the placeholder shows), does not intercept Enter (Shift+Enter runs `insertParagraph`), and after every input wraps direct children that are not `<div>` into one, keeping the selection. Reading stays `sanitizeInline(innerHTML)`. Multi-line paste inserts one block per line.

`usePagination`: an atom whose direct child is a `[data-paras]` host with block children is measured as one unit per block. The first block's unit starts at the atom's top, carries the atom's lead, and its spacer goes on the atom element; the other blocks' spacers go on the blocks. `keepWithNext` of the atom applies to its last block only. Every measured element has its margin set or cleared on each run.

`audit-dom.ts` `quoteRange`: a block `<div>` after the first counts as one `"\n"`; a `<br>` that is a block's only child counts as nothing.

- [ ] Browser check (in-memory harness): 60× Enter + text in "Profil", in the last text section and in a job summary at a page end: no measured unit ends below its page's content bottom, every typed line is found on a sheet, the print HTML of the same content has the same page count.
- [ ] Browser check: select-all + Backspace then typing; undo after a split; bold across two paragraphs; Backspace at a paragraph start joins.

### Task 4: Enter, Backspace and arrows in the other fields (`cv-editor`, `cv-core`)

**Files:** Modify `Editable.tsx`, `atoms.tsx`, `CvEditor.tsx`, `cv-core/src/schema.ts`, `cv-core/src/edit.ts` (+ `edit.test.ts`), `copy-cv.ts`.

**Produces:**

- `schema.ts`: `CV_LIMITS = { links: 8, sections: 40, skills: 60, jobs: 60, bullets: 40, cards: 30, education: 30, paragraphs: 20 } as const`, used by the zod schema instead of the literals.
- `Editable` props `onEnter?: () => void` (Enter in a field without `onSplit`, `multiline`, `paragraphs` or `lines`) and `onMergeBack?: (html: string) => void` (Backspace with a collapsed caret at the very start of a non-empty field).
- `edit.ts`: `mergeBullet(content, sid, iid, index)` and `mergeParagraph(content, sid, index)` join an entry into the one before it.
- `EditorOps`: `focusNext(field: string)`, `focusField(field, where)` where `where` may be a text offset, and `room(count: number, max: number): boolean` that shows the toast `cv.ed.limit` (`{max}`) and returns false at the limit.
- Enter per field as in the table in spec 7.2; Backspace in a wholly empty skill, education entry or link removes it and focuses the field before.
- Arrow up on a field's first line and arrow down on its last line move the caret to the previous or next `[data-field]` in the sheet, at the same x where the browser can place it.

- [ ] Unit tests for `mergeBullet`, `mergeParagraph` and `CV_LIMITS` against the schema.
- [ ] Browser check: every row of the table in spec 7.2; the 21st letter paragraph is refused with the message.

### Task 5: Multi-line addressee and signature (`cv-core`, `cv-editor`, `cv-engine`)

**Files:** Modify `cv-core/src/schema.ts`, `cv-core/src/styles.ts`, `cv-core/src/content.test.ts`, `cv-editor/src/Editable.tsx`, `cv-editor/src/atoms.tsx`; read `cv-core/src/letter.ts`, `cv-core/src/text.ts`, `src/server/autofill/letter.ts` for how they take `"\n"`.

**Produces:** schema type `lines(max)` for `recipient` and `signature`: keeps `"\n"`, turns other control characters into spaces. `.cv-letter-to` and `.cv-letter-sign` get `white-space:pre-wrap`. `Editable` prop `lines?: boolean`: a plain field where Enter inserts a line break and reading keeps `"\n"`.

- [ ] Unit test: a recipient `"Firma\nul. Prosta 1"` survives `parseCvContent`; a `"\t"` becomes a space.
- [ ] Browser check: Enter in the addressee and in the signature gives a new line that is still there after undo/redo and in the print HTML.

### Task 6: Header links on the sheet (`cv-editor`, `cv-core`)

**Files:** Modify `cv-core/src/edit.ts` (+ test), `cv-editor/src/atoms.tsx` (`ContactLines`), `cv.css`, `copy-cv.ts` (help text, pl and en).

**Produces:** `relabelLink(link: CvLink, label: string): CvLink`: sets the label; when `link.url` is empty or equals `normalizeHref(link.label)`, the url becomes `normalizeHref(label) ?? ""`, otherwise it stays. A "Dodaj link" button (`cv.links.add`) at the end of the contact block, editor only, hidden at `CV_LIMITS.links`. Enter and Backspace in links as in Task 4.

- [ ] Unit tests: `relabelLink({label:"",url:""}, "github.com/x").url === "https://github.com/x"`; a hand-set url is kept; a label that is no address clears a derived url.
- [ ] Browser check: the button adds a link and focuses it; typing `github.com/x` stores `https://github.com/x`.

### Task 7: Checks

- [ ] `npm run lint`, `npm run check:boundaries`, `npm run check:i18n`, `npm run typecheck`, `npm test` from the repository root.
- [ ] Read the new strings in both languages in the editor.
