"use client"

import { useId } from "react"
import { Building2 } from "lucide-react"
import { ButtonLink } from "@newrole/ui/Button"
import { intlLocale, pluralKind } from "src/app/i18n/copy"
import { useCopy } from "src/app/i18n/Locale"
import type { CompanyBriefSummary } from "src/server/research/service"
import { companyBriefPath } from "./paths"
import "./company.css"

/**
 * The company brief in short, for the offer's page and the application drawer: when the brief
 * was written, how many of its sentences have a checked source, and the person's applications to
 * the company (src/server/research/service.ts companyBriefSummary). Without a summary (an offer
 * not in the index) it still links to the page, which shows what is there.
 */
export function CompanyBriefCard({
  jobId,
  summary,
}: {
  jobId: string
  summary: CompanyBriefSummary | null
}) {
  const { t, locale } = useCopy()
  const id = useId()
  const when = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" })
  const generatedAt = summary?.generatedAt ?? null
  return (
    <section className="card card--pad offer-section cr-card" aria-labelledby={`${id}-cr`}>
      <div className="offer-section__head">
        <h2 id={`${id}-cr`} className="t-h3">
          {t("cr.title")}
        </h2>
      </div>
      {summary && generatedAt ? (
        <>
          <p className="t-sm muted">{t("cr.card.when", { when: when.format(generatedAt) })}</p>
          <p className="t-sm">
            {t(`cr.card.points.${pluralKind(summary.points, locale)}`, { n: summary.points })}
          </p>
        </>
      ) : (
        <p className="t-sm muted">{t("cr.card.none")}</p>
      )}
      {summary && summary.applications > 0 ? (
        <p className="t-sm">
          {t(`cr.card.apps.${pluralKind(summary.applications, locale)}`, {
            n: summary.applications,
          })}
        </p>
      ) : null}
      <div>
        <ButtonLink
          href={companyBriefPath(jobId)}
          size="sm"
          variant={generatedAt ? "outline" : "primary"}
          icon={<Building2 />}
        >
          {t("cr.card.open")}
        </ButtonLink>
      </div>
    </section>
  )
}
