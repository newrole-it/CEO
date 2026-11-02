# Accounts, profile and privacy

Search does not require an account. The first time an email is entered, newrole.it creates the user and signs that browser in. A later sign-in emails a link that works once and expires after 15 minutes. The token is stored as a hash. Requests are limited to 5 per email and 20 per IP each hour. With `EMAIL_PROVIDER=console`, the sign-in URL is printed in the web server log without the email address. Settings → Hasło sets an optional password for any account; `/login` takes email and password next to the one-time link.

There is no billing and no email alerts. LinkedIn sign-in uses OpenID Connect and only receives your name, email, and picture. The seeded owner stays the admin.

## Your profile from LinkedIn, without a LinkedIn app

Getting your profile needs no LinkedIn app and no keys. `/start` → "Pobierz z LinkedIn" offers three ways:

1. **Claude in your browser** (local install only). The app runs `claude -p --chrome` on your Claude licence. Claude opens a new tab in your Chrome, where you are already signed in to LinkedIn, reads `linkedin.com/in/me` plus its `/details/experience/`, `/details/skills/`, `/details/education/`, `/details/certifications/`, and `/details/languages/` pages, then closes the tab. The session has only five tools: list tabs, new tab, navigate, read page text, close tab. Nothing can be clicked, typed, or sent, and no other profile, feed, job, or message page is opened. It needs the [Claude in Chrome](https://claude.ai/chrome) extension signed in with the same account as Claude Code and usually takes 1–3 minutes. Offered only when `APP_ORIGIN` is a loopback address, because it drives the Chrome on the machine the app runs on.
2. **LinkedIn data export (ZIP).** LinkedIn → Settings → Data privacy → Get a copy of your data. Only `Profile.csv`, `Positions.csv`, `Skills.csv`, `Education.csv`, `Certifications.csv`, and `Languages.csv` are read. From `Profile.csv` only the name, headline, summary, and location are used: address, birth date, and postcode are dropped. Messages, connections, and every other file in the archive are never opened. The ZIP is read in memory and not stored.
3. **Profile PDF.** Your profile → More → Save to PDF. Any CV PDF or pasted text works the same way.

This reads only your own profile, in your own browser, when you start it. newrole.it does not crawl LinkedIn. In Claude Code, the `onboard` MCP prompt follows the same rules, and `profile_import` takes `text`, `pdfPath`, or `zipPath`.

A PDF is parsed in memory (`src/server/profile/pdf.ts`): it never touches the disk and is not stored. The structured profile is stored, and so are the parsed sections (headline, about, experience, skills, education) so a CV can be created from them. CV text is treated as untrusted: instruction-like lines are stripped, and skills or titles the model invents are kept only when they appear in the source. Model replies from the CV are cached under the user and removed with the profile.

### Sign in with LinkedIn (optional)

Sign-in uses the official OpenID Connect flow, scopes `openid`, `profile`, and `email`. It is a sign-in method, not a profile source, and is mainly for the hosted version.

1. Create an app at [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps).
2. Add the product "Sign In with LinkedIn using OpenID Connect".
3. Set the authorized redirect URL to `${APP_ORIGIN}/api/auth/linkedin/callback`.
4. Put the client id and secret in `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.

## Deciding on offers

"Not for me" and "I like it" sit on each offer, with J or ← and K or →, A marks it applied, and Z undoes several steps. On a narrow screen the same offers are a swipe stack: left is "Not for me", right is "I like it". Decided offers leave the For you list and are listed under Saved (`/jobs/saved`: liked, applied, passed). Deciding without an account creates a guest account on the server; its decisions move to your account when you sign in. Results can filter by industry and a minimum monthly salary; the minimum hides undisclosed salaries.

## Profile and CV audit

The LinkedIn profile audit (the extension on your own profile page) gives a 0–100 score with what to change: keyword gaps counted from the offers in your saved searches, vague wording, invisible seniority, date gaps and form, each with text to paste. `/profile/audit` no longer shows it: it opens the CV audit below for the first editable CV in your list (the default CV comes first), or for an uploaded PDF when none is editable, asks a guest to sign in, and without any CV points to `/cv`.

The CV audit runs in the CV editor (`/cv/<id>?audit=1`, or the Audit button). It underlines exact phrases on the sheet, puts a comment beside each one, and where the wording can be proposed, offers it to apply in one click. A note is tied to its words: once they change, the note is done, and undo brings it back. Marks are CSS highlights, so nothing reaches the saved CV or the PDF. Keyword notes use the latest successful search for each saved role: a phrase becomes a note only when at least five matched offers contain it, that share is at least 15%, and the CV never says it. The model cannot supply a score or a percentage; a suggestion with a number the CV does not have is dropped and replaced with a placeholder such as `[liczba]`. Without a model, the notes come from rules, with no suggested wording.

## Your data

Settings can export your data as JSON, delete the CV and profile, or delete the account. Deletion removes the profile, searches, decisions, audits, sessions, sign-in links, and the LinkedIn connection. Audit-log rows keep the action name only. CVs are stored because you saved them: "Usuń CV i profil" does not delete them; delete them on `/cv`, or delete the account.

Privacy and terms (`/privacy`, `/terms`) are drafts pending legal review.
