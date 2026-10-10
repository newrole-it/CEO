"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useQuery } from "@blitzjs/rpc"
import { statusFromStamps } from "src/shared/triage"
import listLibrary from "./queries/listLibrary"
import { Button } from "src/app/components/ui/button"
import { TriageButtons } from "./TriageButtons"
import { UndoToast } from "./UndoToast"
import { useOfferDecisions } from "./useOfferDecisions"

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

export function LibraryScreen({ kind }: { kind: "interested" | "rejected" }) {
  const [mounted, setMounted] = useState(false)
  const [page, setPage] = useState(1)
  useEffect(() => setMounted(true), [])
  const [data, { isLoading, error, refetch }] = useQuery(
    listLibrary,
    { kind, page },
    { suspense: false, enabled: mounted }
  )
  const { decide, undo, toast, canUndo } = useOfferDecisions(async () => {
    await refetch()
  })
  const title = kind === "interested" ? "Interested" : "Rejected"
  if (!mounted || (isLoading && !data))
    return <div className="empty-card">Loading {title.toLowerCase()} offers…</div>
  if (error || !data) {
    return (
      <div className="error-card">
        <h1 className="h1" style={{ fontSize: 36 }}>
          Sign in to see {title.toLowerCase()} offers
        </h1>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    )
  }
  return (
    <div>
      <section className="hero">
        <p className="kicker">Library</p>
        <h1>{title}</h1>
        <p className="lede">
          {kind === "interested"
            ? "Offers you marked interested. Move one to rejected, or set it back to undecided."
            : "Offers you rejected. They stay out of the default result list until you mark them interested or undecided."}
        </p>
      </section>
      {data.total === 0 ? (
        <div className="empty-card">
          <h2>Nothing here yet</h2>
          <p className="lede">Open a search and mark an offer.</p>
        </div>
      ) : (
        <div className="results">
          {data.results.map((result) => {
            const href = safeHref(result.job.originalUrl)
            return (
              <article className="result-card" key={result.id}>
                <div className="score">{Math.round(result.score)}</div>
                <div>
                  <p className="company">{result.job.company}</p>
                  <h3>{result.job.title}</h3>
                  <div className="facts">
                    <span>{result.job.locationText || "Location not stated"}</span>
                    <span>{result.job.workplaceType}</span>
                    <Link href={`/searches/${result.searchId}`}>{result.phrase}</Link>
                  </div>
                  <p className="why-label">Why it matches you</p>
                  <p className="reason">{result.reason}</p>
                  <TriageButtons
                    onReject={() =>
                      void decide({
                        matchId: result.id,
                        jobId: result.jobId,
                        label: result.job.title,
                        from: statusFromStamps(result.interestedAt, result.dismissedAt),
                        to: "rejected",
                      })
                    }
                    onInterested={() =>
                      void decide({
                        matchId: result.id,
                        jobId: result.jobId,
                        label: result.job.title,
                        from: statusFromStamps(result.interestedAt, result.dismissedAt),
                        to: "interested",
                      })
                    }
                  />
                  <div className="actions">
                    {href ? (
                      <a
                        className="text-button"
                        href={href}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        Open original
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        void decide({
                          matchId: result.id,
                          jobId: result.jobId,
                          label: result.job.title,
                          from: statusFromStamps(result.interestedAt, result.dismissedAt),
                          to: "undecided",
                        })
                      }
                    >
                      Undecided
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
      {data.pageCount > 1 ? (
        <div className="chips">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page >= data.pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
      <UndoToast step={toast} canUndo={canUndo} onUndo={() => void undo()} />
    </div>
  )
}
