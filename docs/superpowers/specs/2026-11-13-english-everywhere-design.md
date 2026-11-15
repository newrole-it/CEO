# English everywhere a person reads: the extension, the MCP server and the server texts they show

Approved by the owner on 2026-11-13. Step 1 of 3 before the Show HN launch; steps 2 (demo videos) and 3 (README) get their own designs.

## Why

The product, CEO (CV Engine Optimiser), from newrole.it, is about to be shown to an English-speaking audience on Hacker News, with demo videos of the Chrome extension and a README that describes Claude Code use. Today those two parts speak Polish only, so a visitor who installs the product meets Polish panels, and a video of the form filler would show Polish text.

## What is Polish-only today

Counted on 2026-11-13 as lines containing Polish diacritics, so a lower bound:

| Place                                                                             | Lines     | Files                                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chrome extension: popup, options, form panel, offer notice, LinkedIn panel, Gmail | about 150 | `apps/reo-extension/lib/{content,popup,profile-panel,linkedin,offer-notice,options,page,form,offer,gmail}.js`, `entrypoints/popup/index.html`, `entrypoints/options/index.html`, `wxt.config.ts` |
| MCP server: prompt titles and tool replies                                        | about 110 | `apps/resume-engine-optimization/mcp/{prompts,tools,tools-applications,tools-cv,tools-answers}.ts`                                                                                               |
| Server texts shown in the extension or written to the sheet                       | about 20  | `src/server/autofill/letter.ts`, `src/server/autofill/track.ts`, `src/server/applications/sheet.ts`, `src/app/api/ext/offer/route.ts`                                                            |
| Web app manifest                                                                  | 1         | `src/app/manifest.ts`                                                                                                                                                                            |

Already done and the model to follow: the "Tailor CV" part of the extension. Its text is in `apps/reo-extension/lib/copy.js` as `pl` and `en` dictionaries with the same keys (`test/copy.test.ts` checks that), read through `translator(locale)`, with `localeOf(navigator.language)` choosing Polish for a Polish browser and English for any other.

## Goals

- Every string a person reads in the extension, in MCP prompt titles and tool replies, and in the server texts listed above exists in Polish and in English.
- A person with an English browser sees no Polish in the extension. A person whose account language is English gets English MCP replies.
- The rules in `AGENTS.md` ("Interface text: write for every language") hold for everything touched, and the matching entries leave its "Not there yet" list.

## Non-goals

- The sign-in e-mail (`src/server/auth/email.ts`): it is English-only, not Polish-only.
- Dictionaries next to the code in the packages (`cv-engine/src/audit.ts`, `profile/src/audit.ts`, `demand.ts`, `linkedin-audit.ts`, `cv-core/src/letter.ts`, `blank.ts`), `src/shared/applications.ts`, `sheet-table.ts`, and `formatSalary`. None appears in the videos or in what a Hacker News visitor meets first.
- A third language.
- Any change to the database schema. There is no migration.

## Anti-goals

- Replacing Polish with English. Polish stays the source language.
- `locale === "pl" ? … : …` in code, a new `"pl" | "en"` type, or a default locale parameter.
- Translated sentences stored in the database or returned by the server for a person to read.

## Approaches

1. **English next to Polish, through the copy files (chosen).** What `AGENTS.md` prescribes and what "Tailor CV" already does. More work than a swap, but the product keeps its Polish users and a third language stays possible.
2. **Swap the Polish strings for English ones.** Fastest. It breaks the project's own rules, drops Polish users, and leaves the text scattered in code.
3. **Translate only what the videos show.** Smallest change. A visitor who installs the extension still meets Polish outside the filmed path, which is the problem this step exists to remove.

The owner asked for everything to be translated first; approach 1 is the only one that does that inside the project's rules.

## Design

**Extension.** Every string moves to `lib/copy.js`, in `pl` and `en`, as flat dotted keys grouped by screen (`popup.*`, `options.*`, `fill.*`, `notice.*`, `linkedin.*`, `gmail.*`). Code reads them with `translator(localeOf(navigator.language))`. The two HTML files carry keys, not text, and are filled when the page loads; `lang` on `<html>` is set from the locale. Dates and numbers use `Intl` with the locale; `toLocaleDateString("pl-PL")` goes. One key holds one whole sentence, with `{placeholders}`; a count that changes the words gets `.one`, `.few` and `.many` keys. The manifest's name and description in `wxt.config.ts` use Chrome's `_locales` messages.

**Server to extension.** A route that today answers with a Polish sentence answers with a code, plus the values the sentence needs. The extension translates the code. A message may stay in the response for logs only. Nothing translated is stored: where `track.ts` or `letter.ts` write a Polish note into a person's data today, they store a code or the plain values, and the text is made when it is shown.

**MCP server.** A new `src/app/i18n/copy-mcp.ts` holds prompt titles, prompt descriptions and tool replies in Polish and English, typed from the Polish dictionary so `npm run typecheck` fails on a missing key. The language is the account's (`User.locale`), read with the user the server already resolves in `mcp/user.ts` and passed on explicitly. `sheet_sync`'s `locale` argument stops defaulting to Polish and falls back to the account's language. Tool descriptions and prompt bodies that only the model reads stay in English and name the output language from the data.

**Sheet.** Headers and default values written by `src/server/applications/sheet.ts` come from the copy files by the locale passed in.

**Web app manifest.** `src/app/manifest.ts` reads its name and description from copy.

**Decisions made by the builder of this design, not stated by the owner:** the MCP language comes from the account; the packages' audit dictionaries are out of scope.

## Constraints

- The database in `.env` holds the owner's real data. Tests run only against a database whose name ends in `_test`.
- The working tree may hold other sessions' changes: no `git checkout`, `git stash` or `git reset`; commit only when the owner asks.
- Existing tests that match Polish text (`extension-runtime.test.ts`, `offer-notice.test.ts`, `linkedin-panel.test.ts`, the MCP tests) must keep meaning what they meant: run them with an explicit locale rather than loosening the assertions.

## Done when

- `npm run lint`, `npm run check:boundaries`, `npm run check:i18n`, `npm run typecheck` and `npm test` pass, and so do the extension's tests.
- With Chrome's language set to English, the popup, the options page, the form panel, the offer notice and the LinkedIn panel show no Polish.
- With an account whose language is English, each MCP prompt and each tool reply is in English.
- The new strings have been read in both languages, in context.
- `AGENTS.md`, the root README's FAQ and the extension's README no longer say these parts are Polish-only, and `CHANGELOG.md` has a line under Unreleased.

## Left to the builder

The key names, the order of the work, how the HTML files are filled, and the shape of each code the server returns.
