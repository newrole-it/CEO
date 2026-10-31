# Applications, CV, answers and the Chrome extension

The plan and the contracts are in [product/plan-aplikacje.md](product/plan-aplikacje.md).

## Tracker (`/applications`)

Every application has a stage: Aplikowano → Rozmowa z rekruterem → Rozmowy → Zadanie → Rozmowa finałowa → Oferta, or a closing status: Przyjęta, Odrzucono, Wycofałem się, Brak odpowiedzi. A rejection or withdrawal records the stage it happened at. Each change goes onto the application's timeline.

"Aplikowano" on an offer, the Chrome extension, and the MCP tools all add applications. "Dodaj aplikację" takes a posting link and fills in the company, role, location and salary from the index, the ATS or the page, through the same URL checks and source policy as the crawler. LinkedIn and the Polish boards are never fetched: for those, only what the link itself spells out is filled in, for you to check.

When the extension sees a job application sent, the application keeps your answers to questions about the work, and the drawer lists them. No personal data is kept: contact details, profile links, files, ID numbers, consents and EEO answers are not sent at all, and e-mails, phone numbers and your name inside a longer answer are replaced. The salary you gave gets its own column in the table and the sheet.

## Statistics (`/applications/stats`)

The whole process in numbers, scoped to the last 4, 12, 26 or 52 weeks or to everything: applications sent and the average per week, response rate, share that reached interviews, job offers, median days to the first reply; a funnel of how many applications reached each stage with the share kept from the previous stage; where rejections and withdrawals happened; applications per week split by whether they got any reply; offer decisions per week; sources with their response rates; and two lists that ignore the range: applications waiting longest without a reply and next steps overdue or due within a week. Every chart has a hover readout and a table view, and the colours were checked for colour-vision separation in both themes. `applications_stats` gives Claude the same numbers, and the `pipeline` prompt starts with them.

## Google Sheet

Settings → Arkusz Google gives you an Apps Script to paste into your own sheet (Extensions → Apps Script, deploy as a web app). After that the worker sends the whole table about 20 seconds after each change, and `sheet_sync` sends it at once. No Google keys are involved. Sync is one-way, app to sheet.

## Gmail

Settings → Gmail connects your mailbox through your own Google OAuth client. Every 15 minutes the worker looks for mail from recruiting systems and the companies you applied to, and updates the tracker: a confirmation, an invitation to the next stage, a rejection. A status changes alone only when Gmail vouches for the sender, the mail is addressed to you, it comes from the company's own domain or the recruiting system the offer was on, the text is clear, and the change moves forward. The rest waits under "Do potwierdzenia" on `/applications`. An offer always waits, and so does a confirmation for an application not yet in the tracker. Message bodies are not stored, and the settings screen logs every message read. Google has no scope limited to some of your mail, so the token can technically read all of it: the limit is enforced by this app, as [product/plan-gmail.md](product/plan-gmail.md) explains, together with what this does not guarantee and why a public multi-user deployment needs Google's verification.

## CV (`/cv`)

Keep uploaded PDFs and editable CVs. The editor shows A4 pages and page breaks as you type. The PDF is printed by headless Chrome (`CHROME_PATH`) from the same HTML and the same page-break code, so it matches the editor. "Import HTML" reads a CV in the layout of `Rafal_Testowy_CV_PL.html`.

**Tailored CV and cover letter** ("Dostosuj CV" on every offer, `/jobs/[id]/cv`). The model proposes new wording and order for a copy of your CV, and code merges it: company, school, contact details and the order of roles cannot change, no role is dropped, and a field that gains a number your data does not have keeps its old text. What it cannot rule on, such as a tool name that is not in your CV, is listed under "Sprawdź przed wysłaniem", next to the offer's requirements you do not show. The cover letter is the same kind of document, on the same A4 sheets. A site that opts out of AI use keeps its offer text from the model; paste the requirements yourself. Autofill and the tracker use the CV written for that offer.

**Versions.** Every editable CV and letter has a history under "Wersje": save a named version, compare any version with the current text, preview it, restore it. Restoring adds a version on top, so nothing is lost. An automatic version is kept at most once per 10 minutes while you edit (the newest 30).

## Answer bank (`/answers`)

Answers to application questions, grouped by question with per-company variants. A new question shows the closest saved answers. "Napisz szkic z Claude" drafts from those answers, your profile, CV and the offer, with `CLAUDE_WRITING_MODEL` (default `sonnet`) on your subscription. The bank lists every offer an answer was used in.

**Form details** (Profil → Dane do formularzy) are the contact details and terms the extension fills without a model.

## Chrome extension

Built with [WXT](https://wxt.dev) in [`extension/`](../extension). `npm run go` builds it into `extension/.output/chrome-mv3`; `npm run ext:build` rebuilds it and `npm run ext:dev` runs WXT's dev mode. Load that folder from chrome://extensions in developer mode and click Connect on `/setup`, or paste a token from Settings.

- On known ATS hosts it fills application forms. On any other page it works from the popup.
- It fills standard fields from your form details, the CV file, and open questions from the answer bank or a Claude draft. AI drafts are outlined in yellow for review.
- It never fills passwords, consents or EEO questions, and never submits for you.
- When you submit, it records the application, reading company and title from the index or with Claude, and saves your final answers to open questions. Contact details stay in the browser.
- On your own LinkedIn profile page it reads the visible sections, stores them as your current LinkedIn profile and shows the 0–100 score with what to change. The score also sits on the extension icon. It costs no model call while the profile is unchanged, and the popup can switch it off.

See [extension/README.md](../extension/README.md).
