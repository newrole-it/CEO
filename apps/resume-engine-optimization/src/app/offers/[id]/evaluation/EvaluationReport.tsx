import { Check, CircleAlert, FileText, Gauge, Minus, ShieldAlert, UserRound, X } from "lucide-react"
import type { ReactNode } from "react"
import { ButtonLink } from "@newrole/ui/Button"
import { Badge, Banner } from "@newrole/ui/primitives"
import {
  DECISION_MIN,
  LEVEL_POINTS,
  MODE_POINTS,
  RED_FLAG_POINTS,
  RED_FLAGS_COUNTED,
  WEIGHT,
  type DimensionCode,
  type Dimensions,
  type Gap,
  type LevelDimension,
  type OfferEvaluation,
  type PayDimension,
  type PostingDimension,
  type RequirementsDimension,
  type WorkModeDimension,
} from "@newrole/cv-core/evaluation"
import type {
  MatchedRequirement,
  MatchReport,
  MatchStatus,
  RequirementImportance,
} from "@newrole/cv-core/match"
import {
  intlLocale,
  numberFormat,
  pluralKind,
  type CopyKey,
  type Locale,
  type T,
} from "src/app/i18n/copy"
import type { EvaluationView } from "src/server/evaluation/service"
import type { HiringSignalCode } from "src/shared/hiring-confidence"
import { DECISION_KEY } from "./decision"
import { RunEvaluation } from "./EvaluationRun"
import "./evaluation.css"

/**
 * One kept evaluation of an offer (src/server/evaluation/service.ts): the decision and the score,
 * each dimension with the data it was computed from, the offer's requirements with the person's
 * own evidence, the gaps in the required ones, what to lead with, and the ways onward. Everything
 * shown was computed by @newrole/cv-core/evaluation; this file only words it.
 */

type Props = {
  t: T
  locale: Locale
  job: { id: string; cvId: string | null }
  view: EvaluationView
}

const DIMENSION_KEY = {
  requirements: "ev.dim.requirements",
  level: "ev.dim.level",
  pay: "ev.dim.pay",
  workMode: "ev.dim.workMode",
  posting: "ev.dim.posting",
} as const satisfies Record<DimensionCode, CopyKey>

const GROUP_KEY = {
  required: "ev.group.required",
  preferred: "ev.group.preferred",
  soft: "ev.group.soft",
} as const satisfies Record<RequirementImportance, CopyKey>

const STATUS_KEY = {
  met: "ev.status.met",
  partial: "ev.status.partial",
  missing: "ev.status.missing",
} as const satisfies Record<MatchStatus, CopyKey>

const IMPORTANCE: RequirementImportance[] = ["required", "preferred", "soft"]

/** A dimension in words: why it has this score, the data behind it, and the rule that scored it. */
type Worded = { why: string; inputs: string[]; rule?: string; extra?: ReactNode }

export function EvaluationReport({ t, locale, job, view }: Props) {
  const { evaluation } = view
  const { dimensions } = evaluation
  const worded: Record<DimensionCode, Worded> = {
    requirements: requirementsWords(t, dimensions.requirements),
    level: levelWords(t, locale, dimensions.level),
    pay: payWords(t, locale, dimensions.pay),
    workMode: workModeWords(t, locale, dimensions.workMode),
    posting: postingWords(t, locale, dimensions.posting),
  }
  const redFlags = dimensions.posting.redFlags ?? []
  return (
    <div className="stack-lg">
      <DecisionBanner t={t} locale={locale} job={job} view={view} />

      <section className="card card--pad stack-sm" aria-labelledby="ev-dims">
        <h2 className="t-h3" id="ev-dims">
          {t("ev.dims.title")}
        </h2>
        <p className="t-sm muted">{t("ev.dims.sub")}</p>
        <ul className="ev-list">
          {(Object.keys(DIMENSION_KEY) as DimensionCode[]).map((code) => (
            <DimensionRow
              key={code}
              t={t}
              name={t(DIMENSION_KEY[code])}
              weight={WEIGHT[code]}
              score={dimensions[code].score}
              worded={worded[code]}
            />
          ))}
        </ul>
      </section>

      <div className="mt-cols">
        <Requirements t={t} report={evaluation.report} />
        <div className="stack">
          <Gaps t={t} report={evaluation.report} gaps={evaluation.gaps} />
          <Lead t={t} evaluation={evaluation} />
          {redFlags.length ? (
            <section className="card card--pad stack-sm" aria-labelledby="ev-flags">
              <h2 className="t-h3" id="ev-flags">
                {t("ev.flags.title")}
              </h2>
              <p className="t-sm muted">{t("ev.flags.sub")}</p>
              <ul className="mt-flags">
                {redFlags.map((flag) => (
                  <li key={flag.quote}>
                    <CircleAlert aria-hidden />
                    <div>
                      <q>{flag.quote}</q>
                      <p className="t-sm muted">{flag.why}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      <NextSteps t={t} job={job} dimensions={dimensions} />
      <p className="t-caption muted">{t("ev.source")}</p>
    </div>
  )
}

/* ---------------------------------------------------------------- the decision */

function DecisionBanner({ t, locale, job, view }: Props) {
  const { evaluation, stale } = view
  const when = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(view.evaluatedAt)
  const changed = [
    stale.cv ? t("ev.stale.cv") : null,
    stale.offer ? t("ev.stale.offer") : null,
    stale.profile ? t("ev.stale.profile") : null,
  ].filter((line): line is string => line != null)
  return (
    <>
      {changed.length ? (
        <Banner tone="warning" role="status">
          <strong>{t("ev.stale.title")}</strong>
          <ul className="ev-list t-sm">
            {changed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Banner>
      ) : null}
      <section
        className="card card--pad ev-banner"
        data-decision={evaluation.decision}
        aria-labelledby="ev-decision"
      >
        <div className="mt-score__head">
          {evaluation.score != null ? (
            <strong className="mt-score__num" aria-label={t("ev.score.label")}>
              {t("ev.score.value", { n: evaluation.score })}
            </strong>
          ) : null}
          <div>
            <h2 className="mt-score__band" id="ev-decision">
              {t(DECISION_KEY[evaluation.decision])}
            </h2>
            <p className="t-sm muted">
              {t(`ev.decision.${evaluation.decision}.hint`, DECISION_MIN)}
            </p>
          </div>
        </div>
        {evaluation.score != null && evaluation.coverage < 100 ? (
          <p className="t-sm">{t("ev.coverage", { n: evaluation.coverage })}</p>
        ) : null}
        {evaluation.stops.length ? (
          <div className="stack-sm">
            <h3 className="t-label">{t("ev.stops.title")}</h3>
            {evaluation.stops.map((stop) => (
              <p key={stop.code} className="mt-critical" role="note">
                <ShieldAlert aria-hidden />
                {t(`ev.stop.${stop.code}`)}
              </p>
            ))}
          </div>
        ) : null}
        <div className="ev-banner__actions">
          <RunEvaluation jobId={job.id} again />
          <span className="t-sm muted">
            {view.cv ? t("ev.meta.cv", { when, cv: view.cv.title }) : t("ev.meta.noCv", { when })}
          </span>
        </div>
        {view.usedModel ? null : <p className="t-sm muted">{t("ev.meta.rules")}</p>}
      </section>
    </>
  )
}

/* ---------------------------------------------------------------- the dimensions */

function DimensionRow({
  t,
  name,
  weight,
  score,
  worded,
}: {
  t: T
  name: string
  weight: number
  score: number | null
  worded: Worded
}) {
  return (
    <li className="ev-dim" data-known={score != null}>
      <div className="ev-dim__head">
        <h3 className="t-h3">{name}</h3>
        <span className="t-caption muted">{t("ev.dim.weight", { n: weight })}</span>
        <strong className="ev-dim__score">
          {score != null ? t("ev.dim.score", { n: score }) : t("ev.dim.unknown")}
        </strong>
      </div>
      {score != null ? (
        <div className="meter" aria-hidden>
          <span style={{ width: `${score}%` }} />
        </div>
      ) : null}
      <p>{worded.why}</p>
      {worded.inputs.length ? (
        <ul className="ev-dim__inputs t-sm muted">
          {worded.inputs.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {worded.extra}
      {worded.rule ? <p className="t-caption muted">{worded.rule}</p> : null}
    </li>
  )
}

const counts = (group: { met: number; partial: number; total: number }) => ({
  met: group.met,
  partial: group.partial,
  total: group.total,
})

function requirementsWords(t: T, dimension: RequirementsDimension): Worded {
  if (dimension.reason !== "scored") {
    return { why: t(`ev.req.why.${dimension.reason}`), inputs: [] }
  }
  const { required, preferred } = dimension
  return {
    why: t("ev.req.formula"),
    inputs: [
      required?.total ? t("ev.req.required", counts(required)) : null,
      preferred?.total ? t("ev.req.preferred", counts(preferred)) : null,
    ].filter((line): line is string => line != null),
  }
}

function levelWords(t: T, locale: Locale, dimension: LevelDimension): Worded {
  const { offer, person, distance } = dimension
  const steps = Math.abs(distance ?? 0)
  const why =
    dimension.reason === "above" || dimension.reason === "below"
      ? t(`ev.level.why.${dimension.reason}.${pluralKind(steps, locale)}`, { n: steps })
      : t(`ev.level.why.${dimension.reason}`)
  return {
    why,
    inputs: [
      offer && dimension.offerSource
        ? t(`ev.level.offer.${dimension.offerSource}`, {
            level: t(`ev.lvl.${offer}`),
            quote: dimension.offerQuote,
          })
        : t("ev.level.offer.none"),
      person ? t("ev.level.person", { level: t(`ev.lvl.${person}`) }) : t("ev.level.person.none"),
    ],
    rule: t("ev.level.rule", {
      same: LEVEL_POINTS.same,
      one: LEVEL_POINTS.oneStep,
      two: LEVEL_POINTS.twoSteps,
      further: LEVEL_POINTS.further,
    }),
  }
}

/** A sentence whose last placeholder was empty: "22 000 ." reads "22 000." */
const tidy = (sentence: string) => sentence.replace(/\s+([.,])/g, "$1")

function payWords(t: T, locale: Locale, dimension: PayDimension): Worded {
  const { offer, expected } = dimension
  const amount = (value: number | null) => (value == null ? "" : numberFormat(locale).format(value))
  const inputs: string[] = []
  if (offer) {
    const vars = {
      min: amount(offer.min),
      max: amount(offer.max),
      currency: offer.currency ?? "",
    }
    const key =
      offer.min != null && offer.max != null
        ? offer.min === offer.max
          ? "ev.pay.offer.one"
          : "ev.pay.offer.range"
        : offer.min != null
          ? "ev.pay.offer.from"
          : "ev.pay.offer.upTo"
    inputs.push(tidy(t(key, vars)))
    inputs.push(offer.period ? t(`ev.pay.period.${offer.period}`) : t("ev.pay.period.none"))
    if (offer.periodQuote) inputs.push(t("ev.pay.period.quote", { quote: offer.periodQuote }))
  } else {
    inputs.push(t("ev.pay.offer.none"))
  }
  if (expected) {
    const which =
      expected.floor != null && expected.target != null
        ? "both"
        : expected.floor != null
          ? "floor"
          : "target"
    inputs.push(
      tidy(
        t(`ev.pay.expected.${which}.${expected.period}`, {
          floor: amount(expected.floor),
          target: amount(expected.target),
          currency: expected.currency ?? "",
        })
      )
    )
  } else {
    inputs.push(t("ev.pay.expected.none"))
  }
  if (dimension.monthly && (offer?.period === "year" || expected?.period === "year")) {
    inputs.push(t("ev.pay.perMonth"))
  }
  const why =
    dimension.reason === "below" && expected?.floor == null
      ? t("ev.pay.why.belowTarget")
      : t(`ev.pay.why.${dimension.reason}`)
  return { why, inputs, rule: t("ev.pay.note") }
}

function workModeWords(t: T, locale: Locale, dimension: WorkModeDimension): Worded {
  const inputs = [t(`ev.mode.offer.${dimension.offer}`)]
  if (dimension.offerLocation) {
    inputs.push(t("ev.mode.location", { location: dimension.offerLocation }))
  }
  inputs.push(
    dimension.preference ? t(`ev.mode.pref.${dimension.preference}`) : t("ev.mode.pref.none")
  )
  if (dimension.places.length) {
    const places = new Intl.ListFormat(intlLocale(locale), { type: "conjunction" }).format(
      dimension.places
    )
    inputs.push(t("ev.mode.places", { places }))
  }
  if (dimension.relocation != null) {
    inputs.push(t(dimension.relocation ? "ev.mode.relocation.yes" : "ev.mode.relocation.no"))
  }
  if (dimension.score != null) inputs.push(t(`ev.place.${dimension.place}`))
  return {
    why: t(`ev.mode.why.${dimension.reason}`),
    inputs,
    rule: t("ev.mode.rule", MODE_POINTS),
  }
}

/** The signs of src/shared/hiring-confidence.ts whose sentence takes no count. */
const SIGNAL_KEY = {
  "age-unknown": "hc.s.age-unknown",
  "own-site": "hc.s.own-site",
  intermediary: "hc.s.intermediary",
  "maybe-closed": "hc.s.maybe-closed",
  "in-talks": "hc.s.in-talks",
  "no-reply": "hc.s.no-reply",
} as const satisfies Partial<Record<HiringSignalCode, CopyKey>>

/** A sign of the hiring confidence in the words of its card (src/app/offers/HiringConfidenceCard.tsx). */
function signalText(t: T, locale: Locale, signal: { code: string; n?: number }): string | null {
  const n = signal.n ?? 0
  if (signal.code === "age") {
    return n === 0 ? t("hc.s.age.today") : t(`hc.s.age.${pluralKind(n, locale)}`, { n })
  }
  if (signal.code === "seen") return t(`hc.s.seen.${pluralKind(n, locale)}`, { n })
  if (signal.code === "evergreen") return t(`hc.s.evergreen.${pluralKind(n, locale)}`, { n })
  return signal.code in SIGNAL_KEY ? t(SIGNAL_KEY[signal.code as keyof typeof SIGNAL_KEY]) : null
}

function postingWords(t: T, locale: Locale, dimension: PostingDimension): Worded {
  const { hiring, redFlags } = dimension
  if (!hiring) return { why: t("ev.posting.closed"), inputs: [] }
  const signed = new Intl.NumberFormat(intlLocale(locale), { signDisplay: "exceptZero" })
  const flags =
    redFlags == null
      ? t("ev.posting.flags.unknown")
      : redFlags.length
        ? t("ev.posting.flags", { n: redFlags.length, points: dimension.penalty })
        : t("ev.posting.flags.none")
  return {
    why: t("ev.posting.hiring", { n: hiring.score }),
    inputs: [flags],
    extra: (
      <ul className="hiring-signals" aria-label={t("hc.signals")}>
        {hiring.signals.map((signal) => {
          const text = signalText(t, locale, signal)
          return text ? (
            <li key={signal.code}>
              <span>{text}</span>
              {signal.points ? (
                <span className="hiring-signals__points">
                  {t("hc.points", { points: signed.format(signal.points) })}
                </span>
              ) : null}
            </li>
          ) : null
        })}
      </ul>
    ),
    rule: t("ev.posting.rule", { points: RED_FLAG_POINTS, max: RED_FLAGS_COUNTED }),
  }
}

/* ---------------------------------------------------------------- requirements, gaps, lead */

function StatusIcon({ status }: { status: MatchStatus }) {
  if (status === "met") return <Check aria-hidden />
  if (status === "partial") return <Minus aria-hidden />
  return <X aria-hidden />
}

function RequirementRow({ t, item }: { t: T; item: MatchedRequirement }) {
  return (
    <li className="mt-req" data-status={item.status}>
      <span className="mt-req__status">
        <StatusIcon status={item.status} />
        {t(STATUS_KEY[item.status])}
      </span>
      <div className="mt-req__body">
        <p className="mt-req__text">
          {item.text}
          {item.gap ? (
            <Badge tone={item.gap === "critical" ? "warning" : "plain"}>
              {t(`ev.gap.${item.gap}`)}
            </Badge>
          ) : null}
        </p>
        {item.evidence ? (
          <p className="t-sm">{t("ev.evidence", { quote: item.evidence })}</p>
        ) : null}
        {item.note ? <p className="t-sm muted">{item.note}</p> : null}
      </div>
    </li>
  )
}

function Requirements({ t, report }: { t: T; report: MatchReport | null }) {
  return (
    <section className="card card--pad stack-sm" aria-labelledby="ev-table">
      <h2 className="t-h3" id="ev-table">
        {t("ev.table.title")}
      </h2>
      {report ? (
        <>
          <p className="t-sm muted">{t("ev.table.sub")}</p>
          {IMPORTANCE.map((importance) => {
            const items = report.requirements.filter((item) => item.importance === importance)
            if (!items.length) return null
            return (
              <div key={importance} className="stack-sm">
                <h3 className="t-label">{t(GROUP_KEY[importance])}</h3>
                <ul className="mt-reqs">
                  {items.map((item) => (
                    <RequirementRow key={item.id} t={t} item={item} />
                  ))}
                </ul>
              </div>
            )
          })}
        </>
      ) : (
        <p className="muted">{t("ev.table.none")}</p>
      )}
    </section>
  )
}

function Gaps({ t, report, gaps }: { t: T; report: MatchReport | null; gaps: Gap[] }) {
  if (!report) return null
  return (
    <section className="card card--pad stack-sm" aria-labelledby="ev-gaps">
      <h2 className="t-h3" id="ev-gaps">
        {t("ev.gaps.title")}
      </h2>
      {gaps.length ? (
        <>
          <p className="t-sm muted">{t("ev.gaps.sub")}</p>
          <ul className="ev-list">
            {gaps.map((gap) => (
              <li key={gap.id} className="ev-gap">
                <p className="ev-gap__head">
                  {gap.text}
                  <Badge tone={gap.level === "critical" ? "warning" : "plain"}>
                    {t(`ev.gap.${gap.level}`)}
                  </Badge>
                  <Badge tone="plain">{t(STATUS_KEY[gap.status])}</Badge>
                </p>
                {gap.evidence ? (
                  <p className="t-sm">{t("ev.evidence", { quote: gap.evidence })}</p>
                ) : null}
                <p className="t-sm muted">{gap.note || t("ev.gaps.noNote")}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">{t("ev.gaps.none")}</p>
      )}
    </section>
  )
}

function Lead({ t, evaluation }: { t: T; evaluation: OfferEvaluation }) {
  const { emphasize, strengths } = evaluation.lead
  if (!emphasize.length && !strengths.length) return null
  return (
    <section className="card card--pad stack-sm" aria-labelledby="ev-lead">
      <h2 className="t-h3" id="ev-lead">
        {t("ev.lead.title")}
      </h2>
      {emphasize.length ? (
        <ul className="mt-plain">
          {emphasize.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {strengths.length ? (
        <>
          <h3 className="t-label">{t("ev.strengths.title")}</h3>
          <ul className="mt-side">
            {strengths.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <span className="t-sm">{item.why}</span>
                <span className="t-sm muted">{t("ev.evidence", { quote: item.evidence })}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}

/* ---------------------------------------------------------------- onward */

function NextSteps({ t, job, dimensions }: { t: T; job: Props["job"]; dimensions: Dimensions }) {
  const profileMissing =
    dimensions.level.reason === "person-unknown" ||
    dimensions.pay.reason === "no-expectation" ||
    dimensions.workMode.reason === "no-preference"
  const { reason } = dimensions.requirements
  return (
    <section className="card card--pad stack-sm" aria-labelledby="ev-next">
      <h2 className="t-h3" id="ev-next">
        {t("ev.next.title")}
      </h2>
      <div className="ev-next">
        <ButtonLink href={`/offers/${job.id}/cv`} variant="primary" icon={<FileText />}>
          {t("ev.next.tailor")}
        </ButtonLink>
        {job.cvId ? (
          <ButtonLink href={`/offers/${job.id}/match`} variant="outline" icon={<Gauge />}>
            {t("ev.next.match")}
          </ButtonLink>
        ) : null}
        {profileMissing ? (
          <ButtonLink href="/profile" variant="outline" icon={<UserRound />}>
            {t("ev.next.profile")}
          </ButtonLink>
        ) : null}
        {reason === "no-cv" ? (
          <ButtonLink href="/cv" variant="outline" icon={<FileText />}>
            {t("ev.next.cv")}
          </ButtonLink>
        ) : null}
        <ButtonLink href={`/offers/${job.id}`} variant="ghost">
          {t("ev.next.offer")}
        </ButtonLink>
      </div>
    </section>
  )
}
