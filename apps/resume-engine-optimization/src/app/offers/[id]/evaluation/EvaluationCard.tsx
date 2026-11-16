"use client"

import { useId } from "react"
import { Gauge } from "lucide-react"
import { ButtonLink } from "@newrole/ui/Button"
import { Badge } from "@newrole/ui/primitives"
import { intlLocale } from "src/app/i18n/copy"
import { useCopy } from "src/app/i18n/Locale"
import type { EvaluationSummary } from "src/server/evaluation/service"
import { DECISION_KEY, DECISION_TONE, evaluationPath } from "./decision"
import "./evaluation.css"

/**
 * "Is it worth applying" in short, for the offer's page: the decision, the score and the way to
 * the whole evaluation (src/server/evaluation/service.ts evaluationSummary). Without an evaluation
 * it invites the person to make one.
 */
export function EvaluationCard({
  jobId,
  summary,
}: {
  jobId: string
  summary: EvaluationSummary | null
}) {
  const { t, locale } = useCopy()
  const id = useId()
  const when = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" })
  return (
    <section className="card card--pad offer-section ev-card" aria-labelledby={`${id}-ev`}>
      <div className="offer-section__head">
        <h2 id={`${id}-ev`} className="t-h3">
          {t("ev.title")}
        </h2>
        {summary?.score != null ? (
          <Badge tone={DECISION_TONE[summary.decision]}>
            {t("ev.score.value", { n: summary.score })}
          </Badge>
        ) : null}
      </div>
      {summary ? (
        <>
          <p className="ev-card__decision">{t(DECISION_KEY[summary.decision])}</p>
          <p className="t-sm muted">
            {t("ev.card.when", { when: when.format(summary.evaluatedAt) })}
          </p>
          {summary.stale ? <p className="t-sm">{t("ev.card.stale")}</p> : null}
        </>
      ) : (
        <p className="t-sm muted">{t("ev.card.none")}</p>
      )}
      <div>
        <ButtonLink
          href={evaluationPath(jobId)}
          size="sm"
          variant={summary ? "outline" : "primary"}
          icon={<Gauge />}
        >
          {t(summary ? "ev.card.open" : "ev.run")}
        </ButtonLink>
      </div>
    </section>
  )
}
