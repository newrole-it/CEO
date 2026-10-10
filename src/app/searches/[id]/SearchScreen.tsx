"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "@blitzjs/rpc"
import getSearch from "src/app/searches/queries/getSearch"
import rerunSearch from "src/app/searches/mutations/rerunSearch"
import { Button } from "src/app/components/ui/button"
import { polishBoardLinks } from "src/shared/polish-boards"
import { WORKDAY_BOARDS } from "src/shared/workday-boards"

type ScoreComponent = {
  id: string
  weight: number
  points: number
  value: number
  reason: string
}

type ScorePenalty = { id: string; points: number; reason: string }

type PackBreakdown = {
  band?: string
  components?: ScoreComponent[]
  penalties?: ScorePenalty[]
  monthlyPln?: { min: number | null; max: number | null } | null
  assumptions?: string[]
}

function formatWhen(value: Date | string | null | undefined) {
  if (!value) return "Date unknown"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "Date unknown"
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

function money(min?: number | null, max?: number | null, currency?: string | null) {
  if (min == null && max == null) return null
  const code = currency ? `${currency} ` : ""
  const fmt = (value: number) =>
    new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value)
  if (min != null && max != null && min !== max) return `${code}${fmt(min)}–${fmt(max)}`
  return `${code}${fmt((min ?? max) as number)}`
}

function safeHref(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

function variantLines(value: unknown) {
  if (!Array.isArray(value) || value.length < 2) return null
  return (
    <ul className="variants">
      {value.map((item) => {
        const variant = item as {
          contract?: string
          salaryText?: string
          url?: string
          title?: string
        }
        const href = safeHref(variant.url)
        return (
          <li key={variant.url || variant.title}>
            <strong>{variant.contract || variant.title}</strong>
            {variant.salaryText ? ` · ${variant.salaryText}` : ""}
            {href ? (
              <>
                {" "}
                <a href={href} target="_blank" rel="noreferrer noopener">
                  Open
                </a>
              </>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export function SearchScreen({ id }: { id: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  const [data, { isLoading, error, refetch }] = useQuery(
    getSearch,
    { id },
    { suspense: false, enabled: mounted }
  )
  const [rerun, { isPending: rerunning }] = useMutation(rerunSearch)
  const [showScores, setShowScores] = useState(false)
  const activeStatus = data?.active?.status
  const polling =
    activeStatus === "QUEUED" || activeStatus === "RUNNING" || activeStatus === "RETRYING"
  useQuery(
    getSearch,
    { id },
    { suspense: false, refetchInterval: polling ? 1500 : false, enabled: mounted && Boolean(data) }
  )

  const expansion = useMemo(() => {
    const raw = data?.active?.expansion
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
    return raw as { titles?: string[]; exclusions?: string[]; source?: string; notes?: string }
  }, [data?.active?.expansion])

  if (!mounted || (isLoading && !data)) {
    return <div className="empty-card">Looking up this scan…</div>
  }
  if (error || !data) {
    return (
      <div className="error-card">
        <h1 className="h1" style={{ fontSize: 36 }}>
          That scan is not available
        </h1>
        <p>It may belong to another session, or the id is wrong.</p>
        <Button asChild>
          <Link href="/">New scan</Link>
        </Button>
      </div>
    )
  }

  const running =
    data.active?.status === "QUEUED" ||
    data.active?.status === "RUNNING" ||
    data.active?.status === "RETRYING"
  const failed = data.active?.status === "FAILED" && !data.resultRun

  return (
    <div>
      <div className="hero">
        <p className="kicker">
          {running ? "Scan in progress" : data.active?.status === "FAILED" ? "Scan failed" : "Scan"}
        </p>
        <h1>{data.search.phrase}</h1>
        <p className="lede">
          {[
            data.search.locationHint,
            data.search.workMode !== "ANY" ? data.search.workMode.toLowerCase() : null,
          ]
            .filter(Boolean)
            .join(" · ") || "No location or work-mode constraint."}
        </p>
        <div>
          <Button
            variant="outline"
            disabled={running || rerunning}
            onClick={async () => {
              await rerun({ id })
              await refetch()
            }}
          >
            {running ? "Scanning…" : "Run again"}
          </Button>
        </div>
      </div>

      <section className="progress-panel panel">
        <div className="progress-top">
          <strong>{data.active?.message || "Waiting"}</strong>
          <span className="meta">
            {data.active?.progress ?? 0}%
            {data.active?.tokenInput || data.active?.tokenOutput
              ? ` · ${data.active.tokenInput + data.active.tokenOutput} tokens`
              : ""}
            {data.active && data.active.estimatedCost > 0
              ? ` · ~$${data.active.estimatedCost.toFixed(4)}`
              : ""}
          </span>
        </div>
        <div className="bar" aria-hidden>
          <span style={{ width: `${data.active?.progress ?? 0}%` }} />
        </div>
        {expansion?.titles?.length ? (
          <>
            <div className="chips" aria-label="Expanded titles">
              {expansion.titles.map((title) => (
                <span className="chip" key={title}>
                  {title}
                </span>
              ))}
            </div>
            {expansion.exclusions?.length ? (
              <p className="hint">Excluding {expansion.exclusions.slice(0, 8).join(", ")}.</p>
            ) : null}
          </>
        ) : null}
        {data.logs.length ? (
          <ul className="logs">
            {data.logs.slice(-8).map((entry) => (
              <li key={entry.id}>{entry.message}</li>
            ))}
          </ul>
        ) : (
          <p className="hint">Progress will show up here within a second or two.</p>
        )}
        {data.active?.errorSummary && data.active.status === "FAILED" ? (
          <p className="form-error">{data.active.errorSummary}</p>
        ) : null}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 22, marginBottom: 8 }}>Polish boards, as links</h2>
        <p className="hint">
          justjoin.it, nofluffjobs, pracuj.pl, theprotocol.it, and bulldogjob have no public API,
          and their terms forbid automated downloading. These open their own search. Jobscanner does
          not fetch them.
        </p>
        <div className="chips" style={{ marginTop: 12 }}>
          {polishBoardLinks(data.search.phrase).map((link) => (
            <a
              key={link.name}
              className="chip"
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
            >
              {link.name}
            </a>
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 22, marginBottom: 8 }}>Workday career sites, as links</h2>
        <p className="hint">
          Workday&apos;s site terms ban data mining and robots. These open the employer board.
          Jobscanner does not fetch them.
        </p>
        <div className="chips" style={{ marginTop: 12 }}>
          {WORKDAY_BOARDS.map((link) => (
            <a
              key={link.href}
              className="chip"
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
            >
              {link.name}
            </a>
          ))}
        </div>
      </section>

      {failed ? null : data.results.length === 0 ? (
        <div className="empty-card">
          <h2>{running ? "Offers will land here" : "No matching offers this time"}</h2>
          <p className="lede">
            {running
              ? "Boards are public and rate-limited, so a scan often takes half a minute."
              : "The sources that responded did not have a title close enough to this phrase. Try a broader one, or run again after adding a search API key."}
          </p>
        </div>
      ) : (
        <>
          <div className="section-head">
            <h2>
              {data.results.length} offer{data.results.length === 1 ? "" : "s"}
              {data.resultRun && data.active && data.resultRun.id !== data.active.id
                ? " from the last finished scan"
                : ""}
            </h2>
            <button className="chip" type="button" onClick={() => setShowScores((value) => !value)}>
              {showScores ? "Hide score parts" : "Show score parts"}
            </button>
          </div>
          <div className="results">
            {data.results.map((result) => {
              const salary = money(
                result.job.salaryMin,
                result.job.salaryMax,
                result.job.salaryCurrency
              )
              const pack =
                result.breakdown && typeof result.breakdown === "object"
                  ? (result.breakdown as PackBreakdown)
                  : {}
              const parts = Array.isArray(pack.components) ? pack.components : []
              const penalties = Array.isArray(pack.penalties) ? pack.penalties : []
              return (
                <article className="result-card" key={result.id}>
                  <div
                    className="score"
                    title={pack.band ? `${pack.band} match, out of 100` : "Match score out of 100"}
                  >
                    {Math.round(result.score)}
                    {pack.band ? <span className="meta">{pack.band}</span> : null}
                  </div>
                  <div>
                    <header>
                      <div>
                        <p className="company">{result.job.company}</p>
                        <h3>{result.job.title}</h3>
                      </div>
                      <div className="badges">
                        {result.isNew ? <span className="badge new">New</span> : null}
                        <span className="badge mode">{result.job.workplaceType}</span>
                        {result.job.employmentType ? (
                          <span className="badge">{result.job.employmentType}</span>
                        ) : null}
                      </div>
                    </header>
                    <div className="facts">
                      <span>{result.job.locationText || "Location not stated"}</span>
                      {salary ? <span>{salary}</span> : <span>Salary not listed</span>}
                      <span>Published {formatWhen(result.job.publishedAt)}</span>
                      <span>First seen {formatWhen(result.job.firstSeenAt)}</span>
                      <span>{result.job.sourceType.toLowerCase().replace(/_/g, " ")}</span>
                    </div>
                    <p className="reason">{result.reason}</p>
                    {result.job.summary ? <p className="summary">{result.job.summary}</p> : null}
                    {showScores && parts.length ? (
                      <div className="breakdown">
                        {parts.map((part) => (
                          <div key={part.id}>
                            <strong>
                              {part.id} {part.points}/{part.weight}
                            </strong>
                            {part.reason}
                          </div>
                        ))}
                        {penalties.map((penalty) => (
                          <div key={penalty.id}>
                            <strong>
                              {penalty.id} {penalty.points}
                            </strong>
                            {penalty.reason}
                          </div>
                        ))}
                        {pack.monthlyPln &&
                        (pack.monthlyPln.min != null || pack.monthlyPln.max != null) ? (
                          <div>
                            <strong>monthly PLN</strong>
                            Compared as {pack.monthlyPln.min ?? "?"}–{pack.monthlyPln.max ?? "?"}{" "}
                            PLN / month, B2B net of VAT.
                            {pack.assumptions?.length ? ` ${pack.assumptions.join("; ")}` : ""}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {result.job.descriptionText ? (
                      <details className="description">
                        <summary>Excerpt</summary>
                        <div className="prose">{result.job.descriptionText}</div>
                      </details>
                    ) : null}
                    {variantLines(result.job.variants)}
                    <div className="actions">
                      {safeHref(result.job.originalUrl) ? (
                        <Button asChild>
                          <a
                            href={safeHref(result.job.originalUrl)!}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            Open original
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
