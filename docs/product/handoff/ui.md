# UI → others

Changes the UI agent needs in files it does not own, plus cleanup it could not do itself. Path, what, why.

## Done (thanks)

- ~~Guests in the feedback RPC~~: `saveFeedback` now creates a guest session, all feedback RPCs accept GUEST. The UI calls them directly; no local queue.

## Owner / integration

1. ~~Delete the dead files~~: done. Every file this item listed, plus `src/lib/utils.ts` and `src/app/searches/queries/listLibrary.ts`, is deleted.
2. **`src/app/(auth)/mutations/requestMagicLink.ts:51`** fails `tsc`: `clientIp(ctx.session)` no longer matches the `clientIp` signature in `src/server/auth/*`. Not a UI change; runtime is unaffected as far as the UI can tell.
3. **Fixed a real bug in UI code**: `/login/verify` imported `../mutations/consumeLoginToken` (wrong path), so magic links could not be consumed. Now `../../mutations/consumeLoginToken`.
4. `/start?step=profile&via=linkedin` (LinkedIn callback for a first sign-in) is handled as the "LinkedIn next" step (§2.6 A). The UI's LinkedIn buttons use `returnTo=/start?step=linkedin-next`. First name and photo come from `User.name` / `User.imageUrl`.

## Matching

5. **`companyId` on `FeedOffer`** (`src/server/jobs/browse.ts`): the drawer's "Obserwuj firmę" and `/companies?focus=` need it. UI fallback: `src/app/companies/queries/getCompanyForJob.ts` (one query per opened offer) and an extra `db.job.findMany` per feed page in `src/app/jobs/feed-data.ts`.
6. **Seniority / source / fresh filters** are applied after `listForYou` / `listOfferPage` in `src/app/jobs/feed-data.ts`, so a page can come back shorter than 24. Moving `seniority`, `source=company`, `payonly`, `fresh`, `company` into `BrowseInput` + `listWhere` would make paging exact. `sort=new` on For you only re-sorts the current page.
7. Prompt tags sometimes start with punctuation (seen: "/ Node.js Backend Developer" from the title "Senior/Mid Node.js Backend Developer").
8. `TasteItem` has `jobIds` but no titles, so the "Skąd to wiemy" popover shows the count only, not the list of offers (§4.5).

## Discovery

9. `companySuggestions()` reasons are English only ("hires for ai, data, platform like GFT"). The UI shows them as-is; a `{ pl, en }` reason (or a `locale` argument) would let it follow the language switch. Spec copy: "Jak {company}: {aspects}".
10. **"New since last visit"**: the UI stores the visit time in the `nr-co-seen` cookie (set when `/companies` opens) and passes it as `since` to `listWatched`. A `User.companiesSeenAt` column would make it work across devices.
11. `watchCompany` returns `status: "watching"` both for "you already watch this" and "already in the index, now watched". The UI tells them apart by checking its own list; a distinct status (e.g. `"indexed"`) would be cleaner.
