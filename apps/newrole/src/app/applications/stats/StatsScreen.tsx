"use client"

import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import { ArrowLeft, ChartNoAxesColumn } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { numberFormat, type CopyKey } from "src/app/i18n/copy"
import { ButtonLink } from "@newrole/ui/Button"
import { cx } from "@newrole/ui/cx"
import { EmptyState, Segmented } from "@newrole/ui/primitives"
import { computeInsights, type InsightsInput } from "src/server/applications/insights"
import { CHANNELS, statusLabel, type Channel } from "src/shared/applications"
import { StatusPill } from "../StatusSelect"
import { dayLabel, longDate, sourceKey } from "../rows"
import { DropOffBars, Funnel, Meter, StackedColumns, type Series } from "./charts"
import { DEFAULT_RANGE, RANGES, type RangeKey } from "./range"

function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`
}

function ratio(part: number, whole: number): number | null {
  return whole ? part / whole : null
}

const CHANNEL_KEY: Record<Channel, CopyKey> = {
  web: "stx.ch.web",
  mcp: "stx.ch.mcp",
  extension: "stx.ch.extension",
  gmail: "stx.ch.gmail",
  sheet: "stx.ch.sheet",
}

const OUTCOMES = ["ACCEPTED", "REJECTED", "WITHDRAWN", "GHOSTED"] as const

/**
 * Statistics of the whole process. The server passes every row once; changing the range
 * recomputes in the browser, so the charts never flash while filtering.
 */
export function StatsScreen({
  signedIn,
  input,
  initialRange,
  now,
}: {
  signedIn: boolean
  input: InsightsInput
  initialRange: RangeKey
  /** Server time at render, ISO, so the first client render matches the server */
  now: string
}) {
  const { t, locale } = useCopy()
  const nf = numberFormat(locale)
  const [range, setRange] = useState<RangeKey>(initialRange)
  const weeks = range === "all" ? null : Number(range)
  const insights = useMemo(
    () => computeInsights(input, { weeks, now: new Date(now) }),
    [input, weeks, now]
  )

  const pickRange = useCallback((next: RangeKey) => {
    setRange(next)
    const url = new URL(window.location.href)
    if (next === DEFAULT_RANGE) url.searchParams.delete("w")
    else url.searchParams.set("w", next)
    window.history.replaceState(null, "", url)
  }, [])

  const hasAny = input.applications.length > 0
  const total = insights.sent
  const replied = Math.round((insights.rates.response ?? 0) * total)
  const interviews = insights.funnel.find((row) => row.stage === "INTERVIEW")?.reached ?? 0
  const offers = insights.funnel.find((row) => row.stage === "OFFER")?.reached ?? 0
  const week = (iso: string) => ({
    label: dayLabel(iso, locale),
    title: t("stx.week.of", { date: dayLabel(iso, locale) }),
  })

  const weeklySeries: Series[] = [
    { key: "replied", label: t("stx.week.replied"), color: "var(--viz-1)" },
    { key: "silent", label: t("stx.week.silent"), color: "var(--viz-mute)" },
  ]
  const weeklyPoints = insights.weekly.map((point) => ({
    ...week(point.weekStart),
    values: [point.sentReplied, point.sent - point.sentReplied],
  }))
  const decisionSeries: Series[] = [
    { key: "liked", label: t("stx.dec.liked"), color: "var(--viz-1)" },
    { key: "applied", label: t("stx.dec.applied"), color: "var(--viz-2)" },
    { key: "passed", label: t("stx.dec.passed"), color: "var(--viz-mute)" },
  ]
  const decisionPoints = insights.weekly.map((point) => ({
    ...week(point.weekStart),
    values: [point.liked, point.applied, point.passed],
  }))
  const dropSeries: Series[] = [
    { key: "rejected", label: t("stx.drop.rejected"), color: "var(--danger)" },
    { key: "withdrawn", label: t("stx.drop.withdrawn"), color: "var(--viz-mute)" },
  ]
  const outcomeCount: Record<(typeof OUTCOMES)[number], number> = {
    ACCEPTED: insights.outcomes.accepted,
    REJECTED: insights.outcomes.rejected,
    WITHDRAWN: insights.outcomes.withdrawn,
    GHOSTED: insights.outcomes.ghosted,
  }
  const { automation, decisions } = insights
  const channels = CHANNELS.filter((channel) => automation.byChannel[channel] > 0).map(
    (channel) => `${t(CHANNEL_KEY[channel])} ${nf.format(automation.byChannel[channel])}`
  )
  const dropNotes = [
    insights.outcomes.ghosted
      ? t("stx.drop.ghosted", { n: nf.format(insights.outcomes.ghosted) })
      : null,
    insights.timing.medianDaysToRejection != null
      ? t("stx.drop.rejection", { n: insights.timing.medianDaysToRejection })
      : null,
  ].filter(Boolean)

  return (
    <div className="stack-lg apps-page stx-page">
      <div className="apps-head">
        <header className="page-head">
          <Link href="/applications" className="link link--quiet t-sm stx-back">
            <ArrowLeft aria-hidden />
            {t("stx.back")}
          </Link>
          <h1 className="t-h1">{t("stx.title")}</h1>
          <p>{t("stx.sub")}</p>
        </header>
        {hasAny ? (
          <div className="stx-range">
            <Segmented
              value={range}
              label={t("stx.range")}
              onChange={pickRange}
              options={RANGES.map((value) => ({
                value,
                label: value === "all" ? t("stx.range.all") : t("stx.range.weeks", { n: value }),
              }))}
            />
          </div>
        ) : null}
      </div>

      {!hasAny ? (
        <EmptyState
          icon={<ChartNoAxesColumn />}
          title={t("stx.empty.title")}
          body={signedIn ? t("stx.empty.body") : `${t("stx.empty.body")} ${t("app.signIn")}`}
        >
          <ButtonLink href="/applications" variant="primary">
            {t("stx.empty.tracker")}
          </ButtonLink>
          <ButtonLink href="/offers" variant="outline">
            {t("app.empty.offers")}
          </ButtonLink>
        </EmptyState>
      ) : (
        <>
          <p className="stx-note">
            {insights.from
              ? t("stx.range.note", { date: longDate(insights.from, locale) })
              : t("stx.range.noteAll")}
            {insights.truncated ? ` ${t("stx.range.truncated")}` : ""}
          </p>

          {total === 0 ? (
            <div className="card card--quiet card--pad">
              <p className="muted">{t("stx.empty.range")}</p>
            </div>
          ) : (
            <>
              <dl className="stx-kpis" aria-label={t("stx.title")}>
                <div className="card stx-kpi">
                  <dt>{t("stx.k.sent")}</dt>
                  <dd>{nf.format(total)}</dd>
                  {insights.perWeek != null ? (
                    <span className="stx-kpi__sub">
                      {t("stx.k.perWeek", { n: nf.format(insights.perWeek) })}
                    </span>
                  ) : null}
                </div>
                <div className="card stx-kpi">
                  <dt>{t("stx.k.response")}</dt>
                  <dd>{pct(insights.rates.response)}</dd>
                  <span className="stx-kpi__sub">
                    {t("stx.k.responseSub", { n: nf.format(replied), total: nf.format(total) })}
                  </span>
                </div>
                <div className="card stx-kpi">
                  <dt>{t("stx.k.interview")}</dt>
                  <dd>{pct(insights.rates.interview)}</dd>
                  <span className="stx-kpi__sub">
                    {t("stx.k.interviewSub", {
                      n: nf.format(interviews),
                      total: nf.format(total),
                    })}
                  </span>
                </div>
                <div className="card stx-kpi">
                  <dt>{t("stx.k.offers")}</dt>
                  <dd>{nf.format(offers)}</dd>
                  <span className="stx-kpi__sub">
                    {t("stx.k.offersSub", { n: nf.format(offers), total: nf.format(total) })}
                  </span>
                </div>
                <div className="card stx-kpi">
                  <dt>{t("stx.k.reply")}</dt>
                  <dd>
                    {insights.timing.medianDaysToReply == null
                      ? "—"
                      : t("stx.k.days", { n: insights.timing.medianDaysToReply })}
                  </dd>
                  <span className="stx-kpi__sub">{t("stx.k.replySub")}</span>
                </div>
              </dl>

              <div className="stx-grid">
                <section className="card stx-card" aria-labelledby="stx-funnel">
                  <div className="stx-card__head">
                    <h2 id="stx-funnel">{t("stx.funnel.title")}</h2>
                    <p>{t("stx.funnel.sub")}</p>
                  </div>
                  <Funnel
                    rows={insights.funnel.map((row, index) => ({
                      stage: row.stage,
                      label: statusLabel(row.stage, locale),
                      reached: row.reached,
                      current: row.current,
                      fromPrevious: row.fromPrevious,
                      color: `var(--viz-ramp-${index + 1})`,
                    }))}
                    nowLabel={(n) => t("stx.funnel.now", { n: nf.format(n) })}
                    convLabel={(n) => t("stx.funnel.conv", { n })}
                  />
                  <div className="stx-outcomes" aria-label={t("stx.funnel.closed")}>
                    {OUTCOMES.map((status) => (
                      <span key={status} className="stx-outcome">
                        <StatusPill status={status} />
                        <b>{nf.format(outcomeCount[status])}</b>
                      </span>
                    ))}
                  </div>
                </section>

                <section className="card stx-card" aria-labelledby="stx-drop">
                  <div className="stx-card__head">
                    <h2 id="stx-drop">{t("stx.drop.title")}</h2>
                    <p>{t("stx.drop.sub")}</p>
                  </div>
                  {insights.dropOff.length ? (
                    <>
                      <DropOffBars
                        series={dropSeries}
                        rows={insights.dropOff.map((row) => ({
                          stage: row.stage,
                          label: statusLabel(row.stage, locale),
                          values: [row.rejected, row.withdrawn],
                          text: [
                            row.rejected
                              ? `${t("stx.drop.rejected")} ${nf.format(row.rejected)}`
                              : null,
                            row.withdrawn
                              ? `${t("stx.drop.withdrawn")} ${nf.format(row.withdrawn)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · "),
                        }))}
                      />
                      <ul className="stx-legend" aria-label={t("stx.legend")}>
                        {dropSeries.map((item) => (
                          <li key={item.key}>
                            <i style={{ background: item.color }} aria-hidden />
                            {item.label}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="muted t-sm">{t("stx.drop.none")}</p>
                  )}
                  {dropNotes.length ? <p className="stx-note">{dropNotes.join(" · ")}</p> : null}
                </section>
              </div>

              <section className="card stx-card" aria-labelledby="stx-week">
                <div className="stx-card__head">
                  <h2 id="stx-week">{t("stx.week.title")}</h2>
                  <p>{t("stx.week.sub")}</p>
                </div>
                <StackedColumns
                  points={weeklyPoints}
                  series={weeklySeries}
                  label={t("stx.chart.weekly")}
                  totalLabel={t("stx.total")}
                  tableLabel={t("stx.table.show")}
                  legendLabel={t("stx.legend")}
                  xLabel={t("stx.week.col")}
                />
              </section>

              <section className="card stx-card" aria-labelledby="stx-dec">
                <div className="stx-card__head">
                  <h2 id="stx-dec">{t("stx.dec.title")}</h2>
                  <p>{t("stx.dec.sub")}</p>
                </div>
                {decisions.total ? (
                  <>
                    <StackedColumns
                      points={decisionPoints}
                      series={decisionSeries}
                      label={t("stx.chart.decisions")}
                      totalLabel={t("stx.total")}
                      tableLabel={t("stx.table.show")}
                      legendLabel={t("stx.legend")}
                      xLabel={t("stx.week.col")}
                    />
                    <p className="stx-note">
                      {t("stx.dec.reason", {
                        pct: Math.round((decisions.withReason / decisions.total) * 100),
                        n: nf.format(decisions.withReason),
                        total: nf.format(decisions.total),
                      })}
                    </p>
                  </>
                ) : (
                  <p className="muted t-sm">{t("stx.dec.none")}</p>
                )}
              </section>

              <div className="stx-grid">
                <section className="card stx-card" aria-labelledby="stx-src">
                  <div className="stx-card__head">
                    <h2 id="stx-src">{t("stx.src.title")}</h2>
                    <p>{t("stx.src.sub")}</p>
                  </div>
                  <div className="stx-scroll">
                    <table className="table stx-src">
                      <thead>
                        <tr>
                          <th scope="col">{t("stx.src.source")}</th>
                          <th scope="col" className="num">
                            {t("stx.src.sent")}
                          </th>
                          <th scope="col" className="num">
                            {t("stx.src.replied")}
                          </th>
                          <th scope="col" className="num">
                            {t("stx.src.rate")}
                          </th>
                          <th scope="col" className="num">
                            {t("stx.src.interviews")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {insights.sources.map((row) => (
                          <tr key={row.source}>
                            <td>{t(sourceKey(row.source))}</td>
                            <td className="num">{nf.format(row.sent)}</td>
                            <td className="num">{nf.format(row.replied)}</td>
                            <td className="num">{pct(row.responseRate)}</td>
                            <td className="num">{nf.format(row.interviewing)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="stx-note">
                    {t("stx.src.index", {
                      n: nf.format(insights.fromIndex),
                      total: nf.format(total),
                    })}
                  </p>
                </section>

                <section className="card stx-card" aria-labelledby="stx-proc">
                  <div className="stx-card__head">
                    <h2 id="stx-proc">{t("stx.proc.title")}</h2>
                    <p>{t("stx.proc.sub")}</p>
                  </div>
                  <Meter
                    label={t("stx.proc.auto")}
                    value={ratio(automation.autoTracked, automation.tracked)}
                    hint={t("stx.proc.autoHint", {
                      n: nf.format(automation.autoTracked),
                      total: nf.format(automation.tracked),
                    })}
                  />
                  <Meter
                    label={t("stx.proc.reason")}
                    value={ratio(decisions.withReason, decisions.total)}
                    hint={t("stx.proc.reasonHint", {
                      n: nf.format(decisions.withReason),
                      total: nf.format(decisions.total),
                    })}
                  />
                  <Meter
                    label={t("stx.proc.answers")}
                    value={ratio(automation.answersReused, automation.answersTotal)}
                    hint={t("stx.proc.answersHint", {
                      n: nf.format(automation.answersReused),
                      total: nf.format(automation.answersTotal),
                    })}
                  />
                  {channels.length ? (
                    <p className="stx-note">
                      {t("stx.proc.channels")}: {channels.join(" · ")}
                    </p>
                  ) : null}
                </section>
              </div>
            </>
          )}

          <section className="stack" aria-labelledby="stx-now">
            <div className="stx-card__head">
              <h2 id="stx-now" className="t-h3">
                {t("stx.now.title")}
              </h2>
              <p>{t("stx.now.note")}</p>
            </div>
            <div className="stx-grid">
              <section className="card stx-card" aria-labelledby="stx-wait">
                <div className="stx-card__head">
                  <h2 id="stx-wait">{t("stx.wait.title")}</h2>
                  <p>{t("stx.wait.sub")}</p>
                </div>
                {insights.waiting.length ? (
                  <ul className="stx-list">
                    {insights.waiting.map((row) => (
                      <li key={row.id}>
                        <div>
                          <Link href={`/applications?id=${row.id}`}>{row.company}</Link>
                          <span className="stx-list__sub">{row.title}</span>
                        </div>
                        <span className="stx-list__right">
                          {t("stx.wait.days", { n: nf.format(row.days) })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted t-sm">{t("stx.wait.none")}</p>
                )}
              </section>

              <section className="card stx-card" aria-labelledby="stx-next">
                <div className="stx-card__head">
                  <h2 id="stx-next">{t("stx.next.title")}</h2>
                  <p>{t("stx.next.sub")}</p>
                </div>
                {insights.upcoming.length ? (
                  <ul className="stx-list">
                    {insights.upcoming.map((row) => (
                      <li key={row.id}>
                        <div>
                          <Link href={`/applications?id=${row.id}`}>{row.company}</Link>
                          <span className="stx-list__sub">
                            {row.nextStep ?? t("stx.next.noLabel")} · {row.title}
                          </span>
                        </div>
                        <span className={cx("stx-list__right", row.overdue && "is-overdue")}>
                          {dayLabel(row.nextStepAt, locale)}
                          {row.overdue ? ` · ${t("stx.next.overdue")}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted t-sm">{t("stx.next.none")}</p>
                )}
              </section>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
