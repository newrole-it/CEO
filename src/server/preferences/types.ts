import type { FeedbackAspect, FeedbackVerdict } from "src/shared/feedback-aspects"
import type { OfferWorkMode } from "src/shared/offer-view"

export type { FeedbackAspect, FeedbackVerdict }

/**
 * Reason text in both languages. Convention for this module:
 * every `reasons: string[]` is already in the viewer's locale (model.locale, default "pl"),
 * and the parallel `reasonsI18n: Bilingual[]` carries both versions in the same order,
 * so a UI that switches language without refetching can still use them.
 */
export type Bilingual = { pl: string; en: string }

export type Locale = "pl" | "en"

export type FeedbackChannel = "web" | "mcp"

export type OfferFeedbackView = {
  id: string
  jobId: string
  verdict: FeedbackVerdict
  aspects: FeedbackAspect[]
  tags: string[]
  /** Signal keys the person removed from "what you like" (see dropSignal). Not shown as chips. */
  muted: string[]
  note: string | null
  channel: FeedbackChannel
  createdAt: Date
  updatedAt: Date
  job: { title: string; company: string; url: string; status: string } | null
}

/** A similar (or re-ranked) offer. `score` is 0–100. */
export type RankedOffer = {
  id: string
  title: string
  company: string
  location: string | null
  workplace: OfferWorkMode
  salary: string | null
  url: string
  score: number
  reasons: string[]
  reasonsI18n: Bilingual[]
}

/** Everything the model and the similarity scorer need to know about an offer. */
export type OfferForScoring = {
  id?: string
  title: string
  description?: string | null
  company: string
  companyIndustry?: string | null
  locationText?: string | null
  countryCode?: string | null
  workplaceType?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: string | null
  seniorityLevel?: string | null
  employmentType?: string | null
}

/**
 * One learned signal, keyed by a fact key such as "skill:kotlin", "work:remote",
 * "industry:fintech", "company:allegro", "level:senior", "salary:25" or "text:<phrase>".
 * `strength` is in (-1, 1): positive = liked, negative = passed on.
 */
export type PreferenceSignal = {
  key: string
  aspect: FeedbackAspect
  label: Bilingual
  strength: number
  likes: number
  dislikes: number
  /** "feedback" signals drive the score; "profile" ones only help similarity and the summary. */
  source: "feedback" | "profile"
  /** Up to three offers that taught the signal. */
  from: { jobId: string; title: string; verdict: FeedbackVerdict }[]
  /** Offers that taught it, by verdict sign (newest first, at most 50 each). */
  likedJobIds: string[]
  dislikedJobIds: string[]
}

/** One row of "Twój gust": a learned tag with its sign and the offers behind it. */
export type TasteItem = {
  key: string
  aspect: FeedbackAspect
  tag: string
  tagI18n: Bilingual
  sign: 1 | -1
  /** Offers that taught it with this sign. */
  count: number
  jobIds: string[]
  strength: number
  source: "feedback" | "profile"
  /** Feedback signals can be muted (muteSignal); profile ones are edited on the profile. */
  removable: boolean
}

/** A liked or disliked title, used for "similar to the one you liked". */
export type TitleSignal = {
  jobId: string
  title: string
  tokens: string[]
  weight: number
}

export type PreferenceModel = {
  userId: number
  locale: Locale
  builtAt: Date
  liked: number
  disliked: number
  /** Net weight per aspect in (-1, 1): how much the person cares about remote, stack, ... */
  aspects: Record<FeedbackAspect, number>
  signals: PreferenceSignal[]
  likedTitles: TitleSignal[]
  dislikedTitles: TitleSignal[]
  /** Job ids that already have a verdict; feeds skip them. */
  decided: Set<string>
}

export type PreferenceAdjustment = {
  delta: number
  reasons: string[]
  reasonsI18n: Bilingual[]
  /** Parallel to reasons: 1 = pulled up by likes, -1 = pushed down by passes. */
  signs: (1 | -1)[]
}

export type PromptSuggestion = {
  aspect: FeedbackAspect
  tags: string[]
  preselected: boolean
}

export type FeedbackPrompt = {
  jobId: string
  suggestions: PromptSuggestion[]
  /** Saved feedback for this offer, if the person already answered. */
  existing: OfferFeedbackView | null
}
