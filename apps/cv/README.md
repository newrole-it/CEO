# newrole CV

Build your profile from a CV or LinkedIn, paste a link to a job offer, and get your CV tailored to it, with a cover letter, in an A4 editor. A separate app built from the same packages as [newrole.it](../../README.md): the same profile import, the same reading of offers, the same model calls and the same editor. It runs on your machine and keeps everything in files.

```bash
npm install          # once, in the repository root
npm run cv           # http://127.0.0.1:43124
```

For a production build: `npm run cv:build`, then `npm run cv:start`.

1. **Your profile** (`/profile`): upload a CV as a PDF, paste its text, upload LinkedIn's data export ZIP, or let Claude read your own LinkedIn page in your Chrome (needs Claude Code and the Claude in Chrome extension on this machine; it opens only your own profile). Check what was read and save it. Add your form details (name, contact, links, terms): they go into the header of a CV made from the profile. "Audit the profile" gives a 0–100 score and specific changes.
2. **Your CV**: make one from the profile, upload a PDF (the model structures it), import an HTML CV, or start from an empty one.
3. **The offer**: paste its link. LinkedIn and job boards are not read; for those, type the company and role and paste the requirements into the guidance.
4. Choose the CV to start from and the language, and add a cover letter if you want one. The model may use your profile as facts besides the CV. The result opens in the editor, with versions, the CV audit, a print view and a PDF (local Chrome, or the browser's print).

| Variable | Default | What it does |
|---|---|---|
| `NEWROLE_CV_DATA` | `apps/cv/.data` | Where documents (`documents/*.json`, with their versions and latest audit), offers (`offers/*.json`) and the profile (`profile.json`) are kept |
| `LLM_PROVIDER`, `CLAUDE_WRITING_MODEL`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | as in newrole.it | The model; without one the profile is read by rules, the audits use rules only, tailoring says it needs a model, and the editor still works |
| `LINKEDIN_BROWSER_IMPORT` | on when Claude Code is installed | `off` hides reading LinkedIn through Claude in Chrome |
| `LINKEDIN_BROWSER_MODEL`, `LINKEDIN_BROWSER_TIMEOUT_MS` | `CLAUDE_CLI_MODEL` or haiku, 240000 | The model and time limit for that read |
| `CHROME_PATH` | found on macOS and Linux | Chrome or Chromium for the PDF |
| `APP_ORIGIN` | none | The app's address when it is not 127.0.0.1 or localhost |
| `CV_USER_AGENT` | `NewroleCV/0.1 (…)` | The User-Agent offers are read with |

Only a 300-character excerpt of an offer is written to disk; the full text is read from its page when something is written, and kept in memory for 15 minutes. A CV or LinkedIn file you import into the profile is read in memory; only the sections read from it are kept. There is no account: the app listens on 127.0.0.1 and refuses requests under any other host name and writes from any other page.

Not here, because they need newrole.it: the audits do not compare you with what offers ask for (that needs its index of matched offers), there is no sign-in with LinkedIn (newrole CV has no accounts), and the extension's LinkedIn panel talks to newrole.it.

How it is put together: [docs/architecture.md](../../docs/architecture.md).
