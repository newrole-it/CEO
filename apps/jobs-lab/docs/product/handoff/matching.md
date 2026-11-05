# Handoff: Dopasowanie (matching / preferences)

Changes needed in files I do not own. Everything below is optional for correctness of my files,
but needed for the product to use them everywhere.

## 1. `src/app/searches/queries/getSearch.ts` (UI)

Passes recorded outside a saved search (the /jobs feed, MCP) do not reach the search screen yet.
Replace the `rejected` query and `rejectionPenalty(...)` call with:

```ts
import { feedbackAdjustment, loadRejectedOffers } from "src/server/search/feedback"
import { buildPreferenceModel } from "src/server/preferences/model"

const [rejectedOffers, model] = await Promise.all([
  loadRejectedOffers(ctx.session.userId!),
  buildPreferenceModel(ctx.session.userId!),
])
// per row:
const feedback = feedbackAdjustment({
  offer: {
    id: row.jobId,
    title: row.job.title,
    description: row.job.descriptionText.slice(0, 8000),
    company: row.job.company.name,
    locationText: row.job.locationText,
    workplaceType: row.job.workplaceType,
    salaryMin: row.job.salaryMin,
    salaryMax: row.job.salaryMax,
    salaryCurrency: row.job.salaryCurrency,
    seniorityLevel: row.job.seniorityLevel,
  },
  rejected: rejectedOffers,
  model,
})
const delta = feedback.delta + affinity + (base - row.score) // instead of penalty + ...
```

`feedback.reasons` (already in the user's locale) can be shown next to the fit lines (♥ origin "feedback").

## 2. `src/server/auth/accounts.ts` → `claimGuest` (product owner)

markMatch now writes `OfferFeedback` for guests too. When a guest signs in, move their rows:

```ts
const rows = await db.offerFeedback.findMany({ where: { userId: guestId } })
for (const row of rows) {
  const taken = await db.offerFeedback.findUnique({
    where: { userId_jobId: { userId, jobId: row.jobId } },
  })
  if (!taken) await db.offerFeedback.update({ where: { id: row.id }, data: { userId } })
}
// same pattern for watchedCompany on (userId, companyId)
```

## 3. `src/shared/offer-view.ts` (unassigned)

`browse.ts` now returns `FeedOffer = OfferView & { sourceKind, provider, firstSeenAt, lastSeenAt, lastVerifiedAt }`.
If the UI wants these on every `OfferView`, move the fields into `OfferView` (no change needed in browse.ts).

## 4. `/jobs` page and feed (UI)

- "Dla Ciebie" tab: server `listForYou(filters & { page }, userId, locale)` from `src/server/jobs/browse`,
  or the RPC `src/app/feedback/queries/listForYou` for "Pokaż więcej" (`nextPage`).
- `listBestFits` still exists (top 4 of the same ranking, score ≥ 56).
- Offer drawer: `src/app/feedback/queries/getOfferDetail`.

## 5. Tests outside my folders

- `test/privacy.test.ts` (node:test, uses `jobscanner_test`): add an `OfferFeedback` and a `WatchedCompany`
  row for the user and assert export includes `offerFeedback` / `watchedCompanies` and erase removes them.
- `vitest.config.ts` already includes `src/server/**`; nothing to change.

## 6. MCP (Claude / MCP agent)

Use `recordFeedback({ ..., channel: "mcp" })`, `findSimilarOffers`, `getPreferenceSummary`,
`feedbackPrompt` directly from `src/server/preferences/*`. Guests are not a concept there.
