# Publishing the packages

The apps and the packages they are made of live in this repository. newrole CV, the separate CV app with its `npm run export:cv`, was removed when newrole.it itself became the CV app; [architecture.md](architecture.md) explains how the parts fit.

## Publishing the packages to npm

Not set up yet. The packages are `private` and their `exports` point at TypeScript source, which suits a repository that compiles them with the app (Next's `transpilePackages`, tsx, vitest) but not an npm registry. Publishing one package takes:

1. A build to `dist/`: JavaScript and `.d.ts` from `tsc`, with the CSS, JSON and Markdown files a package reads (`@newrole/matching` reads its prompts from `.md` files next to its code; `@newrole/ats` reads `cities.json`; `@newrole/job-index` reads its seed catalog's JSON).
2. A published manifest whose `exports` point at `dist/`, without `"private": true`.
3. A scope on npm. Whether `@newrole` is free there has not been checked.
4. Versions and releases, for example with changesets, in dependency order: cv-core, llm, matching, app-kit, offers, ui, then ats, profile, cv-engine, profile-ui, cv-editor, and job-index last.

`@newrole/job-index` lives in apps/jobs-lab and needs the Prisma client of jobs lab's own schema (`@newrole/jobs-lab-db`); it would be published from there, if at all. The licence stays AGPL-3.0-only unless you choose otherwise for a package.

## A first release of newrole.it alone

newrole.it does not depend on `@newrole/job-index` or `apps/jobs-lab`; `npm run check:boundaries` proves it. A release of the CV app needs `apps/resume-engine-optimization`, `apps/reo-extension` and the packages newrole.it declares (follow `apps/resume-engine-optimization/package.json` through the packages' own dependencies: app-kit, ats, cv-core, cv-editor, cv-engine, llm, matching, offers, profile, profile-ui, ui).
