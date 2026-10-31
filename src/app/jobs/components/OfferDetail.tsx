"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { invoke } from "@blitzjs/rpc"
import { ChevronDown, CircleCheck, ExternalLink, FileText, Heart, Share2, X } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button, ButtonLink } from "src/app/components/ds/Button"
import { ScoreRing, useIsMobile, useToast } from "src/app/components/ds/interactive"
import { Badge, CompanyInitial, Skeleton } from "src/app/components/ds/primitives"
import { GITHUB_ISSUES } from "src/app/components/site/links"
import getCompanyForJob, { type CompanyInfo } from "src/app/companies/queries/getCompanyForJob"
import watchCompany from "src/app/companies/mutations/watchCompany"
import getJobDocuments from "src/app/cv/queries/getJobDocuments"
import type { OfferDetail as Detail } from "src/server/preferences/detail"
import type { RankedOffer } from "src/server/preferences/types"
import type { Verdict } from "../types"
import { shortDate } from "../format"
import { Facts, Freshness, Reasons, SourceBadge } from "./OfferBits"
import { MiniCard } from "./Similar"
import { useFeedback } from "../useFeedback"

const PART_KEY: Record<string, CopyKey> = {
  title: "od.part.title",
  location: "od.part.location",
  seniority: "od.part.seniority",
  salary: "od.part.salary",
  freshness: "od.part.fresh",
  source: "od.part.source",
}

export function OfferDetailView({
  detail,
  loading,
  error,
  verdict,
  onVerdict,
  panel,
  mode,
  onClose,
  onPrev,
  onNext,
  onOpenOther,
  titleId,
}: {
  detail: Detail | null
  loading: boolean
  error?: boolean
  verdict: Verdict | null
  onVerdict: (verdict: Verdict) => void
  panel?: ReactNode
  mode: "drawer" | "page"
  onClose?: () => void
  onPrev?: (() => void) | null
  onNext?: (() => void) | null
  onOpenOther?: (id: string) => void
  titleId: string
}) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const feedback = useFeedback()
  const mobile = useIsMobile()
  const offer = detail?.offer
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [similar, setSimilar] = useState<RankedOffer[] | null>(null)
  const [watchBusy, setWatchBusy] = useState(false)
  const [similarVerdicts, setSimilarVerdicts] = useState(new Map<string, Verdict>())
  const [hasTailoredCv, setHasTailoredCv] = useState(false)

  const jobId = offer?.id
  useEffect(() => {
    if (!jobId) return
    let live = true
    setCompany(null)
    setSimilar(null)
    setHasTailoredCv(false)
    void invoke(getCompanyForJob, { jobId }).then((info) => live && setCompany(info), () => {})
    void invoke(getJobDocuments, { jobId }).then(
      (documents) => live && setHasTailoredCv(Boolean(documents.cvId)),
      () => {}
    )
    void feedback.similar(jobId).then((result) => live && setSimilar(result?.offers.slice(0, 4) ?? []))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  async function toggleWatch() {
    if (!company || company.watching) return
    setWatchBusy(true)
    try {
      await invoke(watchCompany, { companyId: company.companyId, source: "user" })
      setCompany({ ...company, watching: true })
    } catch {
      toast.show({ message: t("err.save"), tone: "danger" })
    } finally {
      setWatchBusy(false)
    }
  }

  async function share() {
    if (!offer) return
    const url = `${window.location.origin}/jobs/${offer.id}`
    try {
      if (navigator.share) await navigator.share({ title: offer.title, url })
      else {
        await navigator.clipboard.writeText(url)
        toast.show({ message: t("od.linkCopied") })
      }
    } catch {}
  }

  const top =
    mode === "drawer" ? (
      <div className="od__top">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("common.close")}
          onClick={onClose}
          icon={mobile ? <ChevronDown /> : <X />}
        />
        <div className="od__nav">
          <Button variant="ghost" size="sm" iconOnly aria-label={t("od.share")} onClick={() => void share()} icon={<Share2 />} />
          {onPrev !== undefined ? (
            <Button variant="ghost" size="sm" disabled={!onPrev} onClick={() => onPrev?.()}>
              {t("od.prev")}
            </Button>
          ) : null}
          {onNext !== undefined ? (
            <Button variant="ghost" size="sm" disabled={!onNext} onClick={() => onNext?.()}>
              {t("od.next")}
            </Button>
          ) : null}
        </div>
      </div>
    ) : null

  if (!offer) {
    return (
      <div className={`od${mode === "drawer" ? " od--modal" : ""}`}>
        {top}
        <div className="od__head">
          <div className="stack-sm" style={{ gridColumn: "1 / -1" }}>
            {error ? (
              <p className="muted">{t("od.notFound")}</p>
            ) : loading ? (
              <>
                <Skeleton w={160} h={16} />
                <Skeleton w="80%" h={28} />
                <Skeleton w="60%" h={16} />
                <Skeleton h={120} />
              </>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  const reasons = detail.reasons
  const firstSeen = shortDate(offer.firstSeenAt, locale)
  const checked = shortDate(offer.lastVerifiedAt ?? offer.lastSeenAt, locale)
  const description = offer.excerpt || offer.description.slice(0, 600)
  const pref = detail.preference
  const hasParts = detail.hasProfile && detail.parts.length > 0

  return (
    <div className={`od${mode === "drawer" ? " od--modal" : ""}`}>
      {top}
      <header className="od__head">
        <div className="stack-sm" style={{ minWidth: 0 }}>
          <div className="od__co">
            <CompanyInitial name={offer.company} size="lg" />
            {company ? (
              <Link className="link" href={`/companies?focus=${company.companyId}`} style={{ color: "var(--text)" }}>
                {offer.company}
              </Link>
            ) : (
              <span>{offer.company}</span>
            )}
          </div>
          <h2 className="od__title" id={titleId}>
            {offer.title}
          </h2>
          <Facts offer={offer} t={t} locale={locale} />
          <div className="row">
            <SourceBadge offer={offer} t={t} />
            <Freshness iso={offer.firstSeenAt} t={t} locale={locale} />
          </div>
        </div>
        {detail.hasProfile || detail.hasFeedback ? (
          <ScoreRing score={detail.score} size="lg" caption={t("card.scoreCaption")} />
        ) : null}
      </header>

      <div className="od__bar">
        <Button
          variant="ghost"
          size="sm"
          icon={<X />}
          aria-label={t("act.pass")}
          aria-pressed={verdict === "DISLIKE"}
          aria-keyshortcuts="J"
          onClick={() => onVerdict("DISLIKE")}
        >
          <span className="lbl-long">{t("act.pass")}</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Heart className="heart" />}
          aria-pressed={verdict === "LIKE"}
          aria-keyshortcuts="K"
          onClick={() => onVerdict("LIKE")}
        >
          {verdict === "LIKE" ? t("act.liked") : t("act.like")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<CircleCheck />}
          aria-label={t("act.applied")}
          aria-pressed={verdict === "APPLIED"}
          aria-keyshortcuts="A"
          onClick={() => onVerdict("APPLIED")}
        >
          <span className="lbl-long">{t("act.applied")}</span>
        </Button>
        <span className="spacer" />
        <ButtonLink href={`/jobs/${offer.id}/cv`} variant="secondary" size="sm" icon={<FileText />}>
          {t(hasTailoredCv ? "tl.act.open" : "tl.act")}
        </ButtonLink>
        {offer.url ? (
          <ButtonLink href={offer.url} external variant="primary" size="sm" iconRight={<ExternalLink />}>
            {t("od.openPosting").replace(" ↗", "")}
          </ButtonLink>
        ) : null}
      </div>
      {panel ? <div className="od__panel">{panel}</div> : null}

      <section className="od__sec" aria-labelledby={`${titleId}-why`}>
        <h2 id={`${titleId}-why`}>
          {t("od.why")}
          {detail.hasProfile ? <span className="t-sm muted num">{t("od.scoreOf", { n: detail.score })}</span> : null}
        </h2>
        {!detail.hasProfile && !detail.hasFeedback ? (
          <p className="muted">
            {t("od.noProfile")}{" "}
            <Link className="link" href="/start">
              {t("empty.noProfile.cta")}
            </Link>
          </p>
        ) : hasParts ? (
          <>
            <div className="score-bars">
              {detail.parts.map((part) => (
                <div key={part.id} className="score-bar">
                  <span className="score-bar__label">{t(PART_KEY[part.id] ?? "od.part.title")}</span>
                  <span className="score-bar__track" aria-hidden>
                    <span className="score-bar__fill" style={{ width: `${Math.round(part.value * 100)}%` }} />
                  </span>
                  <span className="score-bar__val">
                    {Math.round(part.points)}/{part.max}
                  </span>
                  <span className="score-bar__why">{locale === "en" ? part.reason.en : part.reason.pl}</span>
                </div>
              ))}
              {pref.delta ? (
                <div className="score-bar">
                  <span className="score-bar__label">{t("od.part.taste")}</span>
                  <span className={`score-bar__delta ${pref.delta > 0 ? "is-up" : "is-down"}`}>
                    {pref.delta > 0 ? `+${pref.delta}` : pref.delta}
                  </span>
                  <span />
                  <span className="score-bar__why">
                    <Heart width={12} height={12} aria-hidden style={{ display: "inline", fill: "var(--primary)", color: "var(--primary)" }} />{" "}
                    {(pref.reasonsI18n?.length
                      ? pref.reasonsI18n.map((reason) => (locale === "en" ? reason.en : reason.pl))
                      : pref.reasons
                    ).join(" · ")}
                  </span>
                </div>
              ) : null}
              {detail.industryDelta ? (
                <div className="score-bar">
                  <span className="score-bar__label">{t("od.part.industry")}</span>
                  <span className={`score-bar__delta ${detail.industryDelta > 0 ? "is-up" : "is-down"}`}>
                    {detail.industryDelta > 0 ? `+${detail.industryDelta}` : detail.industryDelta}
                  </span>
                  <span />
                  <span className="score-bar__why">{detail.industry ?? ""}</span>
                </div>
              ) : null}
            </div>
            <Reasons reasons={reasons.filter((reason) => reason.origin === "profile")} max={4} />
            <p className="t-caption subtle">{t("od.deterministic")}</p>
          </>
        ) : (
          <Reasons reasons={reasons} max={5} />
        )}
      </section>

      <section className="od__sec">
        <h2>{t("od.excerpt")}</h2>
        {description ? <p className="od__excerpt">{description}</p> : null}
        <div className="stack-sm">
          <h3 className="t-sm" style={{ fontWeight: 600 }}>
            {t("od.reqs")}
          </h3>
          {offer.requirements.length ? (
            <ul className="od__reqs">
              {offer.requirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="muted t-sm">{t("od.reqsNone")}</p>
          )}
        </div>
        <p className="t-sm subtle">
          {t("od.partial")}{" "}
          {offer.url ? (
            <a className="link" href={offer.url} target="_blank" rel="noreferrer noopener">
              {t("od.readAll")}
            </a>
          ) : null}
        </p>
      </section>

      {similar && similar.length ? (
        <section className="od__sec">
          <h2>{t("od.similar")}</h2>
          <div className="mini-grid">
            {similar.map((item) => (
              <MiniCard
                key={item.id}
                offer={item}
                verdict={similarVerdicts.get(item.id)}
                onOpen={(id) => onOpenOther?.(id)}
                onVerdict={(target, next) => {
                  setSimilarVerdicts((current) => new Map(current).set(target.id, next))
                  void feedback.save({ jobId: target.id, verdict: next }).catch(() => {
                    toast.show({ message: t("err.save"), tone: "danger" })
                  })
                }}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="od__sec">
        <h2>{t("od.company")}</h2>
        {company ? (
          <div className="row row--between" style={{ alignItems: "center", gap: 12 }}>
            <div className="stack-sm t-sm">
              <span className="row">
                {company.readMode === "ats" && company.provider ? (
                  <Badge>{t("od.readFrom", { source: company.provider })}</Badge>
                ) : company.readMode === "career-site" ? (
                  <Badge tone="success">{t("od.readFrom", { source: t("co.read.site") })}</Badge>
                ) : company.readMode === "link-only" ? (
                  <Badge>{t("src.link")}</Badge>
                ) : null}
                {company.careerPageUrl ? (
                  <a className="link link--quiet" href={company.careerPageUrl} target="_blank" rel="noreferrer noopener">
                    {hostOf(company.careerPageUrl)}
                  </a>
                ) : null}
              </span>
              <Link className="link" href={`/jobs?tab=all&company=${company.companyId}`}>
                {t("od.openJobs", { n: company.openJobs })}
              </Link>
            </div>
            <Button
              variant={company.watching ? "soft" : "secondary"}
              size="sm"
              loading={watchBusy}
              aria-pressed={company.watching}
              onClick={() => void toggleWatch()}
            >
              {company.watching ? t("od.watching") : t("od.watch")}
            </Button>
          </div>
        ) : (
          <Skeleton w="50%" h={16} />
        )}
      </section>

      <footer className="od__foot">
        {firstSeen ? <span>{t("od.firstSeen", { date: firstSeen })}</span> : null}
        {checked ? <span>· {t("od.checked", { date: checked })}</span> : null}
        <span>
          ·{" "}
          <a
            className="link link--quiet"
            href={`${GITHUB_ISSUES}?title=${encodeURIComponent(`Offer ${offer.id}: `)}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t("od.report")}
          </a>
        </span>
      </footer>
    </div>
  )
}

function hostOf(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`.slice(0, 48)
  } catch {
    return url
  }
}
