"use client"

import { useEffect, useRef } from "react"
import { MatchWhy, type FitLine } from "src/app/components/match/MatchWhy"
import { Button } from "src/app/components/ui/button"
import { TriageButtons } from "../TriageButtons"

export function OfferDialog({
  offer,
  onClose,
  onReject,
  onInterested,
}: {
  offer: {
    title: string
    company: string
    location: string
    reason: string
    fitLines?: FitLine[]
    hasProfile?: boolean
    excerpt: string
    href: string | null
  } | null
  onClose: () => void
  onReject: () => void
  onInterested: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (offer && !node.open) node.showModal()
    if (!offer && node.open) node.close()
  }, [offer])

  return (
    <dialog
      ref={dialog}
      className="offer-dialog"
      aria-label={offer ? `${offer.title} at ${offer.company}` : "Offer"}
      onClose={onClose}
    >
      {offer ? (
        <div className="stack">
          <p className="company">{offer.company}</p>
          <h2>{offer.title}</h2>
          <p className="meta">{offer.location}</p>
          <MatchWhy
            mode={offer.hasProfile && offer.fitLines?.length ? "you" : "phrase"}
            lines={offer.fitLines}
            reason={offer.reason}
          />
          {offer.excerpt ? <p className="prose">{offer.excerpt}</p> : null}
          <TriageButtons onReject={onReject} onInterested={onInterested} />
          <div className="actions">
            {offer.href ? (
              <Button asChild>
                <a href={offer.href} target="_blank" rel="noreferrer noopener">
                  Open original
                </a>
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  )
}
