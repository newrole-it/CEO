"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useId } from "react"
import { ArrowRight, CircleCheck } from "lucide-react"
import { ButtonLink } from "@newrole/ui/Button"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import {
  FIRST_STEPS_HIDDEN_COOKIE,
  nextFirstStep,
  type FirstStep,
} from "src/server/onboarding/first-steps"

/** The add-offer form on /offers; its id is set in src/app/offers/AddOffer.tsx. */
export const ADD_OFFER_ANCHOR = "add-offer"

/**
 * "First steps" at the top of /offers and /cv: profile, offer, tailored CV, application. The next
 * step is open with its button; done ones are links to what was made. Hidden for this browser by
 * "Hide", and brought back from the account menu.
 */
export function FirstSteps({ steps }: { steps: FirstStep[] }) {
  const { t } = useCopy()
  const router = useRouter()
  const pathname = usePathname()
  const id = useId()
  const next = nextFirstStep(steps)
  if (!next) return null
  const done = steps.filter((step) => step.done).length

  function hide() {
    document.cookie = `${FIRST_STEPS_HIDDEN_COOKIE}=1; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  /** On /offers the form is right below: focus its link field instead of reloading the page. */
  function onCta(event: React.MouseEvent, step: FirstStep) {
    if (step.id !== "offer" || pathname !== "/offers") return
    const field = document.querySelector<HTMLInputElement>(`#${ADD_OFFER_ANCHOR} input`)
    if (!field) return
    event.preventDefault()
    field.scrollIntoView({ block: "center", behavior: "smooth" })
    field.focus({ preventScroll: true })
  }

  return (
    <section className="card first-steps" aria-labelledby={`${id}-title`}>
      <div className="first-steps__head">
        <div className="stack-sm">
          <h2 id={`${id}-title`} className="t-h3">
            {t("fs.title")}
          </h2>
          <p className="t-sm muted">{t("fs.sub")}</p>
        </div>
        <span className="t-sm muted first-steps__count">
          {t("fs.progress", { done, total: steps.length })}
        </span>
      </div>
      <div
        className="setup-progress__bar"
        role="progressbar"
        aria-label={t("fs.progressLabel")}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
      >
        <span style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
      </div>
      <ol className="first-steps__list">
        {steps.map((step, index) => {
          const current = step === next
          return (
            <li
              key={step.id}
              className="first-steps__step"
              data-done={step.done}
              data-next={current}
              aria-current={current ? "step" : undefined}
            >
              <span className="first-steps__icon" aria-hidden>
                {step.done ? <CircleCheck /> : <span>{index + 1}</span>}
              </span>
              <div className="first-steps__main">
                <p className="first-steps__title">
                  {step.done ? (
                    <Link className="link link--quiet" href={step.href}>
                      {t(`fs.${step.id}.title` as CopyKey)}
                    </Link>
                  ) : (
                    t(`fs.${step.id}.title` as CopyKey)
                  )}
                  {step.done ? <span className="sr-only"> ({t("fs.done")})</span> : null}
                </p>
                {current ? (
                  <>
                    <p className="t-sm muted">{t(`fs.${step.id}.body` as CopyKey)}</p>
                    <div className="first-steps__cta">
                      <ButtonLink
                        href={step.id === "offer" ? `/offers#${ADD_OFFER_ANCHOR}` : step.href}
                        variant="primary"
                        size="sm"
                        iconRight={<ArrowRight />}
                        onClick={(event) => onCta(event, step)}
                      >
                        {t(`fs.${step.id}.cta` as CopyKey)}
                      </ButtonLink>
                    </div>
                  </>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      <div className="first-steps__foot">
        <Link className="link t-sm" href="/features">
          {t("fs.features")}
        </Link>
        <button
          type="button"
          className="link link--quiet t-sm"
          onClick={hide}
          title={t("fs.hideHint")}
        >
          {t("fs.hide")}
        </button>
      </div>
    </section>
  )
}
