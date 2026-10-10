"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useMutation, useQuery } from "@blitzjs/rpc"
import listLibrary from "./queries/listLibrary"
import markMatch from "./mutations/markMatch"
import { Button } from "src/app/components/ui/button"

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
  const [mark] = useMutation(markMatch)
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
            ? "Offers you marked interested, across saved searches."
            : "Offers you rejected. They stay out of the default result list until you restore them."}
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
                  <div className="actions">
                    {href ? (
                      <Button asChild>
                        <a href={href} target="_blank" rel="noreferrer noopener">
                          Open original
                        </a>
                      </Button>
                    ) : null}
                    {kind === "rejected" ? (
                      <Button
                        variant="outline"
                        onClick={async () => {
                          await mark({ id: result.id, action: "restore" })
                          await refetch()
                        }}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={async () => {
                          await mark({ id: result.id, action: "dismiss" })
                          await refetch()
                        }}
                      >
                        Reject
                      </Button>
                    )}
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
    </div>
  )
}
