<p align="center">
  <img src="apps/resume-engine-optimization/docs/screenshots/banner.svg" alt="newrole.it" width="900">
</p>

# newrole.it: your CV for every offer

newrole.it tailors your CV and cover letter to each job offer you work on, on your own machine. Build your profile from a CV or LinkedIn, keep your general CVs in a real A4 editor, paste the link to an offer and newrole.it reads the whole posting, keeps it for you, and writes a CV and a letter for it from what your CV and profile say. It tracks your applications, keeps your answers to application questions, and Claude Code can drive all of it through MCP.

[![Node 22+](https://img.shields.io/badge/node-22%2B-339933?style=flat-square&labelColor=15161d&logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-5b3df5?style=flat-square&labelColor=15161d&logo=next.js&logoColor=white)](https://nextjs.org)
[![Blitz.js](https://img.shields.io/badge/Blitz.js-3-6700eb?style=flat-square&labelColor=15161d)](https://blitzjs.com)
[![Claude Code MCP](https://img.shields.io/badge/Claude_Code-MCP_server-d97757?style=flat-square&labelColor=15161d)](#use-it-from-claude-code)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-2ea043?style=flat-square&labelColor=15161d)](#contributing)

[Features](#features) · [Quick start](#quick-start) · [Claude Code](#use-it-from-claude-code) · [Layout](#layout) · [Docs](#documentation)

## Features

- 💻 **Runs on your machine.** Postgres in Docker, Node, and that is it. No billing, no API keys required.
- 👤 **Your profile without a LinkedIn app.** Import from a CV PDF, LinkedIn's data export ZIP, pasted text, or let Claude read your own profile in your own Chrome. The profile audit gives a score and specific changes.
- 📄 **My CV, in two tabs.** General CVs, the ones everything starts from, and the CVs and letters written for one offer, grouped by offer. A real A4 editor, versions with compare and restore, an audit that underlines what to change, and a PDF printed from the same HTML.
- 🔗 **Offers by their link.** Paste a link and newrole.it reads the posting from its source: the employer's ATS through its API (Greenhouse, Lever, Ashby, Workable, Teamtailor, Recruitee, Personio, Traffit, Pinpoint and other ATSes) or the page's schema.org JobPosting; a page with neither comes back as a draft with its text, for you to check, under robots.txt and the source policy. The whole text is kept for you, to read, edit or paste yourself. LinkedIn and job boards are not read.
- ✍️ **A CV and a letter for each offer.** The model gets your CV, your profile and the offer's text; code keeps employers, dates, contact details and numbers as your CV has them, and the notes say what changed and what to check. A site that opts out of AI use gives the model only its company, role and place.
- 📋 **Application tracker.** Stages from applied to offer, next steps, timeline, your stated salary, statistics with a funnel and response rates, CSV export, one-way sync to your own Google Sheet, and status updates from a Gmail message you open and pick in the extension (the mailbox itself is never searched).
- 💬 **Answer bank.** Every answer you gave to an application question, grouped by question with per-company variants, and Claude drafts from them.
- 🧩 **Chrome extension** ([apps/reo-extension](apps/reo-extension/README.md)). Adds the offer you are looking at to newrole.it in one click, fills application forms from your details, CV and answer bank on known ATS hosts, records the application when you submit, turns the Gmail message you have open into a stage change after you confirm it, and scores your LinkedIn profile 0–100. It never fills passwords or consents and never submits for you.
- 🤖 **An MCP server for Claude Code.** Profile, offers, CV, applications and answers as tools, and prompts for onboarding, one application end to end and a weekly review. Model calls run through `claude -p` on your own subscription.

The engine that finds new offers on its own (crawling ATS boards, watched companies, discovery, a ranked feed) is not part of newrole.it any more: it lives in [`@newrole/ats`](apps/resume-engine-optimization/packages/ats/README.md) and [`@newrole/job-index`](apps/jobs-lab/packages/job-index/README.md), with [apps/jobs-lab](apps/jobs-lab/README.md) to test it, for a separate deployment.

## Quick start

You need [Node 22+](https://nodejs.org) and [Docker Desktop](https://www.docker.com/products/docker-desktop) running (macOS or Linux; on Windows use WSL). [Claude Code](https://claude.com/claude-code) is optional and recommended: it is the AI engine, on your subscription.

```bash
git clone https://github.com/newrole-it/CEO.git
cd newrole.it
npm run go
```

That is the whole install. `npm run go` creates `.env` with fresh secrets, installs packages, starts Postgres in Docker, runs migrations, builds the Chrome extension, starts the site and the worker, and opens http://127.0.0.1:43123/setup. Run it every day: it skips what is already done. Ctrl+C stops everything.

`/setup` lists what to do next, in order, and shows what already works:

| Step | How |
|---|---|
| Database, worker | `npm run go` handles them |
| Claude Code | Optional. One command to install, one to sign in. No API keys |
| Account | Enter an email. The first email creates the account |
| Profile | Upload a CV PDF, or import your LinkedIn profile |
| Form details and CV | A short form, then create or import your CV |
| Chrome extension | Load one folder at chrome://extensions, click Connect |
| Claude Code MCP | Copy one command |
| Google Sheet | Optional, in Settings |

> **Tip:** it works with no model at all. Without Claude Code or an API key, a CV is read by rules, the editor, the audit by rules and the PDF all work; tailoring and letters say they need a model.

### Docker Compose

```bash
cp .env.example .env   # set SESSION_SECRET_KEY, OWNER_PASSWORD, POSTGRES_PASSWORD
docker compose up --build
```

Postgres, the web app and a worker, published on 127.0.0.1 only. Claude Code and headless Chrome are not in the image, so model calls need `LLM_API_KEY`. See [apps/resume-engine-optimization/docs/configuration.md](apps/resume-engine-optimization/docs/configuration.md).

## Use it from Claude Code

newrole.it ships an MCP server that talks to the same Postgres as the app. Inside this repo Claude Code offers it from `.mcp.json`; approve `newrole` once. From anywhere else:

```bash
claude mcp add newrole -s user -- npm --prefix /path/to/newrole.it run --silent mcp
```

Added the server before the rename, under the name `nowarola`? Run `claude mcp remove nowarola -s user`, then the command above. Add `-e NEWROLE_USER_EMAIL=you@example.com` when the database has more than one account (the old `NOWAROLA_USER_EMAIL` still works). The web app does not need to be running.

| Area | Tools |
|---|---|
| Profile | `profile_get`, `profile_import` |
| Offers | `offers_list`, `offer_add`, `offer_get` |
| CV and answers | `cv_list`, `cv_get`, `cv_update`, `cv_export_pdf`, `answers_search`, `answer_save`, `answer_draft` |
| Applications | `applications_list`, `application_get`, `application_add`, `application_update`, `applications_export`, `applications_stats`, `sheet_status`, `sheet_sync`, `gmail_status` |
| Prompts | `onboard`, `apply`, `pipeline` |

Things to ask:

- „Załóż mój profil z ~/Downloads/Profile.pdf” (or: „przeczytaj mój profil LinkedIn w Chrome”)
- „Dodaj tę ofertę: https://jobs.lever.co/…” and „Dopasuj moje CV do tej oferty”
- „Pomóż mi zaaplikować na tę ofertę” (the `apply` prompt: CV, answers, tracking)
- „Na jakim etapie jestem z Acme?”, „Odrzucili mnie w Beta po rozmowach”, „Mam rozmowę finałową w czwartek”
- „Przejrzyj moje aplikacje i zaktualizuj arkusz” (the `pipeline` prompt)

## Layout

npm workspaces: the apps under `apps/`, the packages they are made of under `packages/`. The root holds `.env`, the shared scripts and the docs; `npm run go`, `dev`, `build`, `start`, `worker`, `mcp` and the `db:*` scripts run from it.

| Path | What lives there |
|---|---|
| `apps/resume-engine-optimization` | newrole.it: Next 16 App Router UI with Blitz auth (`src/app`), services (`src/server`), the worker (`src/worker.ts`), the MCP server (`mcp/`), Prisma schema and migrations (`db/`) |
| `apps/reo-extension` | The Chrome extension (WXT), an app of its own with its own lockfile; it talks to newrole.it's `/api/ext/*` |
| `apps/jobs-lab` | A test bench for the offer engine: read any supported ATS board live, one offer from its link, the boards on a careers page, a smoke run over real boards |
| `apps/resume-engine-optimization/packages/cv-core`, `cv-engine`, `cv-editor` | The CV and letter model and rules; tailoring, letters, the CV audit and printing; the A4 editor |
| `apps/resume-engine-optimization/packages/profile`, `profile-ui` | The profile from a CV, a PDF or LinkedIn, its audit and the facts a model may use; the profile screens |
| `apps/resume-engine-optimization/packages/ats`, `offers` | Reading offers from ATS boards and career sites, one offer from its link; polite fetching, source policies, robots.txt |
| `apps/jobs-lab/packages/job-index` | The engine that keeps an index of offers: crawl, schedule, watched companies, discovery, catalog, harvest, live search (not used by newrole.it) |
| `apps/resume-engine-optimization/packages/matching`, `llm`, `ui`, `app-kit` | Normalization, the scorer and FX rates; model clients; the design system; origin guard and interface language |
| `scripts/` | `go.mjs` (`npm run go`), `check-boundaries.mjs`, `test-db.mjs`, the shared env loader |

[apps/resume-engine-optimization/docs/architecture.md](apps/resume-engine-optimization/docs/architecture.md) has the rules between them.

## Documentation

- [Configuration and running](apps/resume-engine-optimization/docs/configuration.md) — every command, every environment variable, Docker Compose, tests
- [Accounts, profile and privacy](apps/resume-engine-optimization/docs/accounts.md) — sign-in, LinkedIn import without a LinkedIn app, audits, your data
- [Applications, CV, answers and the extension](apps/resume-engine-optimization/docs/applications.md) — the tracker, statistics, Google Sheet, Gmail, CV editor, answer bank
- [Architecture](apps/resume-engine-optimization/docs/architecture.md) — the apps, the packages, and the rules between them
- [Sources and the offer engine](apps/jobs-lab/docs/sources.md) — the source policy and how the engine reads boards
- [Publishing](apps/resume-engine-optimization/docs/publishing.md) — what publishing the packages to npm would take
- [Chrome extension](apps/reo-extension/README.md) · [Jobs lab](apps/jobs-lab/README.md) · [Product plans](apps/resume-engine-optimization/docs/product) · [Source packs](apps/jobs-lab/packages/job-index/sources)
- [Changelog](CHANGELOG.md) — every change by date; the app shows the same list at `/changelog`

## Contributing

Bug reports and pull requests are welcome. For anything larger, open an issue first. A pull request needs your agreement to the [contributor licence agreement](CLA.md).

```bash
npm run go          # first run: Postgres, migrations, extension, web + worker
npm run dev:all     # later: web on 127.0.0.1:43123 plus the worker
npm run test:db     # create the test database if needed and migrate it (again after new migrations)
npm test            # every workspace's tests, the extension's, and the node:test flow tests
npm run check:boundaries   # packages and apps import only what they declare
npm run lint        # eslint
npm run typecheck   # types, workspace by workspace
npm run build       # production build, as CI runs it
npm run jobs-lab    # the engine's test bench on 127.0.0.1:43125; npm run jobs-lab:smoke reads real boards
```

The tests use a database next to the one in `.env`, with `_test` added to its name (`node scripts/test-db.mjs url` prints it; `TEST_DATABASE_URL` overrides it). CI runs lint, types, every test pack and the build on each pull request. The project uses npm; `package-lock.json` is the lockfile. The UI is Polish by default with an English switch; copy lives in `apps/resume-engine-optimization/src/app/i18n`. A change people can notice gets a line under Unreleased in [CHANGELOG.md](CHANGELOG.md).

## Status and licence

newrole.it is in active development and runs locally first. Privacy and terms are drafts pending legal review, and the source policy is documented, not legal advice. Keeping the whole text of an offer a person added, and showing it to them, is new in this version; [apps/resume-engine-optimization/docs/product/plan-p0.md](apps/resume-engine-optimization/docs/product/plan-p0.md) §3 records the earlier decision to keep 300 characters and asks for a lawyer's view before a public version.

Licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`). If you change it and let other people use it over a network, you have to offer them your source.
