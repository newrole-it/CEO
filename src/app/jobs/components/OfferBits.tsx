import {
  BadgeCheck,
  Building2,
  Check,
  ExternalLink,
  Heart,
  House,
  Info,
  Link2,
  MapPin,
  Minus,
  Repeat,
  SquareTerminal,
} from "lucide-react"
import { intlLocale, type Locale, type T } from "src/app/i18n/copy"
import { Badge } from "@newrole/ui/primitives"
import type { CardOffer, FeedReason } from "../types"
import { freshness, payInfo, placeText, postedAge, shortDate } from "../format"

export function SourceBadge({
  offer,
  t,
}: {
  offer: Pick<CardOffer, "sourceKind" | "provider">
  t: T
}) {
  switch (offer.sourceKind) {
    case "company-site":
      return (
        <Badge tone="success" icon={<BadgeCheck aria-hidden />} tip={t("src.company.tip")}>
          {t("src.company")}
        </Badge>
      )
    case "ats":
      return (
        <Badge
          icon={<Link2 aria-hidden />}
          tip={t("src.ats.tip", { ats: offer.provider ?? "ATS" })}
        >
          {offer.provider ?? "ATS"}
        </Badge>
      )
    case "link-only":
      return (
        <Badge icon={<ExternalLink aria-hidden />} tip={t("src.link.tip")}>
          {t("src.link")}
        </Badge>
      )
    case "mcp":
      return <Badge icon={<SquareTerminal aria-hidden />}>{t("src.claude")}</Badge>
    default:
      return null
  }
}

/** An intermediary's offer names no employer, so the employer shows as unknown. */
export function CompanyName({
  offer,
  t,
}: {
  offer: Pick<CardOffer, "company" | "viaIntermediary">
  t: T
}) {
  if (!offer.viaIntermediary) return <strong>{offer.company}</strong>
  return <strong title={t("via.tip", { name: offer.company })}>{t("via.unknown")}</strong>
}

/** Who publishes an intermediary's offer, beside the source badge. */
export function IntermediaryBadge({
  offer,
  t,
}: {
  offer: Pick<CardOffer, "company" | "viaIntermediary">
  t: T
}) {
  if (!offer.viaIntermediary) return null
  return (
    <Badge tone="warning" className="badge--via" tip={t("via.tip", { name: offer.company })}>
      <span>{t("via.badge", { name: offer.company })}</span>
    </Badge>
  )
}

export function Freshness({
  iso,
  t,
  locale,
}: {
  iso: string | null | undefined
  t: T
  locale: Locale
}) {
  const info = freshness(iso, t, locale)
  if (!info) return null
  if (info.isNew)
    return (
      <span className="badge badge--new" title={info.title}>
        {info.label}
      </span>
    )
  return (
    <span className="t-caption subtle" title={info.title} style={{ whiteSpace: "nowrap" }}>
      {info.label}
    </span>
  )
}

/** The employer's posting date, beside the first time this index saw the offer. */
export function PostedAge({
  iso,
  firstSeenIso,
  t,
  locale,
}: {
  iso: string | null | undefined
  firstSeenIso: string | null | undefined
  t: T
  locale: Locale
}) {
  const age = postedAge(iso, t)
  if (!age) return null
  const date = new Date(iso as string).toLocaleDateString(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const seen = shortDate(firstSeenIso, locale) ?? "—"
  return (
    <span
      className={`t-caption ${age.stale ? "badge badge--warning" : "subtle"}`}
      title={t("card.postedTitle", { date, seen })}
      style={{ whiteSpace: "nowrap" }}
    >
      {age.label}
    </span>
  )
}

export function ModeFact({ mode, t }: { mode: CardOffer["workMode"]; t: T }) {
  if (mode === "remote")
    return (
      <span className="fact">
        <House aria-hidden /> {t("mode.remote")}
      </span>
    )
  if (mode === "hybrid")
    return (
      <span className="fact">
        <Repeat aria-hidden /> {t("mode.hybrid")}
      </span>
    )
  if (mode === "onsite")
    return (
      <span className="fact">
        <Building2 aria-hidden /> {t("mode.onsite")}
      </span>
    )
  return null
}

export function Facts({ offer, t, locale }: { offer: CardOffer; t: T; locale: Locale }) {
  const pay = payInfo(offer, t)
  return (
    <p className="facts">
      <span className={`fact fact--pay${pay.none ? " is-none" : ""}`} title={pay.tip ?? undefined}>
        {pay.text}
        {offer.payFromOther && offer.paySourceUrl ? (
          <a
            className="fact__info"
            href={offer.paySourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={t("pay.other")}
            data-tip={t("pay.other")}
            onClick={(event) => event.stopPropagation()}
          >
            <Info aria-hidden />
          </a>
        ) : null}
      </span>
      <ModeFact mode={offer.workMode} t={t} />
      {offer.city || offer.inPoland != null ? (
        <span className="fact">
          <MapPin aria-hidden /> {placeText(offer, t, locale)}
        </span>
      ) : null}
    </p>
  )
}

export function Reasons({ reasons, max = 3 }: { reasons: FeedReason[]; max?: number }) {
  const shown = reasons.slice(0, max)
  if (!shown.length) return null
  return (
    <ul className="reasons">
      {shown.map((reason, index) => {
        const taste = reason.origin === "feedback" && reason.kind === "ok"
        const neutral = reason.kind !== "ok"
        return (
          <li
            key={`${index}-${reason.text}`}
            className={`reason${neutral ? " reason--neutral" : ""}${taste ? " reason--taste" : ""}`}
          >
            {taste ? (
              <Heart aria-hidden />
            ) : neutral ? (
              <Minus aria-hidden />
            ) : (
              <Check aria-hidden />
            )}
            <span title={reason.text}>{reason.text}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Positive reasons first, then a single neutral one; feedback reasons lead within each group. */
export function orderReasons(reasons: FeedReason[] | undefined): FeedReason[] {
  if (!reasons?.length) return []
  const ok = reasons.filter((reason) => reason.kind === "ok")
  const warn = reasons.filter((reason) => reason.kind !== "ok")
  const sorted = [
    ...ok.filter((reason) => reason.origin === "feedback"),
    ...ok.filter((reason) => reason.origin !== "feedback"),
  ]
  return [...sorted.slice(0, warn.length ? 2 : 3), ...warn.slice(0, 1)]
}
