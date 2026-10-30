# Stream D → owner: Chrome extension

Requests for files stream D does not own.

## Navigation and links

- Link to `/settings#st-extension` or `/connect/extension` wherever the empty tracker state offers "Rozszerzenie Chrome" (copy key `nav.extension` stays in `copy-extension.ts`).

## Privacy export and policy (`src/server/privacy/**`, `/privacy`)

- §5.1 says the export includes tokens without hashes. `listApiTokens(userId)` from `src/server/auth/api-tokens.ts` returns exactly that shape.
- The privacy policy should describe what the extension sends. `extension/README.md`, section "Co wysyła", has the text to adapt. It also sends the URL of the open tab to the local app, for the "już aplikowano" badge, on known ATS hosts and, with the all-sites permission, on every https page.

## README and skill

- `README.md`: add the install steps from `extension/README.md` (Load unpacked, then `/connect/extension`).
- `.env.example`: nothing new. The extension uses `APP_ORIGIN` through `appOrigin()` only.

## Stream A: `urlKey` ignores the query string

Some pages identify the job only in the query, for example a company page with `?gh_jid=123`. `urlKey` gives both postings the same key, so a second application from that page becomes a "Wysłano ponownie" note on the first one instead of a new application. The extension handles the Greenhouse embed (`/embed/job_app?for=…&token=…`) itself through `normalizePostingUrl`, but not this general case. Changing it would also touch the SQL backfill, so that decision is yours.
