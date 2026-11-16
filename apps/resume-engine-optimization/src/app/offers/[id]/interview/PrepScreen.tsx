"use client"

import Link from "next/link"
import { useState } from "react"
import { CircleAlert, Info, RefreshCw, Sparkles } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { Badge, Banner, EmptyState } from "@newrole/ui/primitives"
import type { MatchStatus, RequirementImportance } from "@newrole/cv-core/match"
import {
  AUDIENCES,
  type InterviewPrepContent,
  type PrepAsk,
  type PrepGap,
  type PrepQuestion,
  type StoryFit,
} from "@newrole/cv-core/stories-prep"
import { invoke } from "src/app/rpc"
import { useCopy } from "src/app/i18n/Locale"
import { intlLocale, type CopyKey } from "src/app/i18n/copy"
import prepareInterview from "./mutations/prepareInterview"

type Stored = { content: InterviewPrepContent; generatedAt: string }

const FIT_TONE: Record<StoryFit, "success" | "warning" | "plain"> = {
  strong: "success",
  partial: "warning",
  none: "plain",
}

const STATUS_TONE: Record<MatchStatus, "success" | "warning" | "plain"> = {
  met: "success",
  partial: "warning",
  missing: "plain",
}

const IMPORTANCE_KEY: Record<RequirementImportance, CopyKey> = {
  required: "iv.importance.required",
  preferred: "iv.importance.preferred",
  soft: "iv.importance.soft",
}

/** Where a gap in the preparation can be closed; a gap with no link has nowhere to go. */
function gapLink(gap: PrepGap, jobId: string): string | null {
  if (gap === "offer-text") return `/offers/${jobId}`
  if (gap === "match" || gap === "requirements") return `/offers/${jobId}/cv`
  if (gap === "stories") return "/stories"
  if (gap === "cv") return "/cv"
  return null
}

/**
 * One offer's interview preparation: likely questions by who asks, which story answers which
 * requirement, the risks and what to ask them. It shows the stored one; "Prepare" makes it again.
 */
export function PrepScreen({
  job,
  initial,
  hasModel,
}: {
  job: { id: string; company: string; title: string }
  initial: Stored | null
  hasModel: boolean
}) {
  const { t, locale } = useCopy()
  const [stored, setStored] = useState(initial)
  const [running, setRunning] = useState(false)
  const [failed, setFailed] = useState<CopyKey | null>(null)

  async function run() {
    setRunning(true)
    setFailed(null)
    try {
      const result = await invoke(prepareInterview, { jobId: job.id })
      if (!result) throw new Error("no result")
      setStored({
        content: result.content,
        generatedAt: new Date(result.generatedAt).toISOString(),
      })
    } catch (failure) {
      const code = (failure as { code?: unknown }).code
      setFailed(code === "limited" ? "iv.err.limited" : "iv.err.prepare")
    } finally {
      setRunning(false)
    }
  }

  const head = (
    <header className="iv-head">
      <div className="page-head">
        <h1 className="t-h1">{t("iv.title")}</h1>
        <p>{t("iv.for", { title: job.title, company: job.company })}</p>
      </div>
      {stored ? (
        <Button variant="outline" icon={<RefreshCw />} loading={running} onClick={() => void run()}>
          {t("iv.regenerate")}
        </Button>
      ) : null}
    </header>
  )
  const status = (
    <>
      {running ? (
        <p className="ans-drafting iv-note" role="status">
          <Sparkles aria-hidden />
          <span>{t(hasModel ? "iv.running" : "iv.running.rules")}</span>
        </p>
      ) : null}
      {failed ? (
        <Banner tone="danger" icon={<CircleAlert />} role="alert" className="iv-note">
          {t(failed)}
        </Banner>
      ) : null}
    </>
  )

  if (!stored) {
    return (
      <>
        {head}
        {status}
        <EmptyState
          icon={<Sparkles />}
          title={t("iv.empty.title")}
          body={t(hasModel ? "iv.empty.body" : "iv.empty.body.rules")}
        >
          <Button variant="primary" loading={running} onClick={() => void run()}>
            {t("iv.prepare")}
          </Button>
        </EmptyState>
      </>
    )
  }

  const { content } = stored
  const titles = new Map(content.stories.map((story) => [story.id, story.title]))
  const when = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(stored.generatedAt))
  const unanswered = content.mapping.filter((item) => item.fit === "none")
  const answered = content.mapping.filter((item) => item.fit !== "none")

  const questionText = (question: PrepQuestion) =>
    question.basis.kind === "general"
      ? t(`iv.q.general.${question.basis.question}` as CopyKey)
      : (question.text ?? t("iv.q.requirement", { requirement: question.basis.requirement }))

  const askText = (ask: PrepAsk) => {
    if (ask.text) return ask.text
    if (ask.basis.kind === "red-flag") return t("iv.ask.redFlag", { quote: ask.basis.quote })
    if (ask.basis.kind === "unknown") return t(`iv.ask.unknown.${ask.basis.topic}` as CopyKey)
    if (ask.basis.kind === "general") return t(`iv.ask.general.${ask.basis.ask}` as CopyKey)
    return t("iv.ask.offer", { quote: ask.basis.quote })
  }

  return (
    <>
      {head}
      {status}
      <p className="iv-meta iv-note">
        <span suppressHydrationWarning>{t("iv.meta.when", { when })}</span>
        <span>{t(`iv.meta.reader.${content.reader}` as CopyKey)}</span>
        <span>{t(`iv.meta.match.${content.basis.match}` as CopyKey)}</span>
      </p>
      {content.missing.length ? (
        <Banner tone="info" icon={<Info />} className="iv-note">
          <p>{t("iv.missing.title")}</p>
          <ul className="iv-list">
            {content.missing.map((gap) => {
              const href = gapLink(gap, job.id)
              return (
                <li key={gap}>
                  {href ? (
                    <Link className="link" href={href}>
                      {t(`iv.missing.${gap}` as CopyKey)}
                    </Link>
                  ) : (
                    t(`iv.missing.${gap}` as CopyKey)
                  )}
                </li>
              )
            })}
          </ul>
        </Banner>
      ) : null}

      <div className="iv-sections">
        <section className="card iv-section" aria-labelledby="iv-questions">
          <header>
            <h2 className="t-h2" id="iv-questions">
              {t("iv.questions.title")}
            </h2>
            <p>{t("iv.questions.sub")}</p>
          </header>
          <div className="iv-groups">
            {AUDIENCES.map((audience) => (
              <div className="iv-group" key={audience}>
                <h3 className="t-h3">{t(`iv.audience.${audience}` as CopyKey)}</h3>
                <p className="t-sm muted">{t(`iv.audience.${audience}.sub` as CopyKey)}</p>
                <ul className="iv-items">
                  {content.questions
                    .filter((question) => question.audience === audience)
                    .map((question) => (
                      <li className="iv-item" key={question.id}>
                        <span className="iv-item__main">{questionText(question)}</span>
                        <span className="iv-item__meta">
                          {question.basis.kind === "requirement" ? (
                            <>
                              <Badge tone="primary">{t("iv.basis.requirement")}</Badge>
                              <span>{question.basis.requirement}</span>
                            </>
                          ) : (
                            <Badge tone="plain">{t("iv.basis.general")}</Badge>
                          )}
                        </span>
                        {question.storyId && titles.has(question.storyId) ? (
                          <span className="iv-item__note">
                            {t("iv.questions.story", {
                              title: titles.get(question.storyId) ?? "",
                            })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="card iv-section" aria-labelledby="iv-mapping">
          <header>
            <h2 className="t-h2" id="iv-mapping">
              {t("iv.mapping.title")}
            </h2>
            <p>{t("iv.mapping.sub")}</p>
          </header>
          {!content.mapping.length ? (
            <p className="muted">{t("iv.mapping.none")}</p>
          ) : (
            <>
              {answered.length ? (
                <ul className="iv-items">
                  {answered.map((item) => (
                    <li className="iv-item" data-fit={item.fit} key={item.requirementId}>
                      <span className="iv-item__main">{item.requirement}</span>
                      <span className="iv-item__meta">
                        <Badge tone="plain">{t(IMPORTANCE_KEY[item.importance])}</Badge>
                        <Badge tone={FIT_TONE[item.fit]}>
                          {t(`iv.fit.${item.fit}` as CopyKey)}
                        </Badge>
                        <span>{t(`iv.mapping.by.${item.by}` as CopyKey)}</span>
                      </span>
                      <span className="iv-item__note">
                        {t("iv.mapping.story", {
                          title: (item.storyId && titles.get(item.storyId)) || "",
                        })}
                      </span>
                      {item.evidence ? (
                        <blockquote className="iv-quote">{item.evidence}</blockquote>
                      ) : null}
                      {item.unbacked.length ? (
                        <span className="iv-item__note">
                          {t("iv.mapping.unbacked", {
                            numbers: new Intl.ListFormat(intlLocale(locale), {
                              style: "narrow",
                              type: "conjunction",
                            }).format(item.unbacked),
                          })}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <h3 className="t-h3">{t("iv.mapping.missing.title")}</h3>
              {unanswered.length ? (
                <ul className="iv-items">
                  {unanswered.map((item) => (
                    <li className="iv-item" data-fit="none" key={item.requirementId}>
                      <span className="iv-item__main">{item.requirement}</span>
                      <span className="iv-item__meta">
                        <Badge tone="plain">{t(IMPORTANCE_KEY[item.importance])}</Badge>
                        <Badge tone="plain">{t("iv.fit.none")}</Badge>
                      </span>
                      {item.lead ? (
                        <>
                          <span className="iv-item__note">{t("iv.mapping.lead")}</span>
                          <blockquote className="iv-quote">{item.lead}</blockquote>
                        </>
                      ) : null}
                      <Link
                        className="link t-sm"
                        href={`/stories?new=1&topic=${encodeURIComponent(item.requirement)}`}
                      >
                        {t("iv.mapping.add")}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{t("iv.mapping.missing.none")}</p>
              )}
            </>
          )}
        </section>

        <section className="card iv-section" aria-labelledby="iv-risks">
          <header>
            <h2 className="t-h2" id="iv-risks">
              {t("iv.risks.title")}
            </h2>
            <p>{t("iv.risks.sub")}</p>
          </header>
          {content.risks === null ? (
            <p className="muted">{t("iv.risks.unknown")}</p>
          ) : !content.risks.length ? (
            <p className="muted">{t("iv.risks.none")}</p>
          ) : (
            <ul className="iv-items">
              {content.risks.map((risk) => (
                <li className="iv-item" data-status={risk.status} key={risk.requirementId}>
                  <span className="iv-item__main">{risk.requirement}</span>
                  <span className="iv-item__meta">
                    <Badge tone={STATUS_TONE[risk.status]}>
                      {t(`iv.risks.status.${risk.status}` as CopyKey)}
                    </Badge>
                    {risk.gap ? <span>{t(`iv.risks.gap.${risk.gap}` as CopyKey)}</span> : null}
                  </span>
                  {risk.evidence ? (
                    <>
                      <span className="iv-item__note">{t("iv.risks.evidence")}</span>
                      <blockquote className="iv-quote">{risk.evidence}</blockquote>
                    </>
                  ) : null}
                  <span className="iv-item__note">{t(`iv.risks.line.${risk.by}` as CopyKey)}</span>
                  {risk.line ? <span>{risk.line}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card iv-section" aria-labelledby="iv-asks">
          <header>
            <h2 className="t-h2" id="iv-asks">
              {t("iv.asks.title")}
            </h2>
            <p>{t("iv.asks.sub")}</p>
          </header>
          <ul className="iv-items">
            {content.asks.map((ask) => (
              <li className="iv-item" key={ask.id}>
                <span className="iv-item__main">{askText(ask)}</span>
                <span className="iv-item__meta">
                  <Badge tone={ask.basis.kind === "red-flag" ? "warning" : "plain"}>
                    {t(`iv.asks.basis.${ask.basis.kind}` as CopyKey)}
                  </Badge>
                </span>
                {ask.basis.kind === "red-flag" || ask.basis.kind === "offer" ? (
                  <blockquote className="iv-quote">{ask.basis.quote}</blockquote>
                ) : null}
                {ask.basis.kind === "red-flag" ? (
                  <span className="iv-item__note">{ask.basis.why}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
