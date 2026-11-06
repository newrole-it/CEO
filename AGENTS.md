# Instructions for coding agents

This file is for AI coding agents working in this repository (Claude Code reads it through `CLAUDE.md`). [CONTRIBUTING.md](CONTRIBUTING.md) has the setup, the commands, what CI checks, the formatting and the commit style; follow it too.

## The database in `.env` holds real data

It is the person's own: their offers, applications, decisions and CVs. Do not lose any of it. These rules come from [plan-p0.md §1](apps/resume-engine-optimization/docs/product/plan-p0.md).

- Never run against it: `prisma migrate reset`, `prisma migrate dev` (that is what `npm run db:migrate` runs), `prisma db push`, `TRUNCATE`, a bulk `deleteMany`, or a restore from a backup without the owner's consent.
- The schema changes only through `prisma migrate deploy` (`npm run db:deploy`), after a `pg_dump` and a row count before and after.
- A migration only adds. Dropping a column or a table is the owner's decision.
- Tests run only against a database whose name ends in `_test`. `npm run test:db` creates and migrates it. The flow tests in `apps/resume-engine-optimization/test/` import `test/only-test-db.ts` first, and newrole.it's `vitest.config.ts` points `DATABASE_URL` at the test database, because without it Prisma reads `.env`.
- Commit and push only when the owner asks. The working tree holds other sessions' uncommitted changes: no `git checkout`, `git stash` or `git reset`.

## Tests and checks

Run one test file from the repository root:

```bash
npm test -w @newrole/app -- src/server/auth/api-tokens.test.ts    # newrole.it's vitest tests
npm test -w @newrole/cv-core -- src/tailor.test.ts                # a package whose test script is vitest run
npx vitest run --root apps/reo-extension test/form-dom.test.ts    # the Chrome extension
cd apps/resume-engine-optimization && node scripts/test-db.mjs run npx tsx --test test/auth.test.ts   # one flow test, on the test database
```

Before you finish, run what CI runs: `npm run lint`, `npm run check:boundaries`, `npm run check:i18n`, `npm run typecheck` and `npm test`. `npm test` includes the flow tests, which need `npm run test:db` once and again after new migrations.

## Interface text: write for every language

newrole.it is built to be used in any language. Today the interface comes in Polish and English, and more languages must be possible without hunting through the code. Treat every word a person reads as text to be translated, from the first line you write.

### Every string a person reads lives in a copy file

- That covers components and pages, page titles and descriptions (`generateMetadata`), `aria-label`, `alt`, `title` and `placeholder`, toasts and confirmations, error messages a person sees, e-mails, the Chrome extension (popup, options, panels on pages), MCP prompt titles and tool replies a person reads, sheet headers, and default values written into a person's data.
- The copy files: `apps/resume-engine-optimization/src/app/i18n/` (`copy.ts` and one `copy-*.ts` per feature), and in the packages `packages/ui/src/copy.ts`, `packages/profile-ui/src/copy-profile.ts`, `packages/cv-editor/src/copy-cv.ts` and `packages/cv-editor/src/copy-tailor.ts`. A new feature gets its own `copy-<feature>.ts`, merged in `copy.ts`.
- Short strings are flat dotted keys grouped by screen (`"sheet.err.auth"`), read with `t("key", vars)`. A long page with lists (privacy, terms, `/bot`) is one object per language in `i18n/copy-<page>.ts`, exported as `Record<Locale, typeof pagePl>`.
- Add every key in every language in the same change. Polish is the source: each other dictionary is typed from the Polish one (`Record<keyof typeof xPl, string>`, `typeof xPl`), so `npm run typecheck` fails when a key is missing. Never leave text in the wrong language as a stand-in.
- Polish uses the informal, capitalised "Ty".

### Write for any number of languages, not two

- Look text up by locale: `t()`, `copy[locale]`, `Record<Locale, …>`. Do not write `locale === "pl" ? "…" : "…"`; the next language would have to find and change every one of them.
- Do not declare another `"pl" | "en"` type. The app and the packages that depend on `@newrole/ui` import `Locale` from `@newrole/ui/i18n` (or `src/app/i18n/copy`). The server-side packages (`cv-core`, `cv-engine`, `profile`) do not depend on `@newrole/ui` and should not start to: reuse the locale type the package already has. Do not name fields after a language (`labelPl`): use `Record<Locale, string>`.
- Pass the locale on. No default locale parameter (`locale = "en"`): a caller that forgets it silently shows the wrong language.

### Whole sentences, placeholders, plurals

- One key holds one whole sentence. Never build a sentence from pieces or put words or punctuation around `t()` in JSX: word order differs between languages. Put the variable parts in placeholders, `{name}`, filled by `fmt()` or `t(key, vars)`.
- A count that changes the words gets `.one`, `.few` and `.many` keys, chosen with `pluralKind(n, locale)`.
- Units are copy too: `"usage.seconds": "{s} s"`, not `{n} s` in JSX.

### Dates, numbers, money

- Format with `Intl` and `intlLocale(locale)`: `new Intl.DateTimeFormat(intlLocale(locale), …)`, `numberFormat(locale)`. Never write `"pl-PL"` or `"en-GB"` in code, never call `toLocaleString()` without a locale, never build a date from `getDate()` and dots.
- Do not store formatted text (a formatted salary, a translated note) in the database. Store numbers, dates and codes; format them when they are shown.

### From the server to the interface: codes, not sentences

- A server function, API route or mutation returns a code (`{ code: "too-large" }`, `error.name = code`), and the interface translates it (`` t(`sheet.err.${code}`) ``). A message in the response is a fallback for logs, not what the person reads.
- Never decide what to show by matching the text of an English message (`message.includes("50 mb")`). Add a code instead.
- Never show `error.message` from the server to a person; show a translated key.

### The language of the interface is not the language of the content

- A CV, a cover letter and their file names follow the document's own language (`CvLocale`), not the interface.
- Prompts to the language model are written in English and name the output language from the data: the document's language, or the person's interface language. Never assume Polish.

### What is not interface text

Log lines, identifiers, test fixtures, regular expressions that read Polish or English input, data such as city names, the product names in `NAMES` in `scripts/check-i18n.mjs`, URLs, and commands inside `<code>`. Anything else that must stay as it is gets a comment with `i18n-ignore` and the reason, on its line or the line above.

### Before you finish

1. `npm run check:i18n`: no text left in `.tsx` files outside the copy files.
2. `npm run typecheck`: every key exists in every language.
3. Read your new strings in both languages, in context.

### Not there yet

These still hold text that cannot be translated. Do not copy their pattern. When you change one, move what you touch into copy files:

- the Chrome extension, `apps/reo-extension` (Polish only, `lang="pl"`, `toLocaleDateString("pl-PL")`);
- MCP prompt titles and tool replies, `apps/resume-engine-optimization/mcp/` (Polish only);
- server messages shown in the extension or stored in data: `src/server/autofill/letter.ts`, `src/server/autofill/track.ts`, `src/server/applications/sheet.ts`;
- the sign-in e-mail, `src/server/auth/email.ts` (English only);
- raw server text shown to a person: `error.message` in `src/app/settings/SettingsScreen.tsx` and `src/app/(auth)/components/LoginForm.tsx`, English API messages matched by text in `errorFor` in `src/app/start/Onboarding.tsx`, and `result.error` in the extension popup;
- the web app manifest, `src/app/manifest.ts` (Polish only);
- `formatSalary` in `src/server/applications/logic.ts` (always `pl-PL`, and stored);
- dictionaries written next to the code instead of in a copy file: `packages/cv-engine/src/audit.ts`, `packages/profile/src/audit.ts`, `demand.ts`, `linkedin-audit.ts`, `packages/cv-core/src/letter.ts`, `blank.ts`, `src/shared/applications.ts`, `src/server/applications/sheet-table.ts`, `src/app/features/content.ts`.
