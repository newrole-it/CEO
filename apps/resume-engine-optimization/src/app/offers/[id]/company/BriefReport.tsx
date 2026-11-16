import Link from "next/link"
import { CircleAlert, ExternalLink, FileText, Globe, Info, UserRound } from "lucide-react"
import { Badge, Banner, EmptyState } from "@newrole/ui/primitives"
import { relativeTime } from "@newrole/ui/time"
import type { BriefAxis, BriefPoint, CompanyBriefResult } from "@newrole/cv-core/research"
import { BRIEF_AXES } from "@newrole/cv-core/research"
import { intlLocale, pluralKind, type Locale, type T } from "src/app/i18n/copy"
import type { CompanyBriefView, CompanyRecords, RecordQuestion } from "src/server/research/service"
import { statusLabel } from "src/shared/applications"
import { HiringConfidenceCard } from "../../HiringConfidenceCard"
import { RunBrief } from "./RunBrief"

/**
 * The company brief page's body: the records read from the database now, then the stored brief
 * with the source of every point, the candidate's angle, the questions worth asking, and what was
 * dropped or could not be read. A server component; only the run button is a client one.
 */
export function BriefReport({
  t,
  locale,
  view,
  now,
}: {
  t: T
  locale: Locale
  view: CompanyBriefView
  now: Date
}) {
  const { brief, model } = view
  return (
    <>
      <Records t={t} locale={locale} records={view.records} />
      <section className="card card--pad stack-sm" aria-labelledby="cr-brief">
        <div className="offer-section__head">
          <h2 id="cr-brief" className="t-h2">
            {t("cr.brief.title")}
          </h2>
        </div>
        {model.available ? null : <Banner tone="info">{t("cr.noModel")}</Banner>}
        {brief ? (
          <BriefMeta t={t} locale={locale} brief={brief} now={now} />
        ) : model.available ? (
          <EmptyState icon={<FileText />} title={t("cr.none.title")} body={t("cr.none.body")} />
        ) : null}
        {model.available ? (
          <RunBrief
            jobId={view.jobId}
            again={brief !== null}
            web={model.web}
            searchCap={model.searchCap}
          />
        ) : null}
        <p className="t-sm muted">{t("cr.how")}</p>
        {brief ? <Points t={t} locale={locale} result={brief.result} /> : null}
      </section>
      {brief ? <Angle t={t} result={brief.result} /> : null}
      <Questions
        t={t}
        unknown={view.unknown}
        recordQuestions={view.recordQuestions}
        result={brief?.result ?? null}
      />
      {brief ? <Dropped t={t} locale={locale} result={brief.result} /> : null}
      <p className="t-sm muted">{t("cr.limits")}</p>
    </>
  )
}

function Records({ t, locale, records }: { t: T; locale: Locale; records: CompanyRecords }) {
  const date = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" })
  const { company, openPostings, applications, offers } = records
  const more = openPostings.total - openPostings.items.length
  return (
    <>
      <section className="card card--pad stack-sm" aria-labelledby="cr-rec">
        <div className="page-head">
          <h2 id="cr-rec" className="t-h2">
            {t("cr.rec.title")}
          </h2>
          <p className="t-sm muted">{t("cr.rec.sub")}</p>
        </div>
        <dl className="cr-facts">
          <dt>{t("cr.rec.domain")}</dt>
          <dd>
            {company.domain ? (
              <a
                className="link"
                href={`https://${company.domain}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {company.domain}
              </a>
            ) : (
              <span className="muted">{t("cr.rec.domain.none")}</span>
            )}
          </dd>
          {company.careerPages.length ? (
            <>
              <dt>{t("cr.rec.career")}</dt>
              <dd className="cr-list">
                {company.careerPages.map((url) => (
                  <a
                    key={url}
                    className="link"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {url}
                  </a>
                ))}
              </dd>
            </>
          ) : null}
          {company.aliases.length ? (
            <>
              <dt>{t("cr.rec.aliases")}</dt>
              <dd>{company.aliases.join(" · ")}</dd>
            </>
          ) : null}
        </dl>

        <h3 className="t-h3">{t("cr.rec.open.title")}</h3>
        {openPostings.total ? (
          <>
            <p className="t-sm muted">
              {t(`cr.rec.open.count.${pluralKind(openPostings.total, locale)}`, {
                n: openPostings.total,
              })}
            </p>
            <ul className="cr-rows">
              {openPostings.items.map((item) => (
                <li key={item.jobId}>
                  <Link className="link" href={`/offers/${encodeURIComponent(item.jobId)}`}>
                    {item.title}
                  </Link>
                  <span className="cr-row__meta t-sm muted">
                    {item.location ? <span>{item.location}</span> : null}
                    <span>{date.format(item.since)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {more > 0 ? (
              <p className="t-sm muted">
                {t(`cr.rec.open.more.${pluralKind(more, locale)}`, { n: more })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="t-sm muted">{t("cr.rec.open.none")}</p>
        )}

        <h3 className="t-h3">{t("cr.rec.history.title")}</h3>
        {applications.length ? (
          <ul className="cr-rows">
            {applications.map((row) => (
              <li key={row.id}>
                <span>
                  <strong>{row.title}</strong>{" "}
                  {row.thisOffer ? <Badge tone="primary">{t("cr.rec.app.this")}</Badge> : null}
                </span>
                <span className="cr-row__meta t-sm muted">
                  <span>{t("cr.rec.app.when", { date: date.format(row.appliedAt) })}</span>
                  <Badge tone="plain">{statusLabel(row.status, locale)}</Badge>
                </span>
                {row.closedAtStage ? (
                  <span className="t-sm muted">
                    {t("cr.rec.app.closedAt", { stage: statusLabel(row.closedAtStage, locale) })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-sm muted">{t("cr.rec.apps.none")}</p>
        )}
        {offers.length ? (
          <>
            <h3 className="t-h3">{t("cr.rec.offers.title")}</h3>
            <ul className="cr-rows">
              {offers.map((row) => (
                <li key={row.jobId}>
                  <Link className="link" href={`/offers/${encodeURIComponent(row.jobId)}`}>
                    {row.title}
                  </Link>
                  <span className="t-sm muted">
                    {t("cr.rec.offer.when", { date: date.format(row.addedAt) })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
      {records.hiring ? (
        <HiringConfidenceCard hiring={records.hiring} />
      ) : (
        <p className="t-sm muted">{t("cr.rec.hiring.closed")}</p>
      )}
    </>
  )
}

function BriefMeta({
  t,
  locale,
  brief,
  now,
}: {
  t: T
  locale: Locale
  brief: NonNullable<CompanyBriefView["brief"]>
  now: Date
}) {
  const date = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(brief.generatedAt)
  const age = relativeTime(brief.generatedAt, t, now.getTime()) ?? ""
  const { result } = brief
  return (
    <div className="stack-sm">
      <p className="t-sm">{t("cr.meta.when", { date, age })}</p>
      {brief.otherOffer ? (
        <Banner tone="warning" icon={<Info />}>
          {brief.from
            ? t("cr.meta.otherOffer", { title: brief.from.title })
            : t("cr.meta.otherOffer.gone")}
        </Banner>
      ) : null}
      {brief.stale ? <Banner tone="warning">{t("cr.stale")}</Banner> : null}
      {result.offer !== "done" ? (
        <Banner tone="warning" icon={<CircleAlert />}>
          {t(`cr.offer.state.${result.offer}`)}
        </Banner>
      ) : null}
      <p className="t-sm muted">
        {result.web.state === "done"
          ? t("cr.web.state.done", {
              n: result.web.searches ?? 0,
              cap: result.web.searchCap,
            })
          : t(`cr.web.state.${result.web.state}`)}
      </p>
    </div>
  )
}

function Source({ t, locale, point }: { t: T; locale: Locale; point: BriefPoint }) {
  const { source } = point
  if (source.kind === "offer")
    return (
      <div className="cr-src">
        <span className="cr-src__label">
          <FileText aria-hidden size={14} /> {t("cr.src.offer")}
        </span>
        <blockquote className="cr-quote">{source.quote}</blockquote>
      </div>
    )
  const checked = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(
    new Date(source.checkedAt)
  )
  return (
    <div className="cr-src">
      <span className="cr-src__label">
        <Globe aria-hidden size={14} />{" "}
        <a className="link" href={source.url} target="_blank" rel="noopener noreferrer">
          {t("cr.src.web", { host: source.host })} <ExternalLink aria-hidden size={12} />
        </a>
        {source.own ? <Badge tone="plain">{t("cr.src.own")}</Badge> : null}
      </span>
      <blockquote className="cr-quote">{source.quote}</blockquote>
      <span className="t-sm muted">{t("cr.src.web.checked", { date: checked })}</span>
    </div>
  )
}

function Points({ t, locale, result }: { t: T; locale: Locale; result: CompanyBriefResult }) {
  return (
    <div className="cr-axes">
      {BRIEF_AXES.map((axis) => {
        const points = result.points.filter((point) => point.axis === axis)
        return (
          <section key={axis} className="cr-axis" data-known={points.length > 0}>
            <h3 className="t-h3">{t(`cr.axis.${axis}`)}</h3>
            {points.length ? (
              <ul className="cr-points">
                {points.map((point, index) => (
                  <li key={index}>
                    <p>{point.text}</p>
                    <Source t={t} locale={locale} point={point} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-sm muted">{t("cr.axis.none")}</p>
            )}
          </section>
        )
      })}
    </div>
  )
}

function Angle({ t, result }: { t: T; result: CompanyBriefResult }) {
  return (
    <section className="card card--pad stack-sm" aria-labelledby="cr-angle">
      <div className="page-head">
        <h2 id="cr-angle" className="t-h2">
          <UserRound aria-hidden /> {t("cr.angle.title")}
        </h2>
        <p className="t-sm muted">{t("cr.angle.sub")}</p>
      </div>
      {result.angle.length ? (
        <ul className="cr-points">
          {result.angle.map((item, index) => (
            <li key={index}>
              <p>{item.text}</p>
              <div className="cr-src">
                <span className="cr-src__label">{t("cr.angle.offer")}</span>
                <blockquote className="cr-quote">{item.offerQuote}</blockquote>
                <span className="cr-src__label">{t("cr.angle.you")}</span>
                <blockquote className="cr-quote">{item.evidence}</blockquote>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-sm muted">{t("cr.angle.none")}</p>
      )}
    </section>
  )
}

function recordQuestion(t: T, question: RecordQuestion): string {
  if (question.code === "posting-old") return t("cr.q.rec.posting-old", { n: question.n })
  return t(`cr.q.rec.${question.code}`)
}

function Questions({
  t,
  unknown,
  recordQuestions,
  result,
}: {
  t: T
  unknown: BriefAxis[]
  recordQuestions: RecordQuestion[]
  result: CompanyBriefResult | null
}) {
  return (
    <section className="card card--pad stack-sm" aria-labelledby="cr-q">
      <div className="page-head">
        <h2 id="cr-q" className="t-h2">
          {t("cr.q.title")}
        </h2>
        <p className="t-sm muted">{t("cr.q.sub")}</p>
      </div>
      <ul className="cr-points">
        {recordQuestions.map((question) => (
          <li key={question.code}>
            <p>{recordQuestion(t, question)}</p>
            <span className="t-sm muted">{t("cr.q.why.records")}</span>
          </li>
        ))}
        {(result?.questions ?? []).map((question, index) => (
          <li key={`m${index}`}>
            <p>{question.text}</p>
            {question.quote ? (
              <div className="cr-src">
                <span className="cr-src__label">{t("cr.q.why.offer")}</span>
                <blockquote className="cr-quote">{question.quote}</blockquote>
              </div>
            ) : (
              <span className="t-sm muted">{t("cr.q.why.model")}</span>
            )}
          </li>
        ))}
        {unknown.map((axis) => (
          <li key={axis}>
            <p>{t(`cr.q.axis.${axis}`)}</p>
            <span className="t-sm muted">{t("cr.q.why.unknown")}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Dropped({ t, locale, result }: { t: T; locale: Locale; result: CompanyBriefResult }) {
  const counts = (["offer", "web", "angle", "questions"] as const).filter(
    (kind) => result.dropped[kind] > 0
  )
  const { unread } = result.web
  if (!counts.length && !unread.length) return null
  return (
    <section className="card card--pad stack-sm" aria-labelledby="cr-dropped">
      <h2 id="cr-dropped" className="t-h3">
        {t("cr.dropped.title")}
      </h2>
      {counts.length ? (
        <>
          <ul className="cr-list">
            {counts.map((kind) => (
              <li key={kind} className="t-sm">
                {t(`cr.dropped.${kind}.${pluralKind(result.dropped[kind], locale)}`, {
                  n: result.dropped[kind],
                })}
              </li>
            ))}
          </ul>
          <p className="t-sm muted">{t("cr.dropped.why")}</p>
        </>
      ) : null}
      {unread.length ? (
        <>
          <h3 className="t-h3">{t("cr.unread.title")}</h3>
          <p className="t-sm muted">{t("cr.unread.sub")}</p>
          <ul className="cr-rows">
            {unread.map((page) => (
              <li key={page.url}>
                <a className="link" href={page.url} target="_blank" rel="noopener noreferrer">
                  {page.url}
                </a>
                <span className="t-sm muted">{t(`cr.unread.${page.reason}`)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
