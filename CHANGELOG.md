# Changelog

Every change people can notice, newest first. Nowa Rola has no tagged releases yet, so entries are grouped by the date they reached the main branch. The app shows this file at /changelog.

When you change something people can notice, add a line under Unreleased in the same pull request. Keep to the format below, because the page reads it: `##` for a date, `###` for a group, `-` for one line of plain text.

## Unreleased

### Added

- A public changelog: CHANGELOG.md and the /changelog page, linked from the footer.
- The project is now licensed under AGPL-3.0, with a contributor licence agreement for pull requests.
- A /bot page that says what the crawler does and how a site can make it stop.
- OFFER_INDEX=off runs Nowa Rola without an index of offers, for a service run for other people.

### Changed

- Gmail is no longer searched in the background. Open a company's reply in Gmail, click the extension and pick "Użyj tego maila w aplikacji" to move that application to the next stage. A mailbox connected earlier can be disconnected in Settings to revoke its token.
- The SmartRecruiters Posting API is off by default, because its robots.txt disallows other crawlers.
- On a public address, a new email has to confirm a sign-in link before it can use an account.
- Next.js 16. The app and its production build use webpack, which Blitz needs.
- A sign-in link asks before it signs you in and shows which account it opens.
- Guest CVs, answers and applications move to your account only when you asked for the sign-in link in the same browser.
- Setting or changing a password signs out your other devices and disconnects the Chrome extension. Connect it again afterwards.
- Reading a CV needs a session, which is created for you, and is limited per hour. Very long pasted text is refused.
- A reply from a company no longer moves an application when it names a different role, or when only a recruiting system's sender name points to it. The app asks you first.
- "Only shortlisted candidates will be contacted" and similar sentences no longer count as a next stage.
- Company suggestions leave out companies you liked or applied to, and offices outside Poland. "Go" and "data" in ordinary phrases no longer count as skills.
- Company aliases removed from the list stop matching.
- iCIMS boards are linked, not fetched, because the vendor terms ban robots.
- The privacy policy lists every place your data goes to a language model or a search provider, and says the uploaded PDF is read in memory.
- "Why it fits" chips follow the interface language.

### Fixed

- npm run go works on a fresh clone again: packages install from package-lock.json, the site starts with webpack, and sign-in no longer fails on a package that was removed.
- A career site whose sitemap fails to load (an error, a reset connection, a not-modified answer or one broken child sitemap) no longer has its offers marked as possibly closed or closed.
- A board that answers "not modified" after an unfinished crawl is read in full instead of being parked for a day.
- Traffit boards whose later pages fail, or that run past the page limit, no longer close the offers they could not read. The same holds for capped Avature, Phenom and eRecruiter boards.
- Watched company sites close offers that disappear from the careers page.
- Offers on employer-hosted Greenhouse pages (Stripe, Databricks, Elastic, MongoDB and others) are told apart again, and closed ones close.
- Two employers using the same job number on Traffit or another per-employer system no longer overwrite each other's offer; feedback and applications stay with the right employer.
- Descriptions no longer disappear when a board's list has no text, as on Greenhouse.
- Offers that are still listed stay fresh in "For you" even when their page is not read again.
- Password sign-in works in a production build. It failed with an error because the password library was bundled without its binary.
- The production build no longer stops on two ESLint comments for a rule that was not loaded.
- Saving a CV from an old tab no longer overwrites newer changes; the editor asks you to reload.
- A missing page shows a page-not-found screen with navigation, and a database error shows an error page instead of "offer no longer available" or an empty profile.
- Offer pages and the privacy page no longer tell search engines they are the home page.
- Watching a suggested company from the empty list keeps why it was suggested.
- The one-request-per-5-seconds limit per host holds across the worker, the web app and the MCP server, not only inside each process.
- Filter pills can be cleared from the keyboard, and filter and taste popovers move focus in and back.
- The coverage page, page titles and footer navigation are translated.

### Security

- A server on a public address refuses to start with the sample secrets or passwords from .env.example.
- Resolver inputs and results are no longer written to the log, so passwords and extension tokens stay out of it.
- Password sign-in is limited per email and per address. Set TRUST_PROXY=1 behind a reverse proxy so the real client address is used.
- Routes that change data check that the request comes from the app itself, which also stops DNS-rebinding pages.
- Redirects after sign-in stay on the app's own address.
- Every redirect hop of a fetched page keeps its DNS pin, and more IPv6 forms of local addresses are refused.
- The extension never sends ID numbers, religion, LGBTQ+ or gender answers, ignores form fields you cannot see, and ignores form submissions a page fakes.
- Offer text sent to Claude through MCP is marked as page content, not instructions. CV PDF export writes only .pdf files and never replaces a file that is not a PDF.
- Security headers on every page: no framing by other sites, no MIME sniffing, a strict referrer policy.
- The Docker image runs as an unprivileged user.

### Removed

- Unused code: the old search screens, the password-reset and sign-up forms, the forgot-password mail, the pre-WXT extension files, unused components and resolvers, and unused packages. pnpm-lock.yaml is gone; the project uses npm.

## 2026-10-31

### Added

- Application stages can update from Gmail, through your own Google OAuth client. Message bodies are not stored.
- Statistics for the application tracker.
- CV versions, tailoring a CV to an offer, and a CV audit.
- Answers from application forms are kept on the application.
- Adapters for Phenom, Avature, eRecruiter and Jobvite, plus shared adapters for more JSON and HTML boards.
- Company names and aliases are matched, so an application is recognised under another form of the company's name.
- Documentation for configuration, sources, accounts and applications.
- Screenshots and a demo recording of the app.

## 2026-10-30

### Added

- An MCP server, so Claude Code can search offers and work with your profile, applications, CV and answers.
- A Chrome extension for application forms, tracking and your LinkedIn profile.
- An application tracker.
- A CV editor with printable output.
- An answer bank for application questions.
- Watched companies.
- Likes and dislikes on offers, with what you liked about them, feeding your preferences.
- A setup checklist at /setup, and the npm run go command that takes a fresh clone to a running app.
- Model calls through the local Claude Code on your own subscription.
- Polish and English copy, with a language switch.
- The source and the raw text of a salary are kept with the offer.

## 2026-10-11

### Added

- Export and delete your account data.
- Roles are matched from an uploaded LinkedIn PDF profile.

### Changed

- The project is now called Nowa Rola, and results lead with personal matches.
- The site is restyled, search is open to guests, and Polish is the default language.
- The score shown on each match now includes profile fit.

### Fixed

- Saved searches are deduplicated, and the highlight on the landing page stays visible.

## 2026-10-10

### Added

- The first version, called Jobscanner: a personal scanner for public ATS boards, starting with Greenhouse, Lever, Ashby, Workable and SmartRecruiters.
- Polish-market ATS coverage in the seed scan.
- Career sites, fetched only when the terms review allows it.
- More career channels from the link-only check.
- A local index of the full allowed catalog, and search over that index.
- Accounts, profile matching and one shared search layout.
- A LinkedIn profile audit with exact highlights and counted offer gaps.
- Offer triage with swipe, undo and a light rejection penalty.
- The last crawl time on the coverage page.

### Changed

- Career sitemaps that hit the cap prefer engineering-leadership URLs.

### Fixed

- Breezy locations are parsed when the country is an object.
- DNS lookups are pinned in the form Node 22 expects.
- Nested SuccessFactors salary and location fields are read.
- UoP and B2B posts that share a city are paired.
- A denied redirect no longer kills the worker.
- A finished career listing counts as a complete index.
- Career sites that a short cache had marked complete keep backfilling.
- Each career offer keeps its own identity when JSON-LD names the employer.
- A failed sitemap fetch no longer closes a career catalog.
- "Due now" appears only when the next crawl is overdue.
- Keyword gaps are counted from the latest search for each target role.
- A swipe keeps going when the browser refuses pointer capture.
