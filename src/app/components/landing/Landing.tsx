"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Code,
  Factory,
  FileUp,
  House,
  Link2,
  Lock,
  SquareTerminal,
} from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { numberFormat } from "src/app/i18n/copy"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Dropzone } from "@newrole/ui/interactive"
import { Badge, CompanyInitial } from "@newrole/ui/primitives"
import { LinkedInMark } from "src/app/components/site/Brand"
import { OfferCard } from "src/app/jobs/components/OfferCard"
import type { CardOffer } from "src/app/jobs/types"
import { setPendingFile } from "src/app/start/pending"

export type LandingStats = { offers: number; companies: number | null; careerPages: number | null }

const DAY = 86_400_000

function demoOffer(locale: "pl" | "en"): CardOffer {
  const pl = locale === "pl"
  return {
    id: "demo",
    title: "Senior Kotlin Developer",
    company: "Allegro",
    viaIntermediary: false,
    url: "",
    excerpt: "",
    description: "",
    requirements: [],
    inPoland: true,
    city: "Warszawa",
    countryCode: "PL",
    workMode: "remote",
    payListed: true,
    payConverted: true,
    payMin: 25000,
    payMax: 30000,
    payLabel: null,
    payNote: null,
    payCurrency: "PLN",
    payFromOther: false,
    paySourceUrl: null,
    sourceKind: "company-site",
    provider: null,
    firstSeenAt: new Date(Date.now() - DAY).toISOString(),
    lastSeenAt: new Date().toISOString(),
    lastVerifiedAt: null,
    publishedAt: null,
    score: 87,
    reasons: [
      {
        kind: "ok",
        origin: "profile",
        text: pl ? "Kotlin i Spring jak w Twoim stacku" : "Kotlin and Spring, like your stack",
      },
      {
        kind: "ok",
        origin: "profile",
        text: pl ? "Widełki powyżej Twojego minimum" : "Salary above your minimum",
      },
      {
        kind: "ok",
        origin: "feedback",
        text: pl ? "Podobna do polubionej oferty w Revolut" : "Like an offer you liked at Revolut",
      },
    ],
  }
}

export function Landing({
  linkedIn,
  stats,
  finish,
}: {
  linkedIn: boolean
  stats: LandingStats
  /** Signed in without a profile: the hero CTA becomes "Finish your profile". */
  finish: boolean
}) {
  const { t, locale } = useCopy()
  const router = useRouter()
  const hero = useRef<HTMLElement>(null)
  const nf = numberFormat(locale)

  useEffect(() => {
    const node = hero.current
    if (!node) return
    const root = document.documentElement
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) root.dataset.heroVisible = ""
        else delete root.dataset.heroVisible
      },
      { rootMargin: "-64px 0px 0px 0px", threshold: 0.15 }
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      delete root.dataset.heroVisible
    }
  }, [])

  function onFile(file: File) {
    setPendingFile(file)
    router.push("/start?step=reading")
  }

  // The profile comes through Claude in Chrome, the ZIP export, or a PDF. LinkedIn sign-in is optional.
  const liHref = "/start?step=linkedin"
  const pl = locale === "pl"

  return (
    <>
      <section className="hero" ref={hero} aria-labelledby="hero-title">
        <div className="container hero__inner">
          <h1 id="hero-title" className="t-display hero__title">
            {t("hero.title1")} <span>{t("hero.title2")}</span>
          </h1>
          <p className="hero__sub">{finish ? t("hero.finishSub") : t("hero.sub")}</p>

          <div className="hero-card">
            <Dropzone onFile={onFile} className="dropzone">
              {(open) => (
                <>
                  <p className="dropzone__hint">
                    <FileUp aria-hidden /> {t("hero.drop")}
                  </p>
                  <div className="hero-actions">
                    <Button variant="primary" size="lg" icon={<FileUp />} onClick={open}>
                      {finish ? t("hero.finish") : t("hero.upload")}
                    </Button>
                    <ButtonLink
                      href={liHref}
                      variant="outline"
                      size="lg"
                      icon={<LinkedInMark size={20} />}
                    >
                      {t("lix.title")}
                    </ButtonLink>
                  </div>
                  <p className="hero-links">
                    <Link className="link" href="/start?step=source#paste">
                      {t("hero.paste")}
                    </Link>
                    <span className="subtle" aria-hidden>
                      ·
                    </span>
                    <Link className="link link--quiet" href="/jobs?tab=all">
                      {t("hero.browse")}
                    </Link>
                  </p>
                  <p className="hero-privacy">
                    <Lock aria-hidden /> {t("hero.privacy")}
                  </p>
                </>
              )}
            </Dropzone>
          </div>

          {stats.offers > 0 ? (
            <p className="hero-stats">
              <span>
                <strong>{nf.format(stats.offers)}+</strong> {t("hero.stats.offers")}
              </span>
              {stats.companies ? (
                <>
                  <span className="sep" aria-hidden>
                    ·
                  </span>
                  <span>
                    <strong>{nf.format(stats.companies)}+</strong> {t("hero.stats.companies")}
                  </span>
                </>
              ) : null}
              <span className="sep" aria-hidden>
                ·
              </span>
              <span>{t("hero.stats.pages")}</span>
              <span className="sep" aria-hidden>
                ·
              </span>
              <span>{t("hero.stats.daily")}</span>
            </p>
          ) : null}
        </div>
      </section>

      <section className="section" aria-labelledby="how-title">
        <div className="container">
          <div className="section__head">
            <h2 id="how-title" className="t-h1">
              {t("how.title")}
            </h2>
          </div>
          <ol className="how-grid" style={{ listStyle: "none" }}>
            {(["1", "2", "3"] as const).map((n) => (
              <li key={n} className="card how-step">
                <span className="how-step__n" aria-hidden>
                  {n}
                </span>
                <h3 className="t-h3">{t(`how.${n}.t`)}</h3>
                <p>{t(`how.${n}.b`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" aria-labelledby="taste-title">
        <div className="container split">
          <div className="split__text">
            <h2 id="taste-title" className="t-h1">
              {t("land.taste.t")}
            </h2>
            <p>{t("land.taste.b")}</p>
          </div>
          <div className="demo" aria-hidden>
            <OfferCard offer={demoOffer(locale)} verdict="LIKE" demo>
              <div className="like-panel">
                <div className="like-panel__head">
                  <div>
                    <h3>{t("like.title")}</h3>
                    <p>{t("like.sub")}</p>
                  </div>
                </div>
                <div className="chips">
                  <span className="chip chip--on">
                    <Check /> Kotlin
                  </span>
                  <span className="chip chip--on">
                    <Check /> {pl ? "100% zdalnie" : "100% remote"}
                  </span>
                  <span className="chip chip--on">
                    <Check /> Fintech
                  </span>
                  <span className="chip">
                    <Code /> Spring
                  </span>
                  <span className="chip">
                    <House /> Allegro
                  </span>
                  <span className="chip">
                    <Factory /> E-commerce
                  </span>
                </div>
              </div>
            </OfferCard>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="watch-title">
        <div className="container split">
          <div className="split__text">
            <h2 id="watch-title" className="t-h1">
              {t("land.watch.t")}
            </h2>
            <p>{t("land.watch.b")}</p>
            <div>
              <ButtonLink href="/companies" variant="outline" iconRight={<ArrowRight />}>
                {t("nav.companies")}
              </ButtonLink>
            </div>
          </div>
          <div className="demo demo-watch" aria-hidden>
            {[
              {
                name: "Allegro",
                domain: "allegro.pl/praca",
                badge: <Badge icon={<Link2 />}>SuccessFactors</Badge>,
                jobs: 42,
                fresh: 3,
              },
              {
                name: "Synerise",
                domain: "synerise.com/careers",
                badge: (
                  <Badge tone="success" icon={<BadgeCheck />}>
                    {t("co.read.site")}
                  </Badge>
                ),
                jobs: 7,
                fresh: 0,
              },
              {
                name: "Booksy",
                domain: "booksy.com/careers",
                badge: <Badge icon={<Link2 />}>Greenhouse</Badge>,
                jobs: 12,
                fresh: 1,
              },
            ].map((row) => (
              <div key={row.name} className="watch-row">
                <CompanyInitial name={row.name} />
                <div className="watch-row__name">
                  <strong>{row.name}</strong>
                  <span>{row.domain}</span>
                </div>
                <div className="watch-row__meta">
                  {row.badge}
                  <span className="num">{t("co.jobs.many", { n: row.jobs })}</span>
                  {row.fresh ? (
                    <span className="badge badge--new">{t("co.newJobs", { n: row.fresh })}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="oss-title">
        <div className="container">
          <div className="card oss-card">
            <div className="stack-sm">
              <h2 id="oss-title" className="t-h2">
                {t("land.oss.t")}
              </h2>
              <p className="muted measure">{t("land.oss.b")}</p>
            </div>
            <ButtonLink href="/connect" variant="outline" icon={<SquareTerminal />}>
              {t("land.oss.cta")}
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  )
}
