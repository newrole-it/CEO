"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { FileUp, Lock, SquareTerminal } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Dropzone } from "@newrole/ui/interactive"
import { LinkedInMark } from "src/app/components/site/Brand"
import { setPendingFile } from "src/app/start/pending"

/** The home page before there is a profile: a CV or LinkedIn in, then offers by their link. */
export function Landing({
  finish,
}: {
  /** Signed in without a profile: the hero CTA becomes "Finish your profile". */
  finish: boolean
}) {
  const { t } = useCopy()
  const router = useRouter()
  const hero = useRef<HTMLElement>(null)

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
                    {/* Claude in Chrome, the ZIP export or a PDF; LinkedIn sign-in is optional */}
                    <ButtonLink
                      href="/start?step=linkedin"
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
                  </p>
                  <p className="hero-privacy">
                    <Lock aria-hidden /> {t("hero.privacy")}
                  </p>
                </>
              )}
            </Dropzone>
          </div>
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
