"use client"

import Link from "next/link"
import { BriefcaseBusiness, FileText, Pencil } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { ButtonLink } from "@newrole/ui/Button"
import { Badge, EmptyState } from "@newrole/ui/primitives"
import { relativeTime } from "@newrole/ui/time"
import { statusLabel } from "src/shared/applications"
import type { OfferRow } from "src/server/offers/service"

/** The person's offers, newest first: what is ready for each and where its application stands. */
export function OfferList({ offers }: { offers: OfferRow[] }) {
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
                {offer.cvId ? <Badge tone="success">{t("of.cvReady")}</Badge> : null}
                {offer.letterId ? <Badge tone="success">{t("of.letterReady")}</Badge> : null}
                {offer.application ? (
                  <Badge tone="primary">{statusLabel(offer.application.status, locale)}</Badge>
                ) : null}
                {!offer.textChars ? <Badge tone="plain">{t("of.noText")}</Badge> : null}
                {offer.closed ? <Badge tone="warning">{t("of.closed")}</Badge> : null}
              </div>
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
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
