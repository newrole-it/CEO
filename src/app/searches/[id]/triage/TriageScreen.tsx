"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useQuery } from "@blitzjs/rpc"
import getSearch from "src/app/searches/queries/getSearch"
import { UndoToast } from "src/app/searches/UndoToast"
import { useOfferDecisions } from "src/app/searches/useOfferDecisions"
import { MatchWhy } from "src/app/components/match/MatchWhy"
import { useCopy } from "src/app/i18n/Locale"
import { statusFromStamps, swipeDecision } from "src/shared/triage"

export function TriageScreen({ id, guest }: { id: string; guest: boolean }) {
  const { t, locale } = useCopy()
  const [mounted, setMounted] = useState(false)
  const [drag, setDrag] = useState(0)
  const [exit, setExit] = useState<-1 | 0 | 1>(0)
  useEffect(() => setMounted(true), [])
  const [data, { refetch }] = useQuery(
    getSearch,
    { id, page: 1, locale },
    { suspense: false, enabled: mounted }
  )
  const { decide, undo, toast, canUndo } = useOfferDecisions(async () => {
    await refetch()
  })
  const offers = data?.results ?? []
  const top = offers[0]
  const rest = offers.slice(1, 3)

  async function commit(action: "rejected" | "interested") {
    if (!top) return
    setExit(action === "rejected" ? -1 : 1)
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!reduce) await new Promise((resolve) => window.setTimeout(resolve, 280))
    await decide({
      matchId: top.id,
      jobId: top.job.id,
      label: top.job.title,
      from: statusFromStamps(top.interestedAt, top.dismissedAt),
      to: action,
    })
    setExit(0)
    setDrag(0)
  }

  const commitRef = useRef(commit)
  commitRef.current = commit
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, a, button")) return
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault()
        void commitRef.current(event.key === "ArrowLeft" ? "rejected" : "interested")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const x = exit === 0 ? drag : exit * 520

  return (
    <main id="main" className="triage">
      <div className="container">
        <div className="triage-head">
          <div>
            <Link className="text-link back-link" href={`/searches/${id}`}>
              {t("backResults")}
            </Link>
            <h1 className="triage-title">
              <span className="eyebrow">{t("triageEyebrow")}</span>
              <span>{data?.search.phrase || "…"}</span>
            </h1>
          </div>
          <nav className="tabs" aria-label={t("tabQueue")}>
            <Link href={`/searches/${id}/triage`} aria-current="page">
              {t("tabQueue")} <span className="tab-count">{data?.total ?? 0}</span>
            </Link>
            <Link href="/interested">{t("navInterested")}</Link>
            <Link href="/rejected">{t("navRejected")}</Link>
          </nav>
        </div>
        {guest ? <p className="guest-note">{t("guestTriage")}</p> : null}
        {!data ? (
          <p className="hint">…</p>
        ) : !top ? (
          <div className="stack-done">
            <h2>{t("doneTitle")}</h2>
            <p>{t("doneBody")}</p>
            <div className="cta-row">
              <Link className="btn btn-primary" href="/interested">
                {t("seeInterested")}
              </Link>
              <Link className="btn btn-outline" href={`/searches/${id}`}>
                {t("backResults")}
              </Link>
            </div>
          </div>
        ) : (
          <section className="triage-stage">
            <div className="decide decide-left">
              <button
                className="decide-btn decide-reject"
                type="button"
                aria-keyshortcuts="ArrowLeft"
                onClick={() => void commit("rejected")}
              >
                {t("reject")}
              </button>
              <kbd className="kbd">←</kbd>
            </div>
            <div className="stack">
              {rest.map((offer, index) => (
                <article
                  key={offer.id}
                  className="tcard"
                  data-depth={2 - index}
                  aria-hidden="true"
                  inert
                />
              ))}
              <article
                className={`tcard${drag ? " is-dragging" : ""}`}
                data-depth="0"
                data-swipe-card="top"
                style={{ transform: `translate3d(${x}px, 0, 0) rotate(${x / 20}deg)` }}
                onPointerDown={(event) => {
                  if ((event.target as HTMLElement).closest("a, button")) return
                  const startX = event.clientX
                  const pointer = event.pointerId
                  try {
                    event.currentTarget.setPointerCapture(pointer)
                  } catch {
                    // Drag still works when the browser refuses capture.
                  }
                  const move = (ev: PointerEvent) => {
                    if (ev.pointerId !== pointer) return
                    setDrag(ev.clientX - startX)
                  }
                  const up = (ev: PointerEvent) => {
                    if (ev.pointerId !== pointer) return
                    const dx = ev.clientX - startX
                    const decision = swipeDecision(dx, dx / 200)
                    window.removeEventListener("pointermove", move)
                    window.removeEventListener("pointerup", up)
                    if (decision) void commit(decision)
                    else setDrag(0)
                  }
                  window.addEventListener("pointermove", move)
                  window.addEventListener("pointerup", up)
                }}
              >
                <span
                  className="stamp stamp-reject"
                  style={{ opacity: drag < 0 ? Math.min(1, Math.abs(drag) / 110) : 0 }}
                >
                  {t("reject")}
                </span>
                <span
                  className="stamp stamp-like"
                  style={{ opacity: drag > 0 ? Math.min(1, drag / 110) : 0 }}
                >
                  {t("interested")}
                </span>
                <div className="tcard-top">
                  <div className="score" data-band={band(top.score)}>
                    {Math.round(top.score + (top.feedbackDelta || 0))}
                  </div>
                  <div>
                    <p className="result-company">{top.job.company}</p>
                    <h2 className="tcard-title">{top.job.title}</h2>
                  </div>
                </div>
                <p className="facts">
                  <span>{top.job.locationText || "—"}</span>
                  <span>{top.job.workplaceType}</span>
                </p>
                <MatchWhy
                  mode={data?.hasProfile && top.fitLines.length ? "you" : "phrase"}
                  lines={top.fitLines}
                  reason={top.reason}
                />
                <div className="tcard-foot">
                  <span className="source">
                    {top.job.sourceType.toLowerCase().replace(/_/g, " ")}
                  </span>
                  {top.job.originalUrl ? (
                    <a href={top.job.originalUrl} target="_blank" rel="noreferrer noopener">
                      {t("openOriginal")}
                    </a>
                  ) : null}
                </div>
              </article>
            </div>
            <div className="decide decide-right">
              <button
                className="decide-btn decide-like"
                type="button"
                aria-keyshortcuts="ArrowRight"
                onClick={() => void commit("interested")}
              >
                {t("interested")}
              </button>
              <kbd className="kbd">→</kbd>
            </div>
          </section>
        )}
        <p className="triage-hint">
          <kbd className="kbd">←</kbd> {t("reject")} · <kbd className="kbd">→</kbd>{" "}
          {t("interested")} · <kbd className="kbd">Z</kbd> {t("undo")}
        </p>
        <p className="triage-hint triage-hint-touch">{t("hintSwipe")}</p>
        <UndoToast step={toast} canUndo={canUndo} onUndo={() => void undo()} />
      </div>
    </main>
  )
}

function band(score: number): "strong" | "good" | "weak" {
  if (score >= 80) return "strong"
  if (score >= 60) return "good"
  return "weak"
}
