# Changelog

Every change people can notice, newest first. newrole.it has no tagged releases yet, so entries are grouped by the date they reached the main branch. The app shows this file at /changelog.

When you change something people can notice, add a line under Unreleased in the same pull request. Keep to the format below, because the page reads it: `##` for a date, `###` for a group, `-` for one line of plain text.

## Unreleased

### Changed

- newrole.it is now the CV app: your profile, My CV, Offers, Applications, Answers. The offer feed, saved offers, companies, sources, sync and coverage are gone from it, with the worker's crawling: the engine that finds offers on its own moved to the @newrole/ats and @newrole/job-index packages, for a separate deployment, and apps/jobs-lab tests it (npm run jobs-lab, npm run jobs-lab:smoke).
- Add offer reads the whole posting from its link (the employer's ATS or the page's structured data) and keeps it for you: each offer has its own page with its text, which you can edit, paste or read again, the CV and letter written for it, its application and a note. A page without structured data comes back with the text read from it, for you to check before it is added. Tailoring a CV or writing a letter reads that text first.
- Tailoring a CV or cover letter reads the offer's text from its page on any site, job boards such as justjoin.it included, so you no longer paste it by hand. From a job board or LinkedIn it is read when you tailor, kept in memory for 15 minutes and never stored. robots.txt, a site owner's opt-out, an AI opt-out on the page and login or bot walls still stop it; LinkedIn's robots.txt disallows every page, so a LinkedIn offer still needs its text pasted. The engine's crawler still never reads job boards or LinkedIn.
- My CV has two tabs: General, the CVs everything starts from, and For offers, the CVs and letters written for one offer, grouped by offer with the application's status.
- Links to /jobs/… open the offer under /offers.
- The extension's popup has Add this offer to newrole.it: the app reads the offer on the open tab and keeps its whole text, then its page opens; a page that needs checking opens Offers with the link filled in.
- Claude Code: offers_list, offer_add and offer_get replace the job search, feedback and company tools, and the hunt and review prompts.
- The repository is laid out as apps and packages: newrole.it in apps/newrole, the Chrome extension in apps/extension. npm run go, dev, build, start, worker and mcp still run from the root, and .env stays there.

### Removed

- newrole CV (apps/cv) and npm run export:cv: newrole.it itself is the CV app now.
- The setup step for the offer index, and the taste section of the profile (what you liked in offers of the feed).

### Added

- Saved has a CV ready tab: offers you tailored a CV or cover letter for and haven't applied to yet, liked or not. Each saved offer shows the CV and letter written for it; a ready one has Download PDF and Applied, a sent one links to its application. Tailoring adds no Like, so it doesn't change what your feed learns.
- Add offer under Offers: paste the link to an offer newrole.it doesn't have and it is read from the page (ATS, structured data, or the page text), checked by you and added, so you can tailor your CV and cover letter to it, save it or mark it as applied like any other offer. It shows as Added by you. LinkedIn links are refused; for a job board that is never read you enter the company and role and paste the offer's text when tailoring. A Google Careers link from your recommendations, which asks for a Google sign-in, is read from its public page instead.
- Tailoring a CV picks up to 15 keywords from the offer, in its own words, and works those your CV or profile backs into the bullets, skills and profile where they belong, once or twice each, never as a list. The Tailoring tab shows how many are in the CV, which you have but this version leaves out, and which your data doesn't show. A keyword the model added without backing is listed under Check before sending.
- An AI usage tab (/usage): every model run, per task, with its input, cache and output tokens and its cost at API prices, in dollars and złoty, for the last 24 hours, 7 days, 30 days or all time. With Claude Code the cost is the one it reports itself; on a Claude subscription that figure is not billed, it is what the same work would cost on the API. Runs that timed out are counted apart. The tab is there for every account on a local install and for admins elsewhere.
- The offer search takes tags: roles from a list in ten groups (Leadership, Software development, Technologies, Architecture, Data & AI, DevOps & cloud, Testing & QA, Security, Product & delivery, IT operations & support), titles from the offers in the index with how many there are, or free text, where every word has to be in the title or the employer's name. An offer is shown when it matches any of up to 12 tags, and each tag stays in the link. Words match whole, ignoring case and diacritics, so "cto" no longer finds "Director".
- With a country picked, the Where filter can hide remote roles tied to another country: a remote offer stored with another country (such as "Remote" with a company address in the US) is left out, and one open to a region that covers the country, such as EMEA, stays.
- The CV photo can be pasted (a screenshot or a copied image) and framed in a circle or a square, on the sheet and in the PDF.
- Applications has an Open sheet button once you saved a Google Sheet's link in Settings.
- npm run export:cv writes newrole CV as a repository of its own, with every package it needs, its own README, CI and commands, ready to push; run again in a clone of it, it brings in what changed and leaves local data alone. docs/publishing.md has the steps.
- newrole CV, a separate app in apps/cv: build your profile from a CV PDF, pasted text, LinkedIn's data export or your LinkedIn page read by Claude in your own Chrome, then paste a link to a job offer and get your CV tailored to it, with a cover letter, in the same A4 editor, with versions, the CV audit, a print view and PDF. It also makes a CV from the profile, keeps form details for the CV header and audits the profile. It runs on its own (npm run cv, port 43124), keeps everything in files rather than a database, reads offers with the same source policy and robots.txt rules as newrole.it, and keeps at most 300 characters of an offer on disk.
- The index holds IT offers only, and all of them: QA, developers, DevOps, data, security, product, design, IT project and program managers, analysts, IT support, directors and VPs. Offers outside IT, test posts and candidate pools are left out on every read.
- Every offer stores its countries and remote regions, from the ATS's own fields where it has them, then from the location text (with a GeoNames list of large cities). An offer that says nowhere it is is left out.
- BLOCKED_COUNTRIES: countries whose offers never enter the index. Russia and Belarus by default.
- An outside board catalog: npm run catalog imports freehire's board list as candidates and checks each board on its own platform (it exists, it is the company, it has placed IT offers) before it reaches the index, and again on every daily read.
- Offer cards show the date the employer posted an offer beside the day the index first saw it, and mark an offer posted over a year ago. Such an offer loses 10 points in the ranking.
- Salaries convert with NBP table A rates, read every 12 hours, for every currency NBP lists.
- Workday tenants are read from the career site's own job search, every posting instead of the first 100 in the sitemap, and freehire's list of 7,587 Workday tenants is imported as catalog candidates.
- Personio companies that turned their XML feed off are read from their career page's search, so their offers are no longer missed as "not found".
- npm run catalog -- discover finds boards in Common Crawl's URL index (Traffit, Workday, Teamtailor, Recruitee, Personio, BambooHR, Breezy, Pinpoint, Greenhouse, Lever, Ashby, Workable) and adds them as candidates; each is checked on its platform before it reaches the index.
- Offers a recruiter or job platform lists for an employer it does not name are marked: the card shows "Firma nieznana" and "Pośrednik: name", the offer page explains it, and Claude's tools say so.

- A Sync tab (/sync): whether the worker runs, what it reads now, what waits, what failed, every board's last and next read, the task queue, and the offers cloud agents brought in.
- Offers can be read while this computer is off: a scheduled Claude Code, Cursor or Codex task runs npm run harvest, which pushes the offers to a private git branch, and the worker brings them in when it runs again. /sync gives the prompt and the hosts to allow.
- Search in a country: the list shows offers there plus remote roles open to people there. Your profile's country is the default, or your browser's region before you have a profile. Pick another country in the Where filter, type it in the search ("w USA", "Germany"), or choose All countries. Claude's jobs_search and jobs_for_me take a country too.
- Offers are placed in a country from their location text in any country, including US, Canadian and Australian states, so many more of them show their country.
- A public changelog: CHANGELOG.md and the /changelog page, linked from the footer.
- The project is now licensed under AGPL-3.0, with a contributor licence agreement for pull requests.
- A /bot page that says what the crawler does and how a site can make it stop.
- OFFER_INDEX=off runs newrole.it without an index of offers, for a service run for other people.

### Changed

- My CV lists the documents for specific offers under their offer, with the step it is at (CV ready, Applied, Passed), a Probably closed mark and a link to the application.
- Offer cards say Open CV once a CV was tailored to the offer.
- Tailoring reads the whole text of a company's job page that has no structured data, from its main part without menus and footers, instead of using the excerpt in the index.
- Tailored CVs follow the content rules of the cv-resume skill (github.com/trfi/skills): a profile of 2 to 4 sentences with the offer's terms your data backs, bullets that start with an action verb, a role's number near the top, acronyms written out once, past tense for earlier roles.
- Tailored CVs, cover letters and drafted answers follow rules against text that reads as generated: Polish ones after the miodkuj skill, English ones after humanizer-zh. Both skills are in .claude/skills for Claude Code, and the apply prompt uses them.
- Sorting by Newest in For you orders the whole list by the earliest date an offer is known, the employer's posting date when it is before the day the index first saw it, instead of reordering only the page shown by that first day.
- The seniority, company site, listed salary, last 7 days and company filters run while the list is read, so every page of results fills up instead of coming back short.
- Clearing the filters clears your own country too, so the list shows every country instead of going straight back to yours. On a phone the sort sits in the filter row.
- An editable copy of an uploaded CV takes the language of the CV's text instead of the one stored with the upload, so an English CV gets English labels and consent clause. Reading it keeps a role's summary to two sentences and puts every further sentence in its own bullet, word for word, and a bullet that starts with a short project name and a colon shows the name in bold.
- The apply prompt and the newrole skill ask Claude for the same keyword and layout rules as tailoring in the app.
- The repository is a set of npm workspaces: the CV model, the CV writing and audit, the CV editor, the profile and its screens, the matching pack, the model clients, the design system and the polite reading of job postings are packages under packages/ (@newrole/cv-core, cv-engine, cv-editor, profile, profile-ui, matching, llm, ui, offers, app-kit) that newrole.it and newrole CV both use. The matching pack no longer needs its own npm install. Tailoring a CV, the editor, the profile and the pages look and work as before. docs/architecture.md has the map.
- The crawler waits 1 second between requests to one host instead of 5 (longer when robots.txt sets a Crawl-delay).
- Candidate pools and standing posts ("Talent Pipeline", "(Evergreen)", "Future Openings", "Open Applications", "Spontanansökan", "(Internal Only)") and freelance AI-training, data-annotation and data-collection gigs are left out, as are roles that only borrow an IT word (PLC programmer, marketing automation, account manager, landscape architect).
- ERP and CRM consultants (Dynamics 365, SAP, Salesforce, ServiceNow, NetSuite) count as IT even when the title names a finance module, and Polish titles such as "Ekspert ds. Cyberbezpieczeństwa" and "Analityk Biznesowo-Systemowy" are recognised.
- Electrical and hardware engineering are no longer IT offers. Design counts only for the web, UI/UX, apps, 3D and games; graphic, brand and industrial design are left out. A title that says only "Engineer" ("Project Engineer", "Senior Engineer") counts as IT only at a company whose offers are mostly IT.
- Query expansion and the neutral profile no longer assume a technology leader in Poland: any IT role, and the country the search names.

- The product is now called newrole.it, and the repository is github.com/newrole-it/CEO. The MCP server is now called newrole: if you added it as nowarola, run claude mcp remove nowarola -s user, then claude mcp add newrole -s user -- npm --prefix /path/to/newrole.it run --silent mcp (inside the repo, approve newrole once). NOWAROLA_USER_EMAIL still works; the new name is NEWROLE_USER_EMAIL. Reload the Chrome extension at chrome://extensions after npm run go rebuilds it. The crawler now sends NewRoleBot, and robots.txt rules for NowaRolaBot still apply.
- The interface opens in your browser's language: Polish for a Polish browser, English for any other. The switch in the header still overrides it.
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
- Company suggestions leave out companies you liked or applied to, and offices outside your profile's country. "Go" and "data" in ordinary phrases no longer count as skills.
- Company aliases removed from the list stop matching.
- iCIMS boards are linked, not fetched, because the vendor terms ban robots.
- The privacy policy lists every place your data goes to a language model or a search provider, and says the uploaded PDF is read in memory.
- "Why it fits" chips follow the interface language.

### Fixed

- The offer list in a country loads in milliseconds instead of seconds: the database keeps the offers in newest-first order, and the country filter reads the stored countries instead of matching dozens of place names in every offer's location text.
- Importing a CV or a pasted profile reads the expected salary: the minimum, the target, the currency and the contract. A yearly amount is saved as a monthly one, also when you confirm a draft that came in yearly.
- Workable and SmartRecruiters offers with an empty department, city or contract type are kept instead of skipped.
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
