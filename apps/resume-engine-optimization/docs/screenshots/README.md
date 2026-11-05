# Screenshots

Screenshots for the root README and the docs. The older ones below come from a local install signed in as a temporary demo account with a fictional profile, light theme, 1440×900 at 2× (desktop) and 390×844 at 2× (phone). Offers and companies are real public postings from the local index.

| File | Page |
|---|---|
| `reo-offers.png` | `/offers` — First steps at step 3 of 4, above Add an offer by its link (English UI) |
| `reo-editor-help.png` | `/cv/[id]` — the CV editor with How to edit open (English UI) |
| `reo-features.png` | `/features#extension` — what each button and switch of the Chrome extension does (English UI) |

The three `reo-*.png` files are the ones the root README shows. They come from a fresh clone (`npm run go`) with a fictional profile (Anna Przykładowa) and a fictional offer on example.com, 1440×900 at 2×, light theme, without the Next.js dev badge.

The files below come from before newrole.it became the CV app, and the root README does not use them. Some show the feed, saved offers, companies and sources, which newrole.it no longer has.

| File | Page |
|---|---|
| `demo.webp`, `demo.mp4` | The 13-second tour at the top of the root README: the animated WebP is shown inline and links to the MP4 |
| `feed.png` | `/jobs?where=pl` — "Dla Ciebie", ranked offers with the match score and reasons |
| `offer.png` | `/jobs/[id]` — one offer with the score breakdown |
| `applications.png` | `/applications` — the tracker |
| `answers.png` | `/answers` — the answer bank |
| `profile.png` | `/profile` — the matching profile |
| `companies.png` | `/companies` — watched career pages |
| `sources.png` | `/sources` — where offers come from and the policy per platform |
| `settings.png` | `/settings` — account, extension, Google Sheet, Gmail |
| `mobile-feed.png`, `mobile-applications.png` | the same on a phone |

To retake them, create a demo account in a headless Chrome and capture each page; keep the Next.js dev badge (`nextjs-portal`) out of the frame. Delete the account afterwards: a second regular account changes which account the MCP server acts for unless `NEWROLE_USER_EMAIL` is set.
