# English Everywhere a Person Reads: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every string a person reads in the Chrome extension, in the MCP server's prompt titles and tool replies, and in the server texts they show exists in Polish and English, chosen by the browser's language (extension) or the account's language (MCP).

**Architecture:** The extension keeps one dictionary file, `lib/copy.js`, read through `translator(localeOf(navigator.language))`, the way its "Tailor CV" part already works; HTML carries keys and is filled on load. The server answers the extension with codes, and the extension translates them. The MCP server gets `src/app/i18n/copy-mcp.ts`, typed from the Polish dictionary, and reads the language from the account (`User.locale`).

**Tech Stack:** Plain ES modules and WXT in `apps/reo-extension` (vitest, jsdom tests); Next.js 16, Prisma, `@modelcontextprotocol/sdk`, vitest in `apps/resume-engine-optimization`.

**Spec:** `docs/superpowers/specs/2026-11-13-english-everywhere-design.md`. Read it and `AGENTS.md` ("Interface text: write for every language") before any task.

## Global Constraints

- Polish stays the source language; English is added next to it. Never replace Polish with English.
- No `locale === "pl" ? … : …`, no new `"pl" | "en"` type, no default locale parameter. Look text up by locale and pass the locale on.
- One key holds one whole sentence with `{placeholders}`. A count that changes the words gets `.one`, `.few`, `.many` keys.
- Dates and numbers go through `Intl` with the locale. No `"pl-PL"` in code, no `toLocaleString()` without a locale.
- The server returns codes; the interface translates them. A message in a response is for logs.
- Polish uses the informal, capitalised "Ty". English is British, as in the app (`intlLocale` gives `en-GB`).
- No database schema change, no migration.
- The database in `.env` is the owner's real data. Tests run only against a database whose name ends in `_test` (`npm run test:db`).
- The working tree may hold other sessions' changes: no `git checkout`, `git stash`, `git reset`. **Do not commit or push; the owner commits.** Each task ends with its tests passing, not with a commit.
- Not interface text, leave as is: regular expressions and word lists that read Polish input (`lib/linkedin.js`, `lib/form.js`, `lib/gmail.js`), log lines, identifiers, test fixtures. Mark each kept Polish line with an `i18n-ignore` comment and the reason.
- Out of scope: `src/server/auth/email.ts`, the audit dictionaries in `packages/`, `src/shared/applications.ts`, `sheet-table.ts`, `formatSalary`.

## Review Focus

1. **A browser in a third language (`de`, `uk`).** Expected: the whole extension is in English, never a mix. Test in Task 1.
2. **A code the extension does not know** (a newer server, an HTTP error). Expected: the generic translated message, never the raw code or a Polish server sentence. Tests in Tasks 3 and 4.
3. **A count of 1, 2–4, 5+ and 22 in Polish** ("1 rola", "2 role", "5 ról", "22 role"). Expected: the right form in each language. Test in Task 1 and Task 6.
4. **An older extension talking to the new server.** Expected: it still works; the server keeps the old response fields next to the new codes. Test in Task 2.
5. **An MCP call when no account has a language the dictionary knows, or no account exists.** Expected: English replies and the existing English "no account" error, not a crash. Test in Task 7.

## File Structure

| File                                                                | Responsibility                                                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/reo-extension/lib/copy.js` (modify)                           | Every extension string, `pl` and `en`. Dictionaries only, plus the existing `localeOf`, `translator`, `errorKey`. |
| `apps/reo-extension/lib/i18n.js` (create)                           | Helpers that need the DOM or `Intl`: fill a document from keys, format a date, pick a plural form.                |
| `apps/reo-extension/test/i18n.test.ts` (create)                     | Tests of those helpers and the "no Polish outside copy.js" guard.                                                 |
| `apps/reo-extension/icons/_locales/{en,pl}/messages.json` (create)  | The manifest's name and description. `icons/` is WXT's `publicDir`, so its content lands in the build's root.     |
| `apps/resume-engine-optimization/src/app/i18n/copy-mcp.ts` (create) | MCP prompt titles, descriptions and tool replies, `mcpPl` and `mcpEn`.                                            |
| `apps/resume-engine-optimization/mcp/copy.ts` (create)              | `mcpT(locale)`: the translator the tools use.                                                                     |

---

### Task 1: The extension's i18n helpers and the guard

**Files:**

- Create: `apps/reo-extension/lib/i18n.js`, `apps/reo-extension/test/i18n.test.ts`
- Modify: `apps/reo-extension/lib/page.js:37-40` (`formatDate`), `apps/reo-extension/lib/copy.js`

**Interfaces:**

- Consumes: `COPY`, `localeOf(language)`, `translator(locale)` from `lib/copy.js`.
- Produces, all exported from `lib/i18n.js`:
  - `intlLocale(locale) → "pl-PL" | "en-GB"`
  - `formatDate(value, locale) → string` (date only; `""` for an invalid date)
  - `formatDateTime(value, locale) → string`
  - `pluralKind(n, locale) → "one" | "few" | "many"`, from `Intl.PluralRules`; English `other` maps to `many`
  - `applyCopy(root, t, locale)`: sets `textContent` of every `[data-i18n]` element to `t(key)`, sets each attribute named in `data-i18n-attr="placeholder:key,title:key"`, and sets `lang` on `root.documentElement` when `root` is a document
- `formatDate` in `lib/page.js` is removed; callers import the one from `lib/i18n.js` and pass a locale.

- [ ] **Step 1: Write the failing tests** in `test/i18n.test.ts`:

```ts
it("formats a date in the given language", () => {
  expect(formatDate("2026-11-03T10:00:00Z", "pl")).toBe("3.11.2026")
  expect(formatDate("2026-11-03T10:00:00Z", "en")).toBe("03/11/2026")
  expect(formatDate("nope", "en")).toBe("")
})
it("picks the plural form", () => {
  expect([1, 2, 5, 22].map((n) => pluralKind(n, "pl"))).toEqual(["one", "few", "many", "few"])
  expect([1, 2, 5].map((n) => pluralKind(n, "en"))).toEqual(["one", "many", "many"])
})
it("fills a document from keys and sets its language", () => {
  document.body.innerHTML = `<button data-i18n="fit.tailor"></button><input data-i18n-attr="placeholder:fit.retry">`
  applyCopy(document, translator("en"), "en")
  expect(document.querySelector("button")!.textContent).toBe("Tailor CV")
  expect(document.querySelector("input")!.placeholder).toBe("Try again")
  expect(document.documentElement.lang).toBe("en")
})
it("keeps Polish text out of the code", () => {
  // every lib/*.js except copy.js, and both entrypoints/*/index.html: no line with a Polish
  // letter unless that line or the one above carries "i18n-ignore"
})
```

Read the two exact date strings from `new Intl.DateTimeFormat("pl-PL").format(...)` and `"en-GB"` in Node before writing them into the test; the values above are what those locales are expected to give and must be confirmed by running it. The guard test reads the files with `fs`, and is the test that fails until Tasks 3 to 6 are done: mark it `it.fails` in this task and remove `.fails` in Task 6.

- [ ] **Step 2: Run** `npx vitest run --root apps/reo-extension test/i18n.test.ts`. Expected: FAIL, `lib/i18n.js` does not exist.
- [ ] **Step 3: Implement `lib/i18n.js`** with the five exports above. Delete `formatDate` from `lib/page.js` and fix its imports in `lib/content.js` and `lib/offer-notice.js` to pass `locale` (those files get their `locale` in Tasks 4 and 5; until then pass `localeOf(navigator.language)` at the call site).
- [ ] **Step 4: Add `i18n-ignore` comments** with the reason on the Polish regular expressions and word lists in `lib/linkedin.js`, `lib/form.js`, `lib/gmail.js` and the comment at `lib/content.js:489`.
- [ ] **Step 5: Run** `npx vitest run --root apps/reo-extension`. Expected: PASS, with the guard reported as an expected failure.

---

### Task 2: The server answers the extension with codes

**Files:**

- Modify: `apps/resume-engine-optimization/src/server/autofill/letter.ts:201-205,236-246`, `src/server/autofill/track.ts:29,166,191`, `src/server/applications/offer-status.ts:228-240`, `src/server/gmail/opened.ts:222-225`, the routes under `src/app/api/ext/` that pass these on
- Modify: `src/app/i18n/copy-applications.ts` (one key, both languages)
- Test: `src/server/autofill/letter.test.ts`, `src/server/autofill/track.test.ts`, the tests next to `offer-status.ts` and `opened.ts`

**Interfaces:**

- Produces, for Tasks 3 to 5:
  - A failed form letter carries `code: "unknown-offer" | "llm-unavailable" | "no-base" | "llm-failed" | "failed"` next to the existing `error` text. `no-content` reports as `no-base`, as today.
  - Offer status and opened-mail responses keep `statusLabel` and `label` (older extensions read them) and already carry the status code; where a response has only the label, add the code as `status` / `closedAtStage`.
  - `resentNote(locale: Locale): string` in `track.ts` replaces the constant `RESENT_NOTE`.
- Consumes: `User.locale` (a string column, default `"en"`).

**Decision that differs from the spec, to tell the owner:** the "sent again" note is appended to `Application.notes`, the person's own free text, so a code cannot be stored there. It is written once, in the account's language, from the copy file. This is a default value in the person's data, which `AGENTS.md` treats as copy.

- [ ] **Step 1: Write the failing tests.** In `letter.test.ts`: a letter for a page with no company or title fails with `code: "unknown-offer"`; a `CvError("llm-unavailable")` gives `code: "llm-unavailable"`; an unknown error gives `code: "failed"`; each still has a non-empty `error`. In `track.test.ts`: a second submission by an account with `locale: "en"` calls `addApplicationNote` with `"Sent again through the extension"`, and with `locale: "pl"` with `"Wysłano ponownie przez rozszerzenie"`.
- [ ] **Step 2: Run** `npm test -w @newrole/app -- src/server/autofill`. Expected: FAIL on the new assertions.
- [ ] **Step 3: Implement.** `LetterError` gains a `code`; `failureText` becomes `failure(error): { code, error }` and the task record and `GET /api/ext/letter` pass `code` through. Add `"app.note.resent"` to `applicationsPl` and `applicationsEn`; `trackSubmission` reads the account's `locale` with the user row it already loads (add `locale: true` to that select) and resolves it with the same function the app uses for a stored locale string (find it with `grep -rn "resolveLocale" apps/resume-engine-optimization/packages/app-kit`). Add the status codes to the two responses.
- [ ] **Step 4: Run** `npm test -w @newrole/app -- src/server/autofill src/server/applications src/server/gmail` and `npm run typecheck`. Expected: PASS.

---

### Task 3: Popup and options

**Files:**

- Modify: `apps/reo-extension/entrypoints/popup/index.html`, `entrypoints/options/index.html`, `lib/popup.js`, `lib/options.js`, `lib/page.js:42-50` (`connectionError`), `lib/copy.js`
- Test: `apps/reo-extension/test/extension-runtime.test.ts`, `test/gmail-extension.test.ts`

**Interfaces:**

- Consumes: `applyCopy`, `formatDate`, `formatDateTime` (Task 1); status codes (Task 2).
- Produces in `lib/copy.js`: keys `popup.*`, `options.*`, `conn.*` (connection errors shared by every panel: `conn.not-connected`, `conn.offline`, `conn.disconnected`), `err.*` (the `ERRORS` map of `popup.js:8-22`), `err.generic`, `mail.kind.*` (the nine kinds of `popup.js:25-35`), `status.*` (the ten application statuses, same words as `LABELS` in `src/shared/applications.ts`).
- `connectionError(result, t)` takes the translator and returns a translated sentence or `null`.

- [ ] **Step 1: Write the failing tests.** In `extension-runtime.test.ts`, add a `describe` that loads the popup with `navigator.language = "en-GB"` and asserts: the state line reads "Checking the connection…" before the first reply, the fill button reads "Fill the form on this page", an unknown `result.error` of `"HTTP 500"` shows the `err.generic` text and never the string `HTTP 500`, and `document.documentElement.lang` is `"en"`. Change the existing Polish assertions to run with `navigator.language = "pl-PL"` set explicitly, without loosening them.
- [ ] **Step 2: Run** `npx vitest run --root apps/reo-extension test/extension-runtime.test.ts`. Expected: FAIL on the English block.
- [ ] **Step 3: Move the text.** Each visible string in the two HTML files becomes a `data-i18n` key (attributes through `data-i18n-attr`), the `<title>` included; `lang="pl"` goes. Both scripts call `applyCopy(document, t, locale)` first. Every Polish literal in `popup.js`, `options.js` and `page.js` becomes `t(key, vars)`; sentences built from pieces (`popup.js:136`, `:200`) become whole-sentence keys with placeholders, one key per variant. `result?.error` is never shown raw: an unknown code shows `err.generic`. The two `"pl-PL"` date calls use `formatDate` / `formatDateTime`.
- [ ] **Step 4: Run** the same test file, then `test/copy.test.ts`. Expected: PASS (the copy test proves both dictionaries have the same keys and placeholders).

---

### Task 4: The form panel

**Files:**

- Modify: `apps/reo-extension/lib/content.js` (the lines the grep in the spec lists: 114–142, 170, 212, 226–275, 352–358, 375–438, 502), `lib/copy.js`
- Test: `apps/reo-extension/test/form-dom.test.ts`, `test/extension-runtime.test.ts`

**Interfaces:**

- Consumes: letter failure `code` (Task 2); `conn.*`, `err.generic` (Task 3); `formatDate`, `pluralKind` (Task 1).
- Produces in `lib/copy.js`: keys `fill.*`. The summary line (`content.js:352-358`) is whole sentences, not joined parts: one key per combination that can occur, or one sentence per fact shown on its own line. The letter line (`content.js:426-438`) is one key per variant: `fill.letter.kept`, `fill.letter.existing`, `fill.letter.fromGeneral`, `fill.letter.fromPast.one`, `.few`, `.many`, `fill.letter.new`, each with an `.attached` twin for "attached as a PDF". Letter failures: `fill.letter.err.<code>` for the five codes of Task 2, plus `fill.letter.err.gone` and `fill.letter.err.timeout` for the two the extension raises itself.

- [ ] **Step 1: Write the failing tests.** With `navigator.language = "en-GB"`: the panel's main button reads "Fill from newrole.it"; after a fill of 6 known fields and 1 skipped the summary names both numbers and ends with a sentence telling the person to check the form and submit it themselves; a letter failure with `code: "llm-unavailable"` shows the English `fill.letter.err.llm-unavailable` text; a failure with an unknown code shows `fill.letter.err.failed`; the field badge `title` is English. With `"pl-PL"`: the existing Polish assertions, unchanged.
- [ ] **Step 2: Run** `npx vitest run --root apps/reo-extension test/form-dom.test.ts test/extension-runtime.test.ts`. Expected: FAIL on the English block.
- [ ] **Step 3: Move the text** as described in Interfaces. `locale` and `t` are made once at the top of the panel's setup and passed down.
- [ ] **Step 4: Run** the two test files and `test/copy.test.ts`. Expected: PASS.

---

### Task 5: The offer notice

**Files:**

- Modify: `apps/reo-extension/lib/offer-notice.js:160-181,366-369`, `lib/offer.js:118-124`, `lib/copy.js`
- Test: `apps/reo-extension/test/offer-notice.test.ts`

**Interfaces:**

- Consumes: `status.*` keys (Task 3); status codes in the response (Task 2); `formatDate` (Task 1). `offer-notice.js` already has `locale` and `t` (`:26-27`).
- Produces in `lib/copy.js`: keys `notice.*`. `offer.js:118-124` (the icon's tooltip) becomes whole-sentence keys: `notice.badge.applied`, `notice.badge.probably`, `notice.badge.company`, with `{title}`, `{status}`, `{date}` placeholders. The status shown is `t("status." + code)`; `statusLabel` from the server is the fallback only when the code is unknown.

- [ ] **Step 1: Write the failing tests.** With `"en-GB"`: an application with `status: "INTERVIEW"` and a Polish `statusLabel` from the server shows the English status; the heading reads "Already applied to this offer"; the "sent" line carries the date in `en-GB` form; a status code the extension does not know shows the server's `statusLabel`. With `"pl-PL"`: the existing assertions.
- [ ] **Step 2: Run** `npx vitest run --root apps/reo-extension test/offer-notice.test.ts`. Expected: FAIL.
- [ ] **Step 3: Move the text.**
- [ ] **Step 4: Run** the test file and `test/copy.test.ts`. Expected: PASS.

---

### Task 6: The LinkedIn panel, the service worker's locale, the manifest

**Files:**

- Modify: `apps/reo-extension/lib/profile-panel.js:164-376`, `lib/background.js:373,384`, `wxt.config.ts`, `lib/copy.js`, `test/i18n.test.ts` (remove `.fails` from the guard)
- Create: `apps/reo-extension/icons/_locales/en/messages.json`, `icons/_locales/pl/messages.json`
- Test: `apps/reo-extension/test/linkedin-panel.test.ts`

**Interfaces:**

- Consumes: `pluralKind` (Task 1); `conn.*`, `err.generic` (Task 3).
- Produces: keys `linkedin.*`, with `linkedin.read.roles.one/.few/.many`, `linkedin.read.schools.*`, `linkedin.read.skills.*` in place of `plural(n, "rola", "role", "ról")`. The messages `auditProfile` and `getProfileAudit` carry `locale` from the panel or popup that sends them; `background.js` passes it on and no longer writes `"pl"`. Manifest: `name: "__MSG_extName__"`, `description: "__MSG_extDescription__"`, `default_locale: "en"`.

- [ ] **Step 1: Write the failing tests.** With `"en-GB"`: the "what was read" line for 1 role, 2 schools and 5 skills is one English sentence with the right singular and plural; the copy button reads "Copied" after a copy; the request sent to the service worker carries `locale: "en"`. With `"pl-PL"`: the existing assertions, and 22 roles reads "22 role".
- [ ] **Step 2: Run** `npx vitest run --root apps/reo-extension test/linkedin-panel.test.ts`. Expected: FAIL.
- [ ] **Step 3: Move the text; pass the locale through `background.js`; write the two `messages.json` files** with `extName` and `extDescription` (the Polish description is the one in `wxt.config.ts` today).
- [ ] **Step 4: Remove `.fails`** from the guard test in `test/i18n.test.ts`.
- [ ] **Step 5: Run** `npx vitest run --root apps/reo-extension`. Expected: PASS, the guard included.
- [ ] **Step 6: Build and check the manifest.** Run `npm run ext:build`. Expected: `apps/reo-extension/.output/chrome-mv3/_locales/en/messages.json` and `…/pl/messages.json` exist, and `manifest.json` has `"default_locale": "en"` and `"name": "__MSG_extName__"`. If WXT does not copy `_locales` from `icons/`, read WXT's documentation on `publicDir` and localisation and place the files where it says; do not guess.

---

### Task 7: The MCP server

**Files:**

- Create: `apps/resume-engine-optimization/src/app/i18n/copy-mcp.ts`, `apps/resume-engine-optimization/mcp/copy.ts`
- Modify: `mcp/user.ts` (`McpUser` gains `locale`), `mcp/create-server.ts`, `mcp/server.ts`, `mcp/prompts.ts`, `mcp/tools.ts`, `mcp/tools-cv.ts`, `mcp/tools-answers.ts`, `mcp/tools-applications.ts`, `src/server/applications/sheet.ts:104-123,301,419`
- Test: `mcp/tools.test.ts`, `mcp/tools-cv.test.ts`, `mcp/tools-answers.test.ts`, `mcp/tools-applications.test.ts`, `mcp/contract.test.ts`, `mcp/mcp.test.ts`

**Interfaces:**

- Produces:
  - `mcpPl`, `mcpEn: Record<keyof typeof mcpPl, string>` in `copy-mcp.ts`. Keys: `mcp.prompt.<name>.title`, `mcp.prompt.<name>.description`, `mcp.tool.<name>.title`, `mcp.<area>.<what>` for replies. Not merged into `copy.ts`: the web interface never reads them.
  - `mcpT(locale: Locale): Translate<keyof typeof mcpPl>` in `mcp/copy.ts`, built with `makeTranslator` from `@newrole/ui/i18n`.
  - `McpUser = { id; email; name; how; locale: Locale }`. `currentUser()` selects `locale` and resolves the stored string to a `Locale` with the function Task 2 found.
  - `createServer(options: { locale: Locale })`: the language of titles and descriptions, which are fixed when the server starts. `mcp/server.ts` awaits `currentUser()` first and passes `user.locale`; when it throws `NoUserError` it passes `"en"` at that one call site, with a comment saying nobody's language is known yet.
  - Each tool handler takes its translator from the user it already loads: `const t = mcpT(user.locale)`.
- `sheet_sync`: `args.locale ?? user.locale` (`tools-applications.ts:478`).
- Prompt bodies (`prompts.ts:36-50,68-83,95-101`) are instructions the model reads: rewrite them in English, and have each say which language to answer the person in, from `user.locale`. The line about writing style (`prompts.ts:82`) keeps naming the skill per document language.
- Sheet errors: MCP reads the code and translates it with `mcp.sheet.err.<code>`; the web interface already does (`SheetSettings.tsx:62`). `syncErrorText` stores `"<code>: <detail>"` from now on, and the reader at `sheet.ts:127-131` accepts both the old form (with the Polish sentence) and the new one. `syncNow` returns `code` next to `message`, for the not-connected (`sheet.ts:301`) and the success case (`:419`, with the row count as a value) too. The two thrown messages at `sheet.ts:439` and `:579` already travel with an error class: give each a code if it has none, and translate by code wherever MCP shows them.

- [ ] **Step 1: Write the failing tests.** In each tools test, mock `currentUser` with `locale: "en"` in a new `describe` and assert the English reply for the cases the Polish tests already cover: `answer_save` ("Saved a new answer"), `cv_update` with `copyAs` ("Created a copy"), `applications_stats` (the first line names the period and the number sent), the empty tracker, an unknown CV id. Add `locale: "pl"` to the mock used by the existing Polish assertions. In `contract.test.ts`: `createServer({ locale: "en" })` lists the prompt `apply` with the title "Help me apply", and `{ locale: "pl" }` with "Pomóż mi zaaplikować". In `mcp.test.ts` or next to `user.ts`: an account whose stored locale is `"de"` resolves to `"en"`. In the sheet tests: `parseSyncError` reads both stored forms.
- [ ] **Step 2: Run** `npm test -w @newrole/app -- mcp`. Expected: FAIL on the English blocks and on `createServer`'s new argument.
- [ ] **Step 3: Implement**, one file at a time, in this order: `copy-mcp.ts` and `mcp/copy.ts`; `user.ts`; `create-server.ts`, `server.ts`, `prompts.ts`; then the four tools files; then `sheet.ts`. Sentences built from pieces (`tools-applications.ts:74-79,643-730`, `tools.ts:208-212,275`) become whole-sentence keys; day and week counts get `.one/.few/.many` keys chosen with `pluralKind` (find it with `grep -rn "export function pluralKind" apps/resume-engine-optimization`). Labels passed to `facts()` come from copy.
- [ ] **Step 4: Run** `npm test -w @newrole/app -- mcp src/server/applications` and `npm run typecheck`. Expected: PASS. `typecheck` proves every key exists in both languages.
- [ ] **Step 5: Read every English reply once in context**: start the server against the test database (`cd apps/resume-engine-optimization && node scripts/test-db.mjs run npx tsx mcp/server.ts` with an account whose locale is `en`) or call each handler from a scratch test, and read the output for word order and leftover Polish.

---

### Task 8: The web app manifest, the docs, the full check

**Files:**

- Modify: `apps/resume-engine-optimization/src/app/manifest.ts`, `src/app/i18n/copy.ts` (two keys, both languages), `scripts/check-i18n.mjs:15` (the comment saying the extension has no dictionaries), `AGENTS.md` ("Not there yet"), `README.md:140,174,218`, `apps/reo-extension/README.md`, `CHANGELOG.md` (Unreleased)
- Test: a test next to `manifest.ts`

**Interfaces:**

- Consumes: `getLocale()` from `src/app/i18n/server.ts`.
- Produces: `manifest()` is async and returns `name`, `description` and `lang` for the request's locale.

The current Polish description ("Oferty z całego świata, wyniki z Twojego kraju…") describes the offer feed, which `CHANGELOG.md` says newrole.it no longer has. Do not translate it. Use the product's current one-line description from the README's header in English, and its Polish counterpart from the app's own copy (`grep -n "meta\.\|description" apps/resume-engine-optimization/src/app/i18n/copy.ts`); if the app has no such key, ask the owner for the Polish sentence rather than inventing one.

- [ ] **Step 1: Write the failing test:** with the locale mocked to `en`, `manifest()` has `lang: "en"` and an English description; with `pl`, `lang: "pl"` and the Polish one.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Update the docs.** Remove from `AGENTS.md`'s "Not there yet" the entries this plan finished (the extension, MCP prompt titles and tool replies, `letter.ts` and `track.ts`, the manifest, and `result.error` in the extension popup); keep `sheet.ts` listed only if text remains there. In `README.md` delete "The popup is in Polish for now" (line 140), "The tools' replies are in Polish for now." (line 174) and the last sentence of the languages answer (line 218). Say in `apps/reo-extension/README.md` that the extension follows the browser's language. Add one line under `## Unreleased` → `### Changed` in `CHANGELOG.md`, in the file's format: plain text, one `-` line.
- [ ] **Step 5: Run what CI runs:** `npm run lint`, `npm run check:boundaries`, `npm run check:i18n`, `npm run typecheck`, `npm test` (after `npm run test:db`), and `npx vitest run --root apps/reo-extension`. Expected: all pass. Report any failure with its output.
- [ ] **Step 6: Look at it in Chrome.** `npm run ext:build`, reload the extension, set Chrome's language to English, and open: the popup, the options page, a form on a supported ATS, an offer already applied to, and your own LinkedIn profile. Expected: no Polish. Repeat the popup and one panel with Chrome in Polish. Use a fresh clone with its own database for anything that writes; never the database in `.env`.
