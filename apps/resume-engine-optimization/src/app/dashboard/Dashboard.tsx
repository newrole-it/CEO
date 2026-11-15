import type { ReactNode } from "react"
import Link from "next/link"
import { ClipboardList, FileText, Star } from "lucide-react"
import { ButtonLink } from "@newrole/ui/Button"
import { intlLocale, type Locale } from "@newrole/ui/i18n"
import { Badge, EmptyState } from "@newrole/ui/primitives"
import { relativeTime } from "@newrole/ui/time"
import { numberFormat, translator } from "src/app/i18n/copy"
import type { CvView } from "src/server/cv/service"
import type { OfferRow } from "src/server/offers/service"
import { statusLabel, statusTone } from "src/shared/applications"
import type { replyNumbers } from "./reply-numbers"

/** How many CVs for offers the dashboard lists; the rest are a click away on My CV. */
export const DASHBOARD_OFFER_CVS = 8

/**
 * The home page of a person with a profile: how the applications are going, their general CVs
 * and the newest CVs for offers. `gather` is "Zbierz wszystko do CV ogólnego" (./GatherCv.tsx).
 */
export function Dashboard({
  locale,
  cvs,
  offers,
  replies,
  gather,
}: {
  locale: Locale
  cvs: CvView[]
  offers: OfferRow[]
  replies: ReturnType<typeof replyNumbers>
  gather: ReactNode
}) {
  const t = translator(locale)
  const nf = numberFormat(locale)
  const percent = new Intl.NumberFormat(intlLocale(locale), { style: "percent" })
  const when = (at: Date) => relativeTime(at, t) ?? ""
  const general = cvs.filter((cv) => !cv.target)
  const tailored = cvs
    .filter((cv) => cv.target)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  const statusOf = new Map(offers.map((offer) => [offer.jobId, offer.application?.status ?? null]))

  return (
    <div className="dash">
      <header className="page-head">
        <h1 className="t-h1">{t("dash.title")}</h1>
        <p>{t("dash.sub")}</p>
      </header>

      <section className="dash__block" aria-labelledby="dash-replies">
        <div className="dash__head">
          <h2 className="t-h3" id="dash-replies">
            {t("dash.replies.title")}
          </h2>
          {replies.sent ? (
            <Link className="link t-sm" href="/applications/stats?w=all">
              {t("dash.replies.all")}
            </Link>
          ) : null}
        </div>
        {replies.sent ? (
          <dl className="stx-kpis dash__kpis">
            <div className="card stx-kpi">
              <dt>{t("dash.replies.sent")}</dt>
              <dd>{nf.format(replies.sent)}</dd>
            </div>
            <div className="card stx-kpi">
              <dt>{t("dash.replies.replied")}</dt>
              <dd>{nf.format(replies.replied)}</dd>
              <span className="stx-kpi__sub">
                {t("dash.replies.share", { pct: percent.format(replies.replied / replies.sent) })}
              </span>
            </div>
            <div className="card stx-kpi">
              <dt>{t("dash.replies.interviews")}</dt>
              <dd>{nf.format(replies.interviews)}</dd>
            </div>
            <div className="card stx-kpi">
              <dt>{t("dash.replies.offers")}</dt>
              <dd>{nf.format(replies.offers)}</dd>
            </div>
          </dl>
        ) : (
          <EmptyState
            icon={<ClipboardList />}
            title={t("dash.replies.empty.title")}
            body={t("dash.replies.empty.body")}
          >
            <ButtonLink href="/applications" variant="secondary">
              {t("dash.replies.empty.action")}
            </ButtonLink>
          </EmptyState>
        )}
      </section>

      <section className="dash__block" aria-labelledby="dash-general">
        <div className="dash__head">
          <h2 className="t-h3" id="dash-general">
            {t("dash.general.title")}
          </h2>
          <div className="dash__actions">
            {gather}
            <Link className="link t-sm" href="/cv">
              {t("dash.general.all")}
            </Link>
          </div>
        </div>
        {general.length ? (
          <ul className="card cvl-list" role="list">
            {general.map((cv) => (
              <li key={cv.id} className="cvl-row">
                <span
                  className={cv.hasContent ? "cvl-row__icon" : "cvl-row__icon cvl-row__icon--pdf"}
                  aria-hidden
                >
                  <FileText />
                </span>
                <div className="cvl-row__main">
                  <span className="cvl-row__name">
                    <Link className="cvl-row__title" href={`/cv/${cv.id}`}>
                      {cv.title}
                    </Link>
                    {cv.isDefault ? (
                      <Badge tone="primary" icon={<Star fill="currentColor" />}>
                        {t("cv.default")}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="cvl-row__meta">
                    {cv.hasContent
                      ? t("dash.general.meta", {
                          language: t(`cv.lang.${cv.language}`),
                          when: when(cv.updatedAt),
                        })
                      : t("dash.general.pdf", { when: when(cv.updatedAt) })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<FileText />}
            title={t("dash.general.empty.title")}
            body={t("dash.general.empty.body")}
          >
            <ButtonLink href="/cv" variant="primary">
              {t("dash.general.empty.action")}
            </ButtonLink>
          </EmptyState>
        )}
      </section>

      <section className="dash__block" aria-labelledby="dash-offers">
        <div className="dash__head">
          <h2 className="t-h3" id="dash-offers">
            {t("dash.offers.title")}
          </h2>
          {tailored.length > DASHBOARD_OFFER_CVS ? (
            <Link className="link t-sm" href="/cv?tab=offers">
              {t("dash.offers.all", { n: nf.format(tailored.length) })}
            </Link>
          ) : null}
        </div>
        {tailored.length ? (
          <ul className="card cvl-list" role="list">
            {tailored.slice(0, DASHBOARD_OFFER_CVS).map((cv) => {
              const status = cv.target?.jobId ? (statusOf.get(cv.target.jobId) ?? null) : null
              return (
                <li key={cv.id} className="cvl-row">
                  <span className="cvl-row__icon" aria-hidden>
                    <FileText />
                  </span>
                  <div className="cvl-row__main">
                    <Link className="cvl-row__title" href={`/cv/${cv.id}`}>
                      {cv.target?.company}
                    </Link>
                    <span className="cvl-row__meta">
                      {t("dash.offers.meta", {
                        role: cv.target?.title || cv.title,
                        when: when(cv.updatedAt),
                      })}
                    </span>
                  </div>
                  <span className="status-pill" data-tone={status ? statusTone(status) : "muted"}>
                    {status ? statusLabel(status, locale) : t("dash.offers.notSent")}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted">{t("dash.offers.empty")}</p>
        )}
      </section>
    </div>
  )
}
