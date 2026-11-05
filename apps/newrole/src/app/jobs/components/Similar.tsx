"use client"

import Link from "next/link"
import { Eye, Heart, X } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { T } from "src/app/i18n/copy"
import { Button } from "@newrole/ui/Button"
import { scoreBand } from "@newrole/ui/interactive"
import { CompanyInitial } from "@newrole/ui/primitives"
import type { RankedOffer } from "src/server/preferences/types"
import type { Verdict } from "../types"

/** The header already names the offer; keep only the "what we matched on" part of the basis. */
function trimBasis(basis: string): string {
  if (!/^(Podobne do|Similar to|Like)\b/i.test(basis)) return basis
  const at = basis.indexOf(" · ")
  return at > 0 ? basis.slice(at + 3) : ""
}

function modeLabel(mode: RankedOffer["workplace"], t: T): string | null {
  if (mode === "remote") return t("mode.remote")
  if (mode === "hybrid") return t("mode.hybrid")
  if (mode === "onsite") return t("mode.onsite")
  return null
}

/** Compact similar-offer card (260 × 148). */
export function MiniCard({
  offer,
  verdict,
  onOpen,
  onVerdict,
}: {
  offer: RankedOffer
  verdict?: Verdict | null
  onOpen: (id: string) => void
  onVerdict: (offer: RankedOffer, verdict: Verdict) => void
}) {
  const { t } = useCopy()
  const facts = [offer.salary, modeLabel(offer.workplace, t), offer.location]
    .filter(Boolean)
    .join(" · ")
  return (
    <article className="mini">
      <div className="mini__top">
        <CompanyInitial name={offer.viaIntermediary ? "?" : offer.company} />
        <strong title={offer.viaIntermediary ? t("via.tip", { name: offer.company }) : undefined}>
          {offer.viaIntermediary ? t("via.mini") : offer.company}
        </strong>
        <span
          className="score-pill"
          data-band={scoreBand(offer.score)}
          aria-label={t("card.score", { n: offer.score })}
        >
          {offer.score}
        </span>
      </div>
      <h4 className="mini__title">
        <Link
          href={`/jobs/${offer.id}`}
          prefetch={false}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey) return
            event.preventDefault()
            onOpen(offer.id)
          }}
        >
          {offer.title}
        </Link>
      </h4>
      <p className="mini__facts">{facts || " "}</p>
      <div className="mini__actions">
        <Button
          variant={verdict === "LIKE" ? "soft" : "ghost"}
          size="sm"
          iconOnly
          aria-label={t("act.like")}
          aria-pressed={verdict === "LIKE"}
          onClick={() => onVerdict(offer, "LIKE")}
          icon={<Heart className="heart" />}
        />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("act.pass")}
          aria-pressed={verdict === "DISLIKE"}
          onClick={() => onVerdict(offer, "DISLIKE")}
          icon={<X />}
        />
      </div>
    </article>
  )
}

export function SimilarRow({
  anchorId,
  title,
  company,
  basis,
  offers,
  loading,
  verdicts,
  onOpen,
  onVerdict,
  onWatch,
  watching,
}: {
  anchorId: string
  title: string
  company: string
  basis: string | null
  offers: RankedOffer[]
  loading: boolean
  verdicts: Map<string, Verdict>
  onOpen: (id: string) => void
  onVerdict: (offer: RankedOffer, verdict: Verdict) => void
  onWatch?: () => void
  watching?: boolean
}) {
  const { t } = useCopy()
  return (
    <section
      className="similar"
      id={`similar-${anchorId}`}
      aria-label={t("similar.title", { title, company })}
      tabIndex={-1}
    >
      <div className="similar__head">
        <strong>{t("similar.title", { title, company })}</strong>
        {basis ? <span>{trimBasis(basis)}</span> : null}
      </div>
      {loading ? (
        <div className="scroller" aria-hidden>
          {[0, 1, 2].map((index) => (
            <div key={index} className="mini">
              <span className="skel" style={{ width: "60%", height: 14 }} />
              <span className="skel" style={{ width: "90%", height: 32 }} />
              <span className="skel" style={{ width: "50%", height: 12 }} />
            </div>
          ))}
        </div>
      ) : offers.length ? (
        <div className="scroller">
          {offers.map((offer) => (
            <MiniCard
              key={offer.id}
              offer={offer}
              verdict={verdicts.get(offer.id)}
              onOpen={onOpen}
              onVerdict={onVerdict}
            />
          ))}
          <Link className="similar-more" href={`/jobs?similar=${anchorId}`}>
            <span className="row" style={{ gap: 6 }}>
              <Eye width={16} height={16} aria-hidden /> {t("similar.all").replace(" →", "")}
            </span>
          </Link>
        </div>
      ) : (
        <div className="row t-sm muted">
          <span>{t("similar.none", { company })}</span>
          {onWatch ? (
            <Button
              size="sm"
              variant={watching ? "soft" : "outline"}
              onClick={onWatch}
              disabled={watching}
            >
              {watching ? t("co.watchingBtn") : t("co.watch")}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  )
}
