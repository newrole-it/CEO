"use client"

import { useEffect, useRef, useState, type PointerEvent } from "react"
import { swipeDecision } from "src/shared/triage"
import { TriageButtons } from "../TriageButtons"

export type SwipeOffer = {
  id: string
  title: string
  company: string
  location: string
  reason: string
  score: number
}

export function SwipeStack({
  offers,
  onDecide,
  onOpen,
}: {
  offers: SwipeOffer[]
  onDecide: (offer: SwipeOffer, action: "rejected" | "interested") => void
  onOpen: (offer: SwipeOffer) => void
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false })
  const [exit, setExit] = useState<-1 | 0 | 1>(0)
  const [reduce, setReduce] = useState(false)
  const start = useRef({ x: 0, y: 0, t: 0, pointer: -1 })
  const top = offers[0]
  const behind = offers[1]

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setReduce(media.matches)
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    setDrag({ x: 0, y: 0, active: false })
    setExit(0)
  }, [top?.id])

  async function commit(action: "rejected" | "interested") {
    if (!top) return
    setExit(action === "rejected" ? -1 : 1)
    if (!reduce) await new Promise((resolve) => window.setTimeout(resolve, 280))
    onDecide(top, action)
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, a")) return
    start.current = {
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
      pointer: event.pointerId,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ x: 0, y: 0, active: true })
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (!drag.active || event.pointerId !== start.current.pointer) return
    setDrag({
      x: event.clientX - start.current.x,
      y: event.clientY - start.current.y,
      active: true,
    })
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    if (!drag.active || event.pointerId !== start.current.pointer) return
    const dx = event.clientX - start.current.x
    const dt = Math.max(16, performance.now() - start.current.t)
    const decision = swipeDecision(dx, dx / dt)
    setDrag({ x: 0, y: 0, active: false })
    if (decision) void commit(decision)
  }

  if (!top) {
    return (
      <div className="empty-card">
        <h2>This page is triaged</h2>
        <p className="lede">Show decided offers, or open the next page for more.</p>
      </div>
    )
  }

  const x = exit === 0 ? drag.x : exit * 520
  const rotate = reduce ? 0 : Math.max(-12, Math.min(12, x / 18))
  const label = Math.min(1, Math.abs(drag.x) / 120)

  return (
    <div className="swipe-stack">
      <p className="hint">
        Swipe left to reject, right if you are interested. The buttons do the same.
      </p>
      <div className="swipe-stage">
        {behind ? <article className="swipe-card swipe-behind" aria-hidden="true" /> : null}
        <article
          className="swipe-card"
          data-swipe-card="top"
          aria-label={`${top.title} at ${top.company}`}
          style={{
            transform: `translate3d(${x}px, ${
              drag.active ? drag.y * 0.15 : 0
            }px, 0) rotate(${rotate}deg)`,
            transition: drag.active || reduce ? "none" : "transform 280ms ease",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="swipe-label swipe-no" style={{ opacity: drag.x < 0 ? label : 0 }}>
            Reject
          </span>
          <span className="swipe-label swipe-yes" style={{ opacity: drag.x > 0 ? label : 0 }}>
            Interested
          </span>
          <p className="company">{top.company}</p>
          <h3>{top.title}</h3>
          <p className="meta">{top.location}</p>
          <p className="reason">{top.reason}</p>
          <p className="score-inline">{top.score}</p>
          <button type="button" className="text-button" onClick={() => onOpen(top)}>
            Details
          </button>
        </article>
      </div>
      <TriageButtons
        onReject={() => void commit("rejected")}
        onInterested={() => void commit("interested")}
      />
    </div>
  )
}
