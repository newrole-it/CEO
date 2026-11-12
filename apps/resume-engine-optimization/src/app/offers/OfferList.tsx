"use client"

import Link from "next/link"
import { BriefcaseBusiness, FileText, Gauge, Pencil, Send } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Badge, EmptyState } from "@newrole/ui/primitives"
import { relativeTime } from "@newrole/ui/time"
import { statusLabel } from "src/shared/applications"
import type { OfferRow } from "src/server/offers/service"

const HIRING_TONE = { high: "success", medium: "plain", low: "warning" } as const

/**
 * The person's offers, newest first: what is ready for each and where its application stands.
 * Applications → "Do wysłania" shows the ones not applied to yet; `onApplied` adds "Aplikowano"
 * to each, which turns the offer into an application.
 */
export function OfferList({
  offers,
  applying = null,
  onApplied,
}: {
  offers: OfferRow[]
  /** The offer whose "Aplikowano" is being saved */
  applying?: string | null
  onApplied?: (offer: OfferRow) => void
}) {
  const { t, locale } = useCopy()
  if (!offers.length) {
    return (
      <EmptyState
        icon={<BriefcaseBusiness />}
        title={t("of.empty.title")}
        body={t("of.empty.body")}
      />
    )
  }
  return (
    <section className="stack" aria-label={t("of.listLabel")}>
      <p className="t-sm muted">{t("of.count", { n: offers.length })}</p>
      <ul className="offer-list" role="list">
        {offers.map((offer) => (
          <li key={offer.jobId} className="card offer-item">
            <div className="stack-sm">
              <Link className="offer-item__title" href={`/offers/${offer.jobId}`}>
                {offer.title}
              </Link>
              <div className="offer-item__meta">
                <span>{offer.company}</span>
                {offer.location ? <span>{offer.location}</span> : null}
                <span>{t("of.added", { when: relativeTime(offer.addedAt, t) ?? "" })}</span>
              </div>
              <div className="row">
                {offer.cvId ? (
                  <Badge tone="success">{t("of.cvReady")}</Badge>
                ) : !offer.application ? (
                  <Badge tone="plain">{t("of.saved")}</Badge>
                ) : null}
                {offer.letterId ? <Badge tone="success">{t("of.letterReady")}</Badge> : null}
                {offer.application ? (
                  <Badge tone="primary">{statusLabel(offer.application.status, locale)}</Badge>
                ) : null}
                {!offer.textChars ? <Badge tone="plain">{t("of.noText")}</Badge> : null}
                {offer.closed ? <Badge tone="warning">{t("of.closed")}</Badge> : null}
                {offer.hiring ? (
                  <Badge
                    tone={HIRING_TONE[offer.hiring.level]}
                    tip={t(`hc.badge.tip.${offer.hiring.level}`)}
                  >
                    {t("hc.badge", { n: offer.hiring.score })}
                  </Badge>
                ) : null}
              </div>
              {offer.cvId ? (
                <Link className="link offer-item__match" href={`/offers/${offer.jobId}/match`}>
                  <Gauge aria-hidden size={14} />
                  {offer.match?.score != null
                    ? t("mt.link.score", { n: offer.match.score })
                    : t(offer.match ? "mt.link.none" : "mt.link.check")}
                </Link>
              ) : null}
            </div>
            <div className="offer-item__actions">
              <ButtonLink
                href={`/offers/${offer.jobId}`}
                size="sm"
                variant="outline"
                icon={<Pencil />}
              >
                {t("of.open")}
              </ButtonLink>
              <ButtonLink
                href={offer.cvId ? `/cv/${offer.cvId}` : `/offers/${offer.jobId}/cv`}
                size="sm"
                variant={offer.cvId ? "outline" : "primary"}
                icon={<FileText />}
              >
                {offer.cvId ? t("of.openCv") : t("of.tailor")}
              </ButtonLink>
              {onApplied && !offer.application ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Send />}
                  loading={applying === offer.jobId}
                  onClick={() => onApplied(offer)}
                >
                  {t("of.markApplied")}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
