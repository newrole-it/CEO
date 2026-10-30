import type { FeedOffer as ServerFeedOffer } from "src/server/jobs/browse"
import type { FeedReason } from "src/server/preferences/feed"
import type { SourceKind } from "src/server/preferences/breakdown"

export type { FeedReason, SourceKind }

/**
 * What a card renders. All offers carry source + freshness; scored ones (For you, similar,
 * drawer) add score and reasons.
 */
export type CardOffer = ServerFeedOffer & {
  score?: number | null
  reasons?: FeedReason[]
  preferenceDelta?: number
}

export type Verdict = "LIKE" | "DISLIKE" | "APPLIED"

export type FeedTab = "foryou" | "all"
