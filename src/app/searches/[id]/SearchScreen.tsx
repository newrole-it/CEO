"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "@blitzjs/rpc"
import getSearch from "src/app/searches/queries/getSearch"
import rerunSearch from "src/app/searches/mutations/rerunSearch"
import { LinkedInMark } from "src/app/components/site/Brand"
import { Button } from "src/app/components/ui/button"
import { Input } from "src/app/components/ui/input"
import { useCopy } from "src/app/i18n/Locale"
import { polishBoardLinks } from "src/shared/polish-boards"
import { statusFromStamps } from "src/shared/triage"
import { WORKDAY_BOARDS } from "src/shared/workday-boards"
import { TriageButtons } from "../TriageButtons"
import { UndoToast } from "../UndoToast"
import { useOfferDecisions } from "../useOfferDecisions"
import { OfferDialog } from "./OfferDialog"
import { SwipeStack } from "./SwipeStack"

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
  profile?: { why?: string }
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

function useNarrow() {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)")
    const apply = () => setNarrow(media.matches)
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [])
  return narrow
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
  const { t } = useCopy()
  const [mounted, setMounted] = useState(false)
  const [showScores, setShowScores] = useState(false)
  const [page, setPage] = useState(1)
  const [fullList, setFullList] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [location, setLocation] = useState("")
  const [company, setCompany] = useState("")
  const [contract, setContract] = useState("")
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [salaryOnly, setSalaryOnly] = useState(false)
  const [showDecided, setShowDecided] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const narrow = useNarrow()
  const [industry, setIndustry] = useState("")
  const [minSalary, setMinSalary] = useState("")
  const [seniority, setSeniority] = useState("")
  useEffect(() => {
    setMounted(true)
  }, [])
  const queryInput = {
    id,
    page,
    location: location.trim() || undefined,
    company: company.trim() || undefined,
    contract: contract.trim() || undefined,
    remote: remoteOnly || undefined,
    salary: salaryOnly || undefined,
    includeDecided: showDecided || undefined,
    industry: industry.trim() || undefined,
    minSalary: Number(minSalary) > 0 ? Number(minSalary) : undefined,
    seniority: seniority || undefined,
    full: fullList || undefined,
  }
  const [data, { isLoading, error, refetch }] = useQuery(getSearch, queryInput, {
    suspense: false,
    enabled: mounted,
  })
  const [rerun, { isPending: rerunning }] = useMutation(rerunSearch)
  const { decide, undo, toast, canUndo } = useOfferDecisions(async () => {
    await refetch()
  })
  const activeStatus = data?.active?.status
  const polling =
    activeStatus === "QUEUED" || activeStatus === "RUNNING" || activeStatus === "RETRYING"
  useQuery(getSearch, queryInput, {
    suspense: false,
    refetchInterval: polling ? 1500 : false,
    enabled: mounted && Boolean(data),
  })

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const reject = event.key === "ArrowLeft" || event.key === "j" || event.key === "J"
      const interested = event.key === "ArrowRight" || event.key === "k" || event.key === "K"
      if (!reject && !interested) return
      if (!target?.closest(".results, .swipe-stack, .offer-dialog") && target !== document.body)
        return
      const currentId = detailId || highlightId || data?.results[0]?.id
      const result = data?.results.find((item) => item.id === currentId)
      if (!result) return
      event.preventDefault()
      const visible = data?.results.map((item) => item.id) ?? []
      const index = visible.indexOf(result.id)
      const nextId = visible[index + 1] ?? visible[index - 1] ?? null
      void decide({
        matchId: result.id,
        jobId: result.job.id,
        label: result.job.title,
        from: statusFromStamps(result.interestedAt, result.dismissedAt),
        to: reject ? "rejected" : "interested",
      }).then(() => {
        if (nextId) {
          setHighlightId(nextId)
          requestAnimationFrame(() => document.getElementById(`offer-${nextId}`)?.focus())
        }
      })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [data, decide, detailId, highlightId])

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
  const showScan = scanOpen || running || failed

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
            {running ? "Scanning…" : t("runAgain")}
          </Button>
        </div>
      </div>

      {!failed && !data.hasProfile && (data.resultRun || !running) ? (
        <section className="cta-panel match-cta" aria-labelledby="connect-title">
          <p className="eyebrow">{t("connectEyebrow")}</p>
          <h2 className="h2" id="connect-title">
            {t("connectTitle")}
          </h2>
          <p>{t("connectBody")}</p>
          <div className="cta-row">
            {data.signedIn ? (
              <Link className="btn btn-light btn-lg" href="/profile">
                {t("connectImport")}
              </Link>
            ) : (
              <Link className="btn btn-light btn-lg btn-linkedin" href="/api/auth/linkedin/start">
                <LinkedInMark />
                {t("signinLinkedIn")}
              </Link>
            )}
            {data.signedIn ? (
              <Link className="btn btn-line btn-lg btn-linkedin" href="/api/auth/linkedin/start">
                <LinkedInMark />
                {t("signinLinkedIn")}
              </Link>
            ) : (
              <Link className="btn btn-line btn-lg" href="/profile">
                {t("connectImport")}
              </Link>
            )}
          </div>
        </section>
      ) : null}
      {!failed && data.hasProfile && !data.personalized && data.resultRun && !running ? (
        <section className="cta-panel match-cta" aria-labelledby="rerun-title">
          <h2 className="h2" id="rerun-title">
            {t("rerunProfile")}
          </h2>
          <div className="cta-row">
            <button
              className="btn btn-light btn-lg"
              type="button"
              disabled={rerunning}
              onClick={async () => {
                await rerun({ id })
                await refetch()
              }}
            >
              {t("runAgain")}
            </button>
          </div>
        </section>
      ) : null}

      <details
        className="progress-panel panel"
        open={showScan}
        onToggle={(event) => setScanOpen(event.currentTarget.open)}
      >
        <summary className="progress-top">
          <strong>
            {running || failed ? data.active?.message || t("scanDetails") : t("scanDetails")}
          </strong>
          <span className="meta">{data.active?.progress ?? 0}%</span>
        </summary>
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
      </details>

      <section className="panel filters" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 22, marginBottom: 8 }}>{t("narrowMatches")}</h2>
        <div className="filter-grid">
          <Input
            aria-label="Location"
            placeholder="Location"
            value={location}
            onChange={(event) => {
              setPage(1)
              setLocation(event.target.value)
            }}
          />
          <Input
            aria-label="Company"
            placeholder="Company"
            value={company}
            onChange={(event) => {
              setPage(1)
              setCompany(event.target.value)
            }}
          />
          <Input
            aria-label="Contract"
            placeholder="Contract, such as B2B"
            value={contract}
            onChange={(event) => {
              setPage(1)
              setContract(event.target.value)
            }}
          />
          <Input
            aria-label="Industry"
            placeholder="Industry, such as fintech"
            value={industry}
            onChange={(event) => {
              setPage(1)
              setIndustry(event.target.value)
            }}
          />
          <select
            className="plain"
            aria-label="Seniority"
            value={seniority}
            onChange={(event) => {
              setPage(1)
              setSeniority(event.target.value)
            }}
          >
            <option value="">Any seniority</option>
            <option value="intern">Intern</option>
            <option value="junior">Junior</option>
            <option value="mid">Mid</option>
            <option value="senior">Senior</option>
            <option value="lead">Lead</option>
            <option value="principal">Principal</option>
            <option value="manager">Manager</option>
            <option value="senior_manager">Senior manager</option>
            <option value="head">Head</option>
            <option value="director">Director</option>
            <option value="vp">VP</option>
            <option value="c_level">C-level</option>
          </select>
          <Input
            aria-label="Minimum monthly salary in PLN"
            placeholder="Minimum monthly PLN"
            inputMode="numeric"
            value={minSalary}
            onChange={(event) => {
              setPage(1)
              setMinSalary(event.target.value.replace(/[^\d]/g, ""))
            }}
          />
        </div>
        <p className="hint">
          A minimum salary hides offers that do not disclose pay. Industry narrows to the extracted
          industry. Both apply after a profile is saved and the search is run again.
        </p>
        <div className="chips" style={{ marginTop: 12 }}>
          <label className="chip">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(event) => {
                setPage(1)
                setRemoteOnly(event.target.checked)
              }}
            />{" "}
            Remote
          </label>
          <label className="chip">
            <input
              type="checkbox"
              checked={salaryOnly}
              onChange={(event) => {
                setPage(1)
                setSalaryOnly(event.target.checked)
              }}
            />{" "}
            Salary listed
          </label>
          <label className="chip">
            <input
              type="checkbox"
              checked={showDecided}
              onChange={(event) => {
                setPage(1)
                setShowDecided(event.target.checked)
              }}
            />{" "}
            Show decided
          </label>
        </div>
      </section>

      {failed ? null : data.total === 0 ? (
        <div className="empty-card">
          <h2>
            {running
              ? t("emptyRunning")
              : data.hiddenDecided > 0 && !showDecided
              ? t("emptyDecided")
              : t("emptyNone")}
          </h2>
          <p className="lede">
            {data.hiddenDecided > 0 && !showDecided && !running
              ? t("emptyDecidedHint")
              : running
              ? t("emptyRunning")
              : t("emptyNone")}
          </p>
        </div>
      ) : (
        <>
          <div className="results-head">
            <div>
              {data.personalized ? <p className="eyebrow">{t("shortlistEyebrow")}</p> : null}
              <h2>{t("resultsEyebrow")}</h2>
              <p className="results-sub">
                {data.shortlisted ? (
                  <>
                    <strong>{data.total}</strong> / {data.matchTotal} · {t("shortlistSub")}
                  </>
                ) : (
                  <>
                    <strong>{data.total}</strong> ·{" "}
                    {data.personalized ? t("matchesSubPersonal") : t("matchesSub")}
                  </>
                )}
              </p>
            </div>
            <div className="results-tools">
              {data.shortlisted ? (
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={() => {
                    setPage(1)
                    setFullList(true)
                  }}
                >
                  {t("showRest")}
                </button>
              ) : data.hasProfile && fullList ? (
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={() => {
                    setPage(1)
                    setFullList(false)
                  }}
                >
                  {t("showShortlist")}
                </button>
              ) : null}
              <Link className="btn btn-ink btn-sm" href={`/searches/${id}/triage`}>
                {t("triageCta")}
              </Link>
            </div>
          </div>
          <div className="section-head">
            <h2 className="sr-only">
              {data.total} offer{data.total === 1 ? "" : "s"}
              {data.pageCount > 1 ? ` · page ${data.page} of ${data.pageCount}` : ""}
            </h2>
            <button className="chip" type="button" onClick={() => setShowScores((value) => !value)}>
              {showScores ? "Hide score parts" : "Show score parts"}
            </button>
          </div>
          <p className="hint triage-hint">
            J or ← rejects the highlighted offer. K or → marks it interested. Z undoes, including
            several steps.
          </p>
          {narrow && !showDecided ? (
            <SwipeStack
              offers={data.results.map((result) => ({
                id: result.id,
                title: result.job.title,
                company: result.job.company,
                location: result.job.locationText || "Location not stated",
                reason: result.reason,
                score: Math.round(result.score + (result.feedbackDelta || 0)),
              }))}
              onOpen={(offer) => setDetailId(offer.id)}
              onDecide={(offer, action) => {
                const result = data.results.find((item) => item.id === offer.id)
                if (!result) return
                void decide({
                  matchId: result.id,
                  jobId: result.job.id,
                  label: result.job.title,
                  from: statusFromStamps(result.interestedAt, result.dismissedAt),
                  to: action,
                })
              }}
            />
          ) : null}
          <div className={narrow && !showDecided ? "results desktop-results" : "results"}>
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
              const shown = Math.round(result.score + (result.feedbackDelta || 0))
              const status = statusFromStamps(result.interestedAt, result.dismissedAt)
              const choose = (to: "interested" | "rejected" | "undecided") =>
                decide({
                  matchId: result.id,
                  jobId: result.job.id,
                  label: result.job.title,
                  from: status,
                  to,
                })
              return (
                <article
                  className="result"
                  id={`offer-${result.id}`}
                  key={result.id}
                  tabIndex={0}
                  aria-current={highlightId === result.id ? "true" : undefined}
                  onFocus={() => setHighlightId(result.id)}
                >
                  <div
                    className="score"
                    data-band={
                      pack.band === "strong" || pack.band === "good" || pack.band === "weak"
                        ? pack.band
                        : shown >= 80
                        ? "strong"
                        : shown >= 60
                        ? "good"
                        : "weak"
                    }
                    title={pack.band ? `${pack.band} match, out of 100` : "Match score out of 100"}
                  >
                    {shown}
                    {pack.band ? <span className="meta">{pack.band}</span> : null}
                  </div>
                  <div>
                    <header>
                      <div>
                        <p className="company">{result.job.company}</p>
                        <h3>
                          <button
                            type="button"
                            className="title-button"
                            onClick={() => {
                              setHighlightId(result.id)
                              setDetailId(result.id)
                            }}
                          >
                            {result.job.title}
                          </button>
                        </h3>
                      </div>
                      <div className="badges">
                        {result.isNew ? <span className="badge new">New</span> : null}
                        {result.feedbackDelta < 0 ? (
                          <span className="badge">Similar to a rejected offer</span>
                        ) : null}
                        {status === "interested" ? <span className="badge">Interested</span> : null}
                        {status === "rejected" ? <span className="badge">Rejected</span> : null}
                        {result.job.status === "POSSIBLY_CLOSED" ? (
                          <span className="badge">Possibly closed</span>
                        ) : null}
                        <span className="badge mode">{result.job.workplaceType}</span>
                        {result.job.employmentType ? (
                          <span className="badge">{result.job.employmentType}</span>
                        ) : null}
                      </div>
                    </header>
                    <div className="facts">
                      <span>{result.job.locationText || "Location not stated"}</span>
                      {salary ? <span>{salary}</span> : <span>salary not disclosed</span>}
                      <span>Published {formatWhen(result.job.publishedAt)}</span>
                      <span>First seen {formatWhen(result.job.firstSeenAt)}</span>
                      <span>{result.job.sourceType.toLowerCase().replace(/_/g, " ")}</span>
                    </div>
                    {pack.profile ? <p className="why-label">{t("whyFitsYou")}</p> : null}
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
                    <TriageButtons
                      onReject={() => void choose("rejected")}
                      onInterested={() => void choose("interested")}
                    />
                    <div className="actions">
                      {safeHref(result.job.originalUrl) ? (
                        <a
                          className="text-button"
                          href={safeHref(result.job.originalUrl)!}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Open original
                        </a>
                      ) : null}
                      {status !== "undecided" ? (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => void choose("undecided")}
                        >
                          Undecided
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          <OfferDialog
            offer={(() => {
              const result = data.results.find((item) => item.id === detailId)
              if (!result) return null
              return {
                title: result.job.title,
                company: result.job.company,
                location: result.job.locationText || "Location not stated",
                reason: result.reason,
                excerpt: result.job.descriptionText.slice(0, 1200),
                href: safeHref(result.job.originalUrl),
              }
            })()}
            onClose={() => setDetailId(null)}
            onReject={() => {
              const result = data.results.find((item) => item.id === detailId)
              if (!result) return
              void decide({
                matchId: result.id,
                jobId: result.job.id,
                label: result.job.title,
                from: statusFromStamps(result.interestedAt, result.dismissedAt),
                to: "rejected",
              }).then(() => setDetailId(null))
            }}
            onInterested={() => {
              const result = data.results.find((item) => item.id === detailId)
              if (!result) return
              void decide({
                matchId: result.id,
                jobId: result.job.id,
                label: result.job.title,
                from: statusFromStamps(result.interestedAt, result.dismissedAt),
                to: "interested",
              }).then(() => setDetailId(null))
            }}
          />
          <UndoToast step={toast} canUndo={canUndo} onUndo={() => void undo()} />
          {data.pageCount > 1 ? (
            <div className="chips" style={{ marginTop: 16 }}>
              <Button
                variant="outline"
                disabled={data.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={data.page >= data.pageCount}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
      <details className="panel other-links">
        <summary>{t("otherPlaces")}</summary>
        <div className="chips">
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
      </details>
    </div>
  )
}
