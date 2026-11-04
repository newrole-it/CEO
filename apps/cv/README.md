# newrole CV

Paste a link to a job offer and get your CV tailored to it, with a cover letter, in an A4 editor. A separate app built from the same packages as [newrole.it](../../README.md): the same reading of offers, the same model calls and the same editor. It runs on your machine and keeps everything in files.

```bash
npm install          # once, in the repository root
npm run cv           # http://127.0.0.1:43124
```

For a production build: `npm run cv:build`, then `npm run cv:start`.

1. Add your CV: upload a PDF (the model structures it), import an HTML CV, or start from an empty one.
2. Paste the offer's link. LinkedIn and job boards are not read; for those, type the company and role and paste the requirements into the guidance.
3. Choose the CV to start from and the language, and add a cover letter if you want one. The result opens in the editor, with versions, a print view and a PDF (local Chrome, or the browser's print).

| Variable | Default | What it does |
|---|---|---|
| `NEWROLE_CV_DATA` | `apps/cv/.data` | Where documents (`documents/*.json`, with their versions) and offers (`offers/*.json`) are kept |
| `LLM_PROVIDER`, `CLAUDE_WRITING_MODEL`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | as in newrole.it | The model; without one, tailoring says so and the editor still works |
| `CHROME_PATH` | found on macOS and Linux | Chrome or Chromium for the PDF |
| `APP_ORIGIN` | none | The app's address when it is not 127.0.0.1 or localhost |
| `CV_USER_AGENT` | `NewroleCV/0.1 (…)` | The User-Agent offers are read with |

Only a 300-character excerpt of an offer is written to disk; the full text is read from its page when something is written, and kept in memory for 15 minutes. There is no account: the app listens on 127.0.0.1 and refuses requests under any other host name and writes from any other page.

How it is put together: [docs/architecture.md](../../docs/architecture.md).
