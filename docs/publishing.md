# Publishing newrole CV and the packages

newrole CV (`apps/cv`) and the packages it is made of live in this repository, next to newrole.it. This page says how to run newrole CV from here, how to give it a repository of its own, and what publishing the packages to npm would take. [architecture.md](architecture.md) explains how the parts fit.

## Run newrole CV from this repository

```bash
npm install          # once, in the repository root
npm run cv           # http://127.0.0.1:43124
```

`npm run cv:build` and `npm run cv:start` run the production build. newrole CV needs no database and no Docker. It reads its settings from the shell or from `apps/cv/.env.local`; Next.js loads `.env` files from the app's own folder, so newrole.it's `.env` in the repository root does not reach it. [apps/cv/README.md](../apps/cv/README.md) lists the settings.

## A repository of its own

`npm run export:cv -- <folder>` writes newrole CV as a standalone repository:

- `apps/cv` and every package it needs, followed through the packages' own dependencies. Today that is all ten: app-kit, cv-core, cv-editor, cv-engine, llm, matching, offers, profile, profile-ui, ui.
- `tsconfig.base.json`, the boundary check, `LICENSE` and `.npmrc`, unchanged.
- Files of its own: a root `package.json` with the workspaces and the commands (`dev`, `build`, `start`, `test`, `typecheck`, `lint`, `check:boundaries`, and the `cv` names newrole.it uses), a README, a CI workflow, `.gitignore`, an ESLint config with newrole.it's rules, and `.newrole-export.json`, which records the upstream repository and the commit it came from.
- Links in the copied READMEs that lead out of a package (to newrole.it's README or docs) point to the same files on GitHub. `--upstream https://github.com/<owner>/<repo>` sets that address; without it the script uses `origin`.

The layout stays `apps/` plus `packages/`, so the app's config (`../..` in `next.config.js`, `tsconfig.json`, `tailwind.config.js`) works there unchanged. Build output, local data, `node_modules` and `.env` files are not copied.

### The first time

1. Create an empty repository on GitHub, for example `newrole-it/newrole-cv`.
2. From this repository:
   ```bash
   npm run export:cv -- ../newrole-cv --upstream https://github.com/newrole-it/newrole.it
   cd ../newrole-cv
   npm install          # writes package-lock.json; commit it
   npm test && npm run build
   git init && git add -A && git commit -m "newrole CV from newrole.it"
   git branch -M main
   git remote add origin git@github.com:newrole-it/newrole-cv.git
   git push -u origin main
   ```

### Keeping it current

newrole.it stays where the code is developed; the other repository follows it. Its README says so, and sends issues and pull requests here.

```bash
git -C ../newrole-cv pull
npm run export:cv -- ../newrole-cv --upstream https://github.com/newrole-it/newrole.it
cd ../newrole-cv
git diff                 # what changed upstream
npm install              # updates package-lock.json when dependencies changed
npm test && npm run build
git add -A && git commit -m "Sync with newrole.it" && git push
```

In a clone of the exported repository the script replaces only the files git tracks there, except `package-lock.json`. What git ignores stays: `node_modules`, `apps/cv/.data` with the documents of whoever runs the app from that clone, `.env.local`. A file that no longer exists upstream shows as deleted in `git diff`. The script refuses a folder that is neither empty nor a clone of an export.

The export is a snapshot and carries no history. The packages moved into `packages/` only with this change, so a history cut out with `git filter-repo` would hold little before it.

### Checked

On 2026-11-04 an export from this branch, in a new folder and on Node 22.21.1: `npm install` (481 packages), `npm run check:boundaries`, `npm run typecheck`, `npm test` (every workspace), `npm run lint` (0 errors) and `npm run build` passed. `npm start` served the pages, created a document, printed its PDF with local Chrome, read a pasted profile and refused another host name. Exporting again into the committed clone changed nothing; with local data, `.env.local` and `node_modules` in place, they stayed.

## Publishing the packages to npm

Not set up yet. The packages are `private` and their `exports` point at TypeScript source, which suits a repository that compiles them with the app (Next's `transpilePackages`, tsx, vitest) but not an npm registry. Publishing one package takes:

1. A build to `dist/`: JavaScript and `.d.ts` from `tsc`, with the CSS, JSON and Markdown files a package reads (`@newrole/matching` reads its prompts from `.md` files next to its code).
2. A published manifest whose `exports` point at `dist/`, without `"private": true`.
3. A scope on npm. Whether `@newrole` is free there has not been checked.
4. Versions and releases, for example with changesets, in dependency order: cv-core, llm, matching, app-kit, offers, ui, then profile, cv-engine, profile-ui and cv-editor.

The exported repository could then depend on the published versions instead of carrying the packages. The licence stays AGPL-3.0-only unless you choose otherwise for a package.
