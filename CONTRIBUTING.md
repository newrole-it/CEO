# Contributing to newrole.it

Bug reports and pull requests are welcome. For anything larger, open an issue first, so we agree on the change before you build it.

- A pull request needs your agreement to the [contributor licence agreement](CLA.md). Tick its box in the pull request template. A pull request without it is not merged.
- Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
- A security problem goes through [SECURITY.md](SECURITY.md), not a public issue.

## Set up

You need [Node 22.12 or newer](https://nodejs.org) (the Vite that runs the tests needs it) and [Docker Desktop](https://www.docker.com/products/docker-desktop) running, on macOS or Linux. On Windows, use WSL. [Claude Code](https://claude.com/claude-code) is optional.

Clone the repository, then run this in its folder:

```bash
npm run go
```

It creates `.env` with fresh secrets, installs packages, starts Postgres in Docker, runs migrations, builds the Chrome extension, starts the apps switched on in `.env` and opens http://127.0.0.1:43123/setup. Run it again any time: it skips what is already done. `npm run setup` does the same preparation without starting the app.

To use a Postgres you already run, set `DATABASE_URL` in `.env`. `npm run go` uses it and leaves Docker alone.

`.nvmrc` holds the Node major version, 22: the one `npm run go` asks for and the one CI runs.

The project uses npm, and `package-lock.json` is the lockfile. The Chrome extension in `apps/reo-extension` is not a workspace and has its own lockfile.

## Commands

Run them from the repository root.

```bash
npm run go                 # Postgres, migrations, extension, then every app that is on in .env
npm run dev                # newrole.it alone on 127.0.0.1:43123
npm run test:db            # create the test database if needed and migrate it (again after new migrations)
npm test                   # every workspace's tests, the extension's, and the node:test flow tests
npm run check:boundaries   # every workspace imports only what it declares
npm run check:i18n         # no interface text written straight into a .tsx file
npm run lint               # eslint
npm run typecheck          # types, workspace by workspace
npm run build              # newrole.it's production build
npm run ext:build          # rebuild the Chrome extension
npm run ext:dev            # the extension in WXT's dev mode
```

`npm test` is three scripts you can also run on their own: `npm run test:workspaces` (each workspace's own tests), `npm run test:extension` (the extension's tests) and `npm run test:flow` (newrole.it's node:test flow tests, against the test database).

[Configuration and running](apps/resume-engine-optimization/docs/configuration.md) has every command and every environment variable.

## The test database

The tests use a database next to the one in `.env`, with `_test` added to its name.

- `node apps/resume-engine-optimization/scripts/test-db.mjs url` prints its URL.
- `TEST_DATABASE_URL`, set in the environment or in `.env`, overrides it.
- `npm run test:db` creates it if it is missing and applies the migrations. Run it again after new migrations.
- It refuses to prepare a database whose name does not end in `_test`.

## What CI checks

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request and on every push to `main`. On Ubuntu, with Node 22 and a Postgres 16 service, it runs:

1. `npm ci`
2. `npx prisma generate --schema apps/resume-engine-optimization/db/schema.prisma`, then `npm run generate --workspaces --if-present`
3. `npm run test:db`
4. `npm run lint`
5. `npm run check:boundaries` and `npm run check:i18n`
6. `npm run typecheck`
7. `npm run test:workspaces`, `npm run test:extension` and `npm run test:flow`
8. `npm run build --workspaces --if-present`

Run the same checks before you open a pull request.

## Dependency overrides

Blitz 3.0.2 pins exact versions of packages that have security advisories (`tar`, `nanoid`, `cookie`, `cross-spawn` and others), and no newer Blitz exists. `overrides` in the root `package.json` replaces them with patched versions, each under the package that pins it.

npm applies `overrides` only to packages it reaches from the root `package.json`, not to those reached only through a workspace. So `blitz`, `@blitzjs/auth` and `@blitzjs/next` are also root `devDependencies`, at the same versions as in `apps/resume-engine-optimization/package.json`. When you change a Blitz version, change it in both places.

After you change `overrides`, check the result with `npm audit` and `npm ls <package>`: npm keeps a version that is already in `package-lock.json`.

## Formatting

Prettier writes the code style: no semicolons, lines up to 100 characters (the `prettier` field in `package.json`). `.prettierignore` lists what it skips. The pre-commit hook in `.husky/pre-commit` runs `pretty-quick --staged` and `lint-staged`, which runs `eslint --fix` on staged `.js`, `.mjs`, `.ts` and `.tsx` files. `.editorconfig` gives your editor the same basics: UTF-8, LF line endings, two spaces.

## Boundaries between apps and packages

Every app under `apps/` stands on its own, and so does every workspace in it. `npm run check:boundaries` ([`scripts/check-boundaries.mjs`](scripts/check-boundaries.mjs)) checks that:

- a file imports only Node's built-ins, files inside its own workspace, and packages its `package.json` declares;
- nothing reaches into another workspace's files by path;
- the `@newrole/*` packages depend on each other without cycles, and none depends on an app;
- an app uses another app's packages only where `USES` in that script allows it.

One reach across is declared there, in `CONTRACTS`: newrole.it's tests read the Chrome extension's `lib/`, to prove the two still agree on what a form field is and what a LinkedIn page holds. TypeScript checks that imports resolve; this checks that they are allowed. [Architecture](apps/resume-engine-optimization/docs/architecture.md) has the rules between the apps and the packages.

## Interface copy

The interface comes in Polish and English. It shows the language the person picked, or else their browser's: Polish when the browser prefers Polish over English, English for any other language (`apps/resume-engine-optimization/packages/app-kit/src/languages.ts`).

The strings live in:

- `apps/resume-engine-optimization/src/app/i18n`: `copy.ts` and one `copy-*.ts` file per feature;
- the packages' own copy files: `packages/ui/src/copy.ts`, `packages/profile-ui/src/copy-profile.ts`, `packages/cv-editor/src/copy-cv.ts` and `packages/cv-editor/src/copy-tailor.ts`, under `apps/resume-engine-optimization`.

Every key needs both languages. Polish is the source: each English dictionary is typed `Record<keyof typeof …Pl, string>` from its Polish one, and `copy.ts` types the merged English dictionary as `en: Dict`. So `npm run typecheck` fails when a Polish key has no English string.

- Placeholders use `{name}`; fill them with `fmt()`.
- Polish uses the informal, capitalised "Ty".
- Keys are dotted and grouped by screen, as in [ux-spec.md §10](apps/resume-engine-optimization/docs/product/ux-spec.md).
- No text a person reads is written in a component. `npm run check:i18n` ([`scripts/check-i18n.mjs`](scripts/check-i18n.mjs)) fails on JSX text, strings in JSX, text attributes such as `aria-label` and `placeholder`, and static page titles. Text that is the same in every language takes an `i18n-ignore` comment with the reason.
- [AGENTS.md](AGENTS.md) has the whole rule for writing text that other languages can follow: whole sentences with placeholders, no `locale === "pl"` ternaries, `Intl` for dates and numbers, codes rather than sentences from the server. AI coding agents read it, and so should you.

## Changelog

[CHANGELOG.md](CHANGELOG.md) lists every change people can notice, newest first. There are no tagged releases yet, so entries are grouped by the date they reached `main`. When you change something people can notice, add a line under Unreleased in the same pull request.

Keep to its format, because the app's `/changelog` page reads it (`apps/resume-engine-optimization/src/shared/changelog.ts`): `##` for a date, `###` for a group, `-` for one line of plain text. The groups in use are Added, Changed, Fixed, Removed and Security.

## Commit messages

Recent commits look like this:

```text
feat: the extension adds the offer on the open tab to newrole.it
fix(docker): the image carries the extension's lib/ that the build type-checks
chore: every app prepares its own test database; docs follow jobs lab's own schema
```

- A type, an optional scope in parentheses, a colon, then what is true after the change, in lower case.
- The types in the history include `feat`, `fix`, `refactor`, `chore`, `docs` and `test`.
- The body, when there is one, says why, and how you checked it.

## Pull requests

Fill in the template: what the change does and how you checked it. Tick the CLA box.

## Documentation

- [Configuration and running](apps/resume-engine-optimization/docs/configuration.md): every command, every environment variable, Docker Compose, tests
- [Accounts, profile and privacy](apps/resume-engine-optimization/docs/accounts.md)
- [Applications, CV, answers and the extension](apps/resume-engine-optimization/docs/applications.md)
- [Architecture](apps/resume-engine-optimization/docs/architecture.md): the apps, the packages, and the rules between them
- [Publishing](apps/resume-engine-optimization/docs/publishing.md): what publishing the packages to npm would take
- [Chrome extension](apps/reo-extension/README.md) (in Polish)

## Licence

newrole.it is licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`). Your contribution stays available to everyone under the AGPL in this repository. The [CLA](CLA.md) also lets the people who run the project use it under other terms, and says why.
