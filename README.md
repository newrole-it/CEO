<p align="center">
  <img src="apps/resume-engine-optimization/docs/screenshots/banner.svg" alt="newrole.it" width="900">
</p>

# newrole.it: your CV for every offer

newrole.it tailors your CV and cover letter to each job offer you work on, on your own machine. Build your profile from a CV or LinkedIn, keep your general CVs in a real A4 editor, paste the link to an offer and newrole.it reads the whole posting, keeps it for you, and writes a CV and a letter for it from what your CV and profile say. It tracks your applications, keeps your answers to application questions, and Claude Code can drive all of it through MCP. A Chrome extension adds offers, fills application forms and records what you sent.

[![Node 22+](https://img.shields.io/badge/node-22%2B-339933?style=flat-square&labelColor=15161d&logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-5b3df5?style=flat-square&labelColor=15161d&logo=next.js&logoColor=white)](https://nextjs.org)
[![Blitz.js](https://img.shields.io/badge/Blitz.js-3-6700eb?style=flat-square&labelColor=15161d)](https://blitzjs.com)
[![Claude Code MCP](https://img.shields.io/badge/Claude_Code-MCP_server-d97757?style=flat-square&labelColor=15161d)](#use-it-from-claude-code)
[![Licence AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0--only-15161d?style=flat-square)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-2ea043?style=flat-square&labelColor=15161d)](CONTRIBUTING.md)

[Features](#features) · [Quick start](#quick-start) · [First steps](#first-steps-after-the-install) · [Extension](#chrome-extension) · [Claude Code](#use-it-from-claude-code) · [Troubleshooting](#troubleshooting) · [Docs](#documentation) · [Contributing](#contributing)

<p align="center">
  <img src="apps/resume-engine-optimization/docs/screenshots/reo-offers.png" alt="Offers in newrole.it with the First steps card: the profile and the first offer are done, tailoring the CV is next" width="900">
</p>

## Features

- 💻 **Runs on your machine.** Postgres in Docker, Node, and that is it. No billing, no API keys required.
- 👤 **Your profile without a LinkedIn app.** Import from a CV PDF, LinkedIn's data export ZIP, pasted text, or let Claude read your own profile in your own Chrome. The profile audit gives a score and specific changes.
- 📄 **My CV, in two tabs.** General: each CV everything starts from, with its own cover letter, written by the model, pasted or typed. For offers: the CVs and letters written for one offer, grouped by offer. A real A4 editor with a photo you can paste, versions with compare and restore, an audit that underlines what to change, and a PDF printed from the same HTML.
- 🔗 **Offers by their link.** Paste a link and newrole.it reads the posting from its source: the employer's ATS through its API (Greenhouse, Lever, Ashby, Workable, Teamtailor, Recruitee, Personio, Traffit, Pinpoint and other ATSes) or the page's schema.org JobPosting; a page with neither comes back as a draft with its text, for you to check, under robots.txt and the source policy. The whole text is kept for you, to read, edit or paste yourself. LinkedIn and job boards are not read when you add an offer.
- ✍️ **A CV and a letter for each offer.** The model gets your CV, your profile and the offer's text, and writes the letter from your general letter when you have one; code keeps employers, dates, contact details and numbers as your CV has them, and the notes say what changed and what to check. A site that opts out of AI use gives the model only its company, role and place.
- 📋 **Application tracker.** Stages from applied to offer, next steps, timeline, your stated salary, statistics with a funnel and response rates, CSV import and export, two-way sync with your own Google Sheet, and status updates from a Gmail message you open and pick in the extension (the mailbox itself is never searched).
- 💬 **Answer bank.** Every answer you gave to an application question, grouped by question with per-company variants, and Claude drafts from them.
- 🧩 **Chrome extension** ([apps/reo-extension](apps/reo-extension/README.md)). Adds the offer you are looking at to newrole.it in one click, fills application forms from your details, CV and answer bank on known ATS hosts, records the application when you submit, turns the Gmail message you have open into a stage change after you confirm it, and scores your LinkedIn profile 0–100. It never fills passwords or consents and never submits for you.
- 🤖 **An MCP server for Claude Code.** Profile, offers, CV, applications and answers as tools, and prompts for onboarding, one application end to end and a weekly review. Model calls run through `claude -p` on your own subscription.
- 🧭 **Guided from the first minute.** `/setup` checks the install step by step, a First steps card walks you from your profile to your first tailored CV and application, the CV editor explains itself on the first visit, and `/features` explains every screen, button and switch, the extension's included.

The engine that finds new offers on its own (crawling ATS boards, watched companies, a ranked feed) is not part of newrole.it. It lived in `apps/jobs-lab` and is meant to move to a repository of its own.

## Quick start

You need [Node 22+](https://nodejs.org) and [Docker Desktop](https://www.docker.com/products/docker-desktop) running (macOS or Linux; on Windows use WSL). [Claude Code](https://claude.com/claude-code) is optional and recommended: it is the AI engine, on your subscription.

```bash
git clone https://github.com/newrole-it/newrole.it.git
cd newrole.it
npm run go
```

That is the whole install. `npm run go` creates `.env` with fresh secrets, installs packages, starts Postgres in Docker, runs migrations, builds the Chrome extension, starts the site, and opens http://127.0.0.1:43123/setup. Run it every day: it skips what is already done. Ctrl+C stops everything.

newrole.it runs as one process: the Next server also does its background work (the Google Sheet sync and the company names the extension matches offers by), so there is no worker to start.

> **Tip:** it works with no model at all. Without Claude Code or an API key, a CV is read by rules, the editor, the audit by rules and the PDF all work; tailoring and letters say they need a model.

## First steps after the install

`/setup` opens by itself. It lists what to do, in order, shows what already works and refreshes on its own:

| Step | How |
|---|---|
| Database | `npm run go` handles it |
| Claude Code | Recommended. One command to install, one to sign in. No API keys |
| Account | Enter an email. Locally it opens the account at once, with no email sent |
| Profile from your CV | Upload a CV PDF, import LinkedIn, or paste text. About a minute |
| Form details | First name, email and phone, which the extension types into forms |
| CV to send | Create a CV from your profile, upload a PDF or import HTML |
| Chrome extension | Load one folder at chrome://extensions, click Connect |
| Claude Code: MCP server | Copy one command |
| Google Sheet | Optional, in Settings |

Once the database, the account and the profile work, `/setup` says the basics work and sends you to add your first offer. From there the **First steps** card at the top of Offers and My CV leads you through the loop newrole.it is for:

1. **Profile.** Done in `/setup`. Your CV is made from it, and the model reads it when it writes for an offer.
2. **Add your first offer.** Paste the link to a posting on the company's site or its recruitment system. newrole.it reads the whole posting and keeps it on the offer's own page.
3. **Tailor your CV.** On the offer's page, click "Tailor CV and letter". The tailored CV opens in the editor; its "Tailoring" tab says what the model changed and what to check.
4. **Apply and track it.** Download the PDF, send your application, then click "Add to applications" on the offer's page. With the extension, a submitted form is recorded by itself.

The card hides itself once all four are done, or when you click Hide; the account menu brings it back. The first time you open the CV editor, "How to edit" shows what the sheet does not: pasting a photo, the buttons next to entries, links, the outline and the shortcuts. The question-mark button in the editor's toolbar opens it again.

<p align="center">
  <img src="apps/resume-engine-optimization/docs/screenshots/reo-editor-help.png" alt="The CV editor with How to edit open: typing on the page, photo, buttons next to entries, links, outline, shortcuts and the toolbar" width="900">
</p>

**Every feature and option is explained in the app at http://127.0.0.1:43123/features** (Features in the header, the footer and the account menu), the Chrome extension's buttons and switches included.

<p align="center">
  <img src="apps/resume-engine-optimization/docs/screenshots/reo-features.png" alt="The Features page at the Chrome extension: what each popup button and switch does" width="900">
</p>

## Chrome extension

`npm run go` builds it into `apps/reo-extension/.output/chrome-mv3`. Open `chrome://extensions`, turn on Developer mode, click Load unpacked and choose that folder. Chrome opens `/setup`; click Connect there. After a `git pull`, `npm run go` rebuilds it: click Reload next to it in `chrome://extensions`.

The popup has four switches. Each has a one-line explanation under it, and "Co robią te opcje?" in the popup opens `/features#extension`:

| Switch | Default | What it does |
|---|---|---|
| Automatyczne śledzenie wysłanych aplikacji | on | A submitted application form is recorded in the tracker with your answers. Off: use "Zapisz tę stronę jako aplikację" yourself |
| Pokazuj na ofertach, czy już aplikowano | on | On an offer's page, a panel and a mark on the icon when you already applied to it or to that company |
| Oceniaj mój profil LinkedIn, gdy go otworzę | on | Scores your own LinkedIn profile 0–100 when you open it, and shows what to change. It never scores other people's profiles by itself |
| Działaj na wszystkich stronach | off | Off: the extension works by itself only on known recruitment systems, the job boards it knows, and LinkedIn; elsewhere you use the popup's buttons. On: Chrome asks for access to all https sites, and the form panel, the recording of applications and the "already applied" check work on every https page, such as a company's own careers site |

[apps/reo-extension/README.md](apps/reo-extension/README.md) (in Polish) lists the sites, what the extension sends and what it never does.

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

## Updating, stopping, removing

- **Update:** `git pull`, then `npm run go`. It installs new packages when the lockfile changed, runs new migrations and rebuilds the extension; reload the extension in `chrome://extensions` afterwards.
- **Stop:** Ctrl+C in the terminal running `npm run go`. The database keeps running in Docker; `docker compose stop db` stops it too.
- **Remove:** `docker compose down -v` deletes the database container and its volume, with all your data. Remove the extension in `chrome://extensions`, and the MCP server with `claude mcp remove newrole -s user` if you added it. Settings has an export of your data before you do.

## Troubleshooting

`npm run go` stops with a one-line reason and what to do. The usual ones:

| It says | Do this |
|---|---|
| newrole.it needs Node 22 or newer | `nvm install 22 && nvm use 22`, or install Node from nodejs.org |
| On Windows, run newrole.it inside WSL | Clone and run it in WSL |
| No database on 127.0.0.1:…, and Docker is not installed / not running | Start Docker Desktop and run `npm run go` again, or point `DATABASE_URL` in `.env` at a Postgres you already run |
| The database refused the password in .env | Something else answers on that port, or the Docker volume is from an older `.env`. `docker compose down -v` starts over with an empty database |
| Port 43123 is taken by another program | Stop it, or set `APP_ORIGIN="http://127.0.0.1:<another port>"` in `.env`. The extension only talks to http://127.0.0.1:43123 or to an https address set in its options, so keep 43123 if you use it |
| `/setup` says the database needs an update | Stop the app (Ctrl+C) and run `npm run go` |

If something else breaks, open an issue with the output of `npm run go`, your OS and Node version. Leave CV contents and anything from `.env` out of it.

## Docker Compose

```bash
cp .env.example .env   # set SESSION_SECRET_KEY, OWNER_PASSWORD, POSTGRES_PASSWORD
docker compose up --build
```

Postgres and the web app, published on 127.0.0.1 only. Claude Code and headless Chrome are not in the image, so model calls need `LLM_API_KEY`. See [configuration.md](apps/resume-engine-optimization/docs/configuration.md).

## Which apps run

`npm run go` reads one flag per app from `.env`, `"on"` or `"off"`:

| Flag | App | Default |
|---|---|---|
| `APP_RESUME_ENGINE_OPTIMIZATION` | newrole.it (`apps/resume-engine-optimization`) | on |
| `APP_REO_EXTENSION` | the Chrome extension build (`apps/reo-extension`) | on |

Another app under `apps/` joins by a `go` field in its `package.json`: its flag and default, the script that prepares it, the scripts it runs and its address. `npm run go` writes the flag into `.env` the first time it sees the app. An app whose folder is gone is skipped.

## Layout

npm workspaces. Each app lives under `apps/` with the packages it is made of in its own `packages/` folder, its docs and its own tooling, so an app can leave the repository with everything it needs. The root holds only what runs them: `package.json` and the lockfile, `.env`, `npm run go` (`scripts/go.mjs`), `npm run check:boundaries` (`scripts/check-boundaries.mjs`), `docker-compose.yml`, the community files and the licence.

```
apps/
├── resume-engine-optimization/   newrole.it, the CV app (@newrole/app)
│   ├── src/  db/  mcp/  config/  Next 16 + Blitz UI and services, Prisma schema and migrations, MCP server
│   ├── packages/                 cv-core, cv-engine, cv-editor, profile, profile-ui, ats, offers,
│   │                             matching, llm, ui, app-kit
│   └── docs/                     configuration, accounts, applications, architecture, product plans
└── reo-extension/                the Chrome extension (WXT, its own lockfile)
```

| Path | What lives there |
|---|---|
| `apps/resume-engine-optimization` | newrole.it: the UI with Blitz auth (`src/app`), services (`src/server`), the MCP server (`mcp/`), Prisma schema and migrations (`db/`) |
| `…/packages/cv-core`, `cv-engine`, `cv-editor` | The CV and letter model and rules; tailoring, letters, the CV audit and printing; the A4 editor |
| `…/packages/profile`, `profile-ui` | The profile from a CV, a PDF or LinkedIn, its audit and the facts a model may use; the profile screens |
| `…/packages/ats`, `offers` | Reading one offer from its link on ATS boards and career sites; polite fetching, source policies, robots.txt |
| `…/packages/matching`, `llm`, `ui`, `app-kit` | Normalization, dedupe and FX rates; model clients; the design system; origin guard and interface language |
| `apps/reo-extension` | The Chrome extension; it talks to newrole.it's `/api/ext/*` |

[apps/resume-engine-optimization/docs/architecture.md](apps/resume-engine-optimization/docs/architecture.md) has the rules between them.

## Documentation

- **In the app:** `/features` explains every screen and option, `/setup` the install, `/changelog` every change
- [Configuration and running](apps/resume-engine-optimization/docs/configuration.md) — every command, every environment variable, Docker Compose, tests
- [Accounts, profile and privacy](apps/resume-engine-optimization/docs/accounts.md) — sign-in, LinkedIn import without a LinkedIn app, audits, your data
- [Applications, CV, answers and the extension](apps/resume-engine-optimization/docs/applications.md) — the tracker, statistics, Google Sheet, Gmail, CV editor, answer bank
- [Architecture](apps/resume-engine-optimization/docs/architecture.md) — the apps, the packages, and the rules between them
- [Publishing](apps/resume-engine-optimization/docs/publishing.md) — what publishing the packages to npm would take
- [Chrome extension](apps/reo-extension/README.md) (in Polish) · [Product plans](apps/resume-engine-optimization/docs/product)
- [Changelog](CHANGELOG.md) — every change by date

## Contributing

Bug reports and pull requests are welcome; for anything larger, open an issue first. [CONTRIBUTING.md](CONTRIBUTING.md) has the setup, the commands CI runs, the rules for interface copy and the changelog. A pull request needs your agreement to the [contributor licence agreement](CLA.md). Everyone follows the [code of conduct](CODE_OF_CONDUCT.md), and security problems go through [SECURITY.md](SECURITY.md), not a public issue.

```bash
npm run test:db     # create the test database if needed and migrate it
npm test            # every workspace's tests, the extension's, and the node:test flow tests
npm run lint && npm run typecheck && npm run check:boundaries
```

The interface speaks Polish and English: the language the person picked in the header, or else their browser's (Polish when the browser prefers Polish, English otherwise).

## Status and licence

newrole.it is in active development and runs locally first. Privacy and terms are drafts pending legal review, and the source policy is documented, not legal advice. Keeping the whole text of an offer a person added, and showing it to them, is new in this version; [apps/resume-engine-optimization/docs/product/plan-p0.md](apps/resume-engine-optimization/docs/product/plan-p0.md) §3 records the earlier decision to keep 300 characters and asks for a lawyer's view before a public version.

Licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`). If you change it and let other people use it over a network, you have to offer them your source.
