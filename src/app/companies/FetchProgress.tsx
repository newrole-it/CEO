"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@blitzjs/rpc"
import { ChevronRight, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { intlLocale, numberFormat, type CopyKey, type Locale, type T } from "src/app/i18n/copy"
import { cx } from "src/app/components/ds/cx"
import { relativeTime } from "src/app/jobs/format"
import getFetchProgress from "./queries/getFetchProgress"

type Progress = Awaited<ReturnType<typeof getFetchProgress>>

const POLL_MS = 5000

const HEADLINE: Record<Progress["phase"], CopyKey> = {
  stopped: "co.fetch.stopped",
  reading: "co.fetch.working",
  queued: "co.fetch.working",
  paused: "co.fetch.paused",
  gaps: "co.fetch.gaps",
  done: "co.fetch.done",
}

/** The clock time when it falls today, otherwise with the date too. */
function nextCheck(iso: string, locale: Locale): string {
  const at = new Date(iso)
  const today = at.toDateString() === new Date().toDateString()
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    ...(today ? {} : { day: "numeric", month: "short" }),
  }).format(at)
}

function detail(data: Progress, t: T, locale: Locale): string {
  const queue = data.waiting ? t("co.fetch.queue", { n: data.waiting }) : ""
  const next = data.nextCheckAt ? t("co.fetch.next", { when: nextCheck(data.nextCheckAt, locale) }) : ""
  switch (data.phase) {
    case "stopped":
      return t(data.local ? "co.fetch.stopped.run" : "co.fetch.stopped.b")
    case "reading":
      return [data.current ? t("co.fetch.current", { company: data.current }) : "", queue].filter(Boolean).join(" ")
    case "queued":
      return queue
    case "paused":
      return `${t("co.fetch.paused.b")} ${queue}`
    case "gaps":
      return [t("co.fetch.gaps.b"), next].filter(Boolean).join(" ")
    default:
      return next
  }
}

function Names({ group }: { group: { count: number; names: string[] } }) {
  const more = group.count - group.names.length
  return (
    <>
      {group.names.join(", ")}
      {more > 0 ? ` +${more}` : ""}
    </>
  )
}

export function FetchProgressCard({ data }: { data: Progress }) {
  const { t, locale } = useCopy()
  const busy = data.phase === "reading" || data.phase === "queued" || data.phase === "paused"
  const warn = data.phase === "stopped" || data.phase === "gaps"
  const last = relativeTime(data.lastFetchedAt, t)
  const problems = [
    data.failed.count ? t("co.fetch.failed", { n: data.failed.count }) : null,
    data.partial.count ? t("co.fetch.partial", { n: data.partial.count }) : null,
  ].filter(Boolean)
  return (
    <section
      className={cx("card fetch-card", warn && "fetch-card--warn", data.phase === "done" && "fetch-card--done")}
      aria-label={t("co.fetch.label")}
    >
      <div className="fetch-card__head">
        <span className={cx("fetch-card__icon", busy && "fetch-card__icon--busy")} aria-hidden>
          {busy ? <LoaderCircle /> : warn ? <CircleAlert /> : <CircleCheck />}
        </span>
        <div className="fetch-card__text">
          <h2 className="t-h3" aria-live="polite">
            {t(HEADLINE[data.phase])}
          </h2>
          <p className="t-sm muted">
            {detail(data, t, locale)}
            {data.phase === "stopped" && data.local ? (
              <>
                {" "}
                <code>npm run worker</code>
              </>
            ) : null}
          </p>
        </div>
        <span className="fetch-card__percent num">{data.percent}%</span>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={data.total}
        aria-valuenow={data.ready}
        aria-label={t("co.fetch.label")}
      >
        <i style={{ ["--p" as string]: `${data.percent}%` }} />
      </div>
      <p className="fetch-card__facts t-sm muted num">
        <span>{t("co.fetch.companies", { ready: data.ready, total: data.total })}</span>
        {data.watched.total ? (
          <span>{t("co.fetch.watched", { ready: data.watched.ready, total: data.watched.total })}</span>
        ) : null}
        <span>{t("co.fetch.offers", { n: numberFormat(locale).format(data.offers) })}</span>
        {last ? <span>{t("co.fetch.last", { when: last })}</span> : null}
      </p>
      {problems.length ? (
        <details className="disclosure">
          <summary className="t-caption">
            <ChevronRight aria-hidden /> {problems.join(" · ")}
          </summary>
          <div className="fetch-card__names t-sm muted">
            {data.failed.count ? (
              <p>
                <strong>{t("co.fetch.failed.names")}</strong> <Names group={data.failed} />
              </p>
            ) : null}
            {data.partial.count ? (
              <p>
                <strong>{t("co.fetch.partial.names")}</strong> <Names group={data.partial} />
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  )
}

/** Live status of the offer fetch: is the worker still at it, or is everything in? */
export function FetchProgress() {
  const { t } = useCopy()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [data, { isLoading, error }] = useQuery(getFetchProgress, null, {
    suspense: false,
    enabled: mounted,
    refetchInterval: POLL_MS,
  })

  // The rows below are rendered on the server. Without this a row keeps saying "queued"
  // after the card has already counted that company as fetched.
  const watchedReady = data?.watched.ready ?? null
  const seen = useRef<number | null>(null)
  useEffect(() => {
    if (watchedReady === null) return
    if (seen.current !== null && seen.current !== watchedReady) router.refresh()
    seen.current = watchedReady
  }, [watchedReady, router])

  if (!mounted || (isLoading && !data)) {
    return (
      <section className="card fetch-card" aria-label={t("co.fetch.label")}>
        <p className="t-sm muted">{t("co.fetch.loading")}</p>
      </section>
    )
  }
  if (error || !data) {
    return (
      <section className="card fetch-card" aria-label={t("co.fetch.label")}>
        <p className="t-sm muted">{t("co.fetch.error")}</p>
      </section>
    )
  }
  return <FetchProgressCard data={data} />
}
