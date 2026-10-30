"use client"

import Link from "next/link"
import { forwardRef, useRef, type ReactNode } from "react"
import { CircleCheck, Heart, X } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button } from "src/app/components/ds/Button"
import { ScoreRing } from "src/app/components/ds/interactive"
import { CompanyInitial } from "src/app/components/ds/primitives"
import { cx } from "src/app/components/ds/cx"
import type { CardOffer, Verdict } from "../types"
import { placeText } from "../format"
import { Facts, Freshness, Reasons, SourceBadge, orderReasons } from "./OfferBits"

export type CardHandlers = {
  onOpen?: (offer: CardOffer) => void
  onVerdict?: (offer: CardOffer, verdict: Verdict) => void
  onFocusCard?: (offer: CardOffer) => void
  /** Called with ±1 when a swipe passes the threshold (mobile). */
  onSwipe?: (offer: CardOffer, direction: 1 | -1) => void
}

export const OfferCard = forwardRef<
  HTMLElement,
  {
    offer: CardOffer
    verdict?: Verdict | null
    active?: boolean
    showScore?: boolean
    leaving?: 1 | -1 | null
    demo?: boolean
    children?: ReactNode
    swipe?: boolean
  } & CardHandlers
>(function OfferCard(
  { offer, verdict, active, showScore = true, leaving, demo, children, swipe, onOpen, onVerdict, onFocusCard, onSwipe },
  ref
) {
  const { t, locale } = useCopy()
  const liked = verdict === "LIKE"
  const applied = verdict === "APPLIED"
  const reasons = orderReasons(offer.reasons)
  const href = `/jobs/${offer.id}`
  const drag = useRef<{ x: number; y: number; at: number; dx: number; locked: boolean | null } | null>(null)
  const body = useRef<HTMLDivElement>(null)

  function open(event: React.MouseEvent) {
    if (demo) return event.preventDefault()
    if (!onOpen) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    onOpen(offer)
  }

  const swipeHandlers =
    swipe && onSwipe
      ? {
          onPointerDown: (event: React.PointerEvent) => {
            if (event.pointerType === "mouse") return
            if ((event.target as HTMLElement).closest("button, a.fact__info, .like-panel")) return
            drag.current = { x: event.clientX, y: event.clientY, at: Date.now(), dx: 0, locked: null }
          },
          onPointerMove: (event: React.PointerEvent) => {
            const state = drag.current
            const node = body.current
            if (!state || !node) return
            const dx = event.clientX - state.x
            const dy = event.clientY - state.y
            if (state.locked == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
              state.locked = Math.abs(dx) > Math.abs(dy)
            }
            if (!state.locked) return
            state.dx = dx
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
            const wrap = node.parentElement
            wrap?.classList.add("is-dragging")
            if (!reduced) node.style.transform = `translateX(${dx}px) rotate(${dx / 60}deg)`
            const like = wrap?.querySelector<HTMLElement>(".swipe__bg--like")
            const pass = wrap?.querySelector<HTMLElement>(".swipe__bg--pass")
            const ratio = Math.min(1, Math.abs(dx) / (node.offsetWidth * 0.35))
            if (like) like.style.opacity = dx > 0 ? String(ratio) : "0"
            if (pass) pass.style.opacity = dx < 0 ? String(ratio) : "0"
            if (ratio >= 1 && !(node.dataset.buzzed === "1")) {
              node.dataset.buzzed = "1"
              navigator.vibrate?.(10)
            }
            if (ratio < 1) node.dataset.buzzed = ""
          },
          onPointerUp: () => {
            const state = drag.current
            const node = body.current
            drag.current = null
            if (!state || !node || !state.locked) return
            const wrap = node.parentElement
            wrap?.classList.remove("is-dragging")
            const velocity = Math.abs(state.dx) / Math.max(1, Date.now() - state.at)
            const past = Math.abs(state.dx) >= node.offsetWidth * 0.35 || velocity > 0.5
            wrap?.querySelectorAll<HTMLElement>(".swipe__bg").forEach((bg) => (bg.style.opacity = "0"))
            node.style.transform = ""
            if (past) onSwipe(offer, state.dx > 0 ? 1 : -1)
          },
          onPointerCancel: () => {
            drag.current = null
            if (body.current) body.current.style.transform = ""
          },
        }
      : {}

  const card = (
    <article
      ref={(node) => {
        body.current = node as HTMLDivElement | null
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      }}
      className={cx("ocard", active && "is-active", leaving && "is-leaving", demo && "demo")}
      style={leaving ? ({ ["--leave" as string]: `${leaving * 24}px` } as React.CSSProperties) : undefined}
      data-offer={offer.id}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a, .like-panel, .compact-prompt")) return
        if (demo || !onOpen) return
        onOpen(offer)
      }}
      onFocus={() => onFocusCard?.(offer)}
      {...swipeHandlers}
    >
      <div className="ocard__meta">
        <div className="ocard__co">
          <CompanyInitial name={offer.company} />
          <strong>{offer.company}</strong>
          <span aria-hidden>·</span>
          <span className="place">{placeText(offer, t, locale)}</span>
        </div>
        <div className="ocard__tags">
          <SourceBadge offer={offer} t={t} />
          <Freshness iso={offer.firstSeenAt} t={t} locale={locale} />
        </div>
      </div>
      <div className="ocard__body">
        <div className="ocard__main">
          <h3 className="ocard__title">
            <Link href={href} onClick={open} prefetch={false}>
              {offer.title}
            </Link>
          </h3>
          <Facts offer={offer} t={t} locale={locale} />
          <Reasons reasons={reasons} />
        </div>
        {showScore && offer.score != null ? (
          <ScoreRing score={offer.score} caption={t("card.scoreCaption")} drawKey={offer.id} />
        ) : null}
      </div>
      <div className="ocard__actions">
        <Button
          variant="ghost"
          size="sm"
          icon={<X />}
          kbd="J"
          aria-keyshortcuts="J"
          aria-pressed={verdict === "DISLIKE"}
          tabIndex={demo ? -1 : undefined}
          aria-label={t("act.pass")}
          onClick={() => onVerdict?.(offer, "DISLIKE")}
        >
          <span className="lbl-long">{t("act.pass")}</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Heart className="heart" />}
          kbd="K"
          aria-keyshortcuts="K"
          aria-pressed={liked}
          tabIndex={demo ? -1 : undefined}
          onClick={() => onVerdict?.(offer, "LIKE")}
        >
          {liked ? t("act.liked") : t("act.like")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<CircleCheck />}
          kbd="A"
          aria-keyshortcuts="A"
          aria-pressed={applied}
          tabIndex={demo ? -1 : undefined}
          aria-label={t("act.applied")}
          onClick={() => onVerdict?.(offer, "APPLIED")}
        >
          <span className="lbl-long">{t("act.applied")}</span>
        </Button>
        <span className="spacer" />
        {offer.url ? (
          <a
            className="link t-sm"
            href={offer.url}
            target="_blank"
            rel="noreferrer noopener"
            tabIndex={demo ? -1 : undefined}
          >
            {t("act.open")}
            <span className="sr-only"> {t("common.newTab")}</span>
          </a>
        ) : null}
      </div>
      {children}
    </article>
  )

  if (!swipe) return card
  return (
    <div className="swipe">
      <div className="swipe__bg swipe__bg--like" aria-hidden>
        <Heart />
      </div>
      <div className="swipe__bg swipe__bg--pass" aria-hidden>
        <X />
      </div>
      {card}
    </div>
  )
})
