import {
  ArrowLeft,
  Check,
  CircleAlert,
  FileText,
  Mail,
  Minus,
  ShieldAlert,
  ThumbsUp,
  X,
} from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { ButtonLink } from "@newrole/ui/Button"
import { Badge } from "@newrole/ui/primitives"
import type { AtsReport, CvCheck } from "@newrole/cv-core/ats"
import type {
  GroupScore,
  MatchedRequirement,
  MatchNotes,
  MatchReport,
  MatchStatus,
  RequirementImportance,
} from "@newrole/cv-core/match"
import { TAILOR_STEPS, LETTER_STEPS } from "@newrole/cv-core/progress"
import type { TailorNotes } from "@newrole/cv-core/tailor"
import { STATE_KEY, STEP_KEYS, stepLine } from "@newrole/cv-editor/steps"
import { pluralKind, type CopyKey, type Locale, type T } from "src/app/i18n/copy"

type Props = {
  t: T
  locale: Locale
  job: { id: string; company: string; title: string }
  cvId: string
  letterId: string | null
  notes: TailorNotes
  match: MatchNotes
  fileName: string
}

const STATUS_KEY: Record<MatchStatus, CopyKey> = {
  met: "mt.status.met",
  partial: "mt.status.partial",
  missing: "mt.status.missing",
}

const GROUP_KEY: Record<RequirementImportance, CopyKey> = {
  required: "mt.group.required",
  preferred: "mt.group.preferred",
  soft: "mt.group.soft",
}

const IMPORTANCE: RequirementImportance[] = ["required", "preferred", "soft"]

/** Above this many words the profile stops reading in seconds (the tailoring prompt's limit). */
const PROFILE_WORDS = 60

/**
 * The match dashboard: the score code computed from the offer's requirements, the checks before
 * and after tailoring, the requirements one by one with the person's own evidence, and what the
 * steps did. Everything shown is stored with the CV (TailorNotes.match); nothing is asked again.
 */
export function MatchDashboard({ t, locale, job, cvId, letterId, notes, match, fileName }: Props) {
  return (
    <div className="mt stack-lg">
      <header className="page-head mt-head">
        <p>
          <Link className="link link--quiet t-sm" href={`/offers/${job.id}`}>
            <ArrowLeft aria-hidden size={14} /> {t("mt.back")}
          </Link>
        </p>
        <h1 className="t-h1">{t("mt.title")}</h1>
        <p className="muted">{t("mt.sub", { title: job.title, company: job.company })}</p>
        <div className="mt-head__actions">
          <ButtonLink href={`/cv/${cvId}`} variant="primary" icon={<FileText />}>
            {t("mt.openCv")}
          </ButtonLink>
          {letterId ? (
            <ButtonLink href={`/cv/${letterId}`} variant="outline" icon={<Mail />}>
              {t("mt.openLetter")}
            </ButtonLink>
          ) : null}
        </div>
      </header>

      <ScoreCard t={t} report={match.report} />
      <Figures t={t} match={match} unverified={notes.unverified.length} />

      {notes.unverified.length ? (
        <section className="cvt-note cvt-note--warn">
          <h2 className="t-h3">{t("tl.r.check")}</h2>
          <p>{t("tl.r.checkBody")}</p>
          <ul className="cvt-terms">
            {notes.unverified.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-cols">
        <Requirements t={t} report={match.report} />
        <div className="stack">
          <SideList
            t={t}
            title="mt.strengths.title"
            items={(match.report?.strengths ?? []).map((item) => ({
              key: item.title,
              head: item.title,
              body: item.why,
              quote: item.evidence,
            }))}
          />
          <SideList
            t={t}
            title="mt.emphasize.title"
            items={(match.report?.emphasize ?? []).map((line) => ({ key: line, body: line }))}
          />
          <SideList
            t={t}
            title="mt.talking.title"
            items={(match.report?.talkingPoints ?? []).map((line) => ({ key: line, body: line }))}
          />
        </div>
      </div>

      <div className="mt-cols mt-cols--even">
        <Keywords t={t} ats={match.ats.after} />
        <AtsChecks t={t} locale={locale} check={match.cv.after} fileName={fileName} />
      </div>

      {match.bullets?.questions.length ? (
        <section className="card card--pad stack-sm" aria-labelledby="mt-questions">
          <h2 className="t-h3" id="mt-questions">
            {t("mt.q.title")}
          </h2>
          <p className="t-sm muted">{t("mt.q.sub")}</p>
          <ul className="mt-questions">
            {match.bullets.questions.map((item) => (
              <li key={`${item.company}-${item.bullet}`}>
                <span className="t-caption muted">
                  {t("mt.q.where", { role: item.role, company: item.company })}
                </span>
                <q>{item.bullet}</q>
                <strong>{item.question}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Offer t={t} match={match} />
      <Steps t={t} match={match} />
      <p className="t-caption muted">{t("mt.source")}</p>
    </div>
  )
}

/* ---------------------------------------------------------------- the score */

function ScoreCard({ t, report }: { t: T; report: MatchReport | null }) {
  return (
    <section className="card card--pad mt-score" aria-labelledby="mt-score">
      <h2 className="t-label" id="mt-score">
        {t("mt.score.title")}
      </h2>
      {report?.score != null && report.band ? (
        <div className="mt-score__head" data-band={report.band}>
          <strong className="mt-score__num">{t("mt.score.value", { n: report.score })}</strong>
          <div>
            <p className="mt-score__band">{t(`mt.band.${report.band}` as CopyKey)}</p>
            <p className="t-sm muted">{t(`mt.band.${report.band}.hint` as CopyKey)}</p>
          </div>
        </div>
      ) : (
        <p className="muted">{t("mt.score.none")}</p>
      )}
      {report ? (
        <div className="mt-groups">
          {IMPORTANCE.map((importance) => (
            <Group
              key={importance}
              t={t}
              label={t(GROUP_KEY[importance])}
              group={report.groups[importance]}
              hint={importance === "soft" ? t("mt.group.softHint") : null}
            />
          ))}
        </div>
      ) : null}
      {report?.critical ? (
        <p className="mt-critical" role="note">
          <ShieldAlert aria-hidden />
          {t("mt.critical", { n: report.critical })}
        </p>
      ) : null}
      {report ? <p className="t-sm muted">{t("mt.formula")}</p> : null}
    </section>
  )
}

function Group({
  t,
  label,
  group,
  hint,
}: {
  t: T
  label: string
  group: GroupScore
  hint: string | null
}) {
  return (
    <div className="mt-group">
      <div className="mt-group__head">
        <span>{label}</span>
        {group.percent != null ? (
          <strong>{t("mt.group.percent", { n: group.percent })}</strong>
        ) : null}
      </div>
      {group.percent != null ? (
        <>
          <div className="meter" aria-hidden>
            <span style={{ width: `${group.percent}%` }} />
          </div>
          <span className="t-sm muted">
            {t("mt.group.count", { met: group.met, total: group.total, partial: group.partial })}
          </span>
        </>
      ) : (
        <span className="t-sm muted">{t("mt.group.none")}</span>
      )}
      {hint ? <span className="t-caption muted">{hint}</span> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- figures */

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card stat mt-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <span>{sub}</span>
    </div>
  )
}

function atsValue(t: T, before: AtsReport, after: AtsReport): string {
  return t("mt.kpi.atsValue", { before: before.score ?? 0, after: after.score ?? 0 })
}

function Figures({ t, match, unverified }: { t: T; match: MatchNotes; unverified: number }) {
  const { before, after } = match.cv
  const bullets = match.bullets
  return (
    <section aria-label={t("mt.kpi.label")} className="stat-grid mt-figures">
      {match.ats.after.total ? (
        <Tile
          label={t("mt.kpi.ats")}
          value={atsValue(t, match.ats.before, match.ats.after)}
          sub={t("mt.kpi.atsSub", { found: match.ats.after.found, total: match.ats.after.total })}
        />
      ) : null}
      <Tile
        label={t("mt.kpi.numbers")}
        value={t("mt.kpi.change", { before: before.withNumber, after: after.withNumber })}
        sub={t("mt.kpi.numbersSub", { n: after.bullets })}
      />
      <Tile
        label={t("mt.kpi.weak")}
        value={t("mt.kpi.change", { before: before.weakStart, after: after.weakStart })}
        sub={t("mt.kpi.weakSub")}
      />
      <Tile
        label={t("mt.kpi.rewritten")}
        value={t("mt.kpi.count", { n: bullets?.rewritten ?? 0 })}
        sub={
          bullets
            ? t("mt.kpi.rewrittenSub", { checked: bullets.checked, flagged: bullets.flagged })
            : t("mt.kpi.rewrittenNone")
        }
      />
      <Tile
        label={t("mt.kpi.check")}
        value={t("mt.kpi.count", { n: unverified })}
        sub={t("mt.kpi.checkSub")}
      />
    </section>
  )
}

/* ---------------------------------------------------------------- requirements */

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
              {t(`mt.gap.${item.gap}` as CopyKey)}
            </Badge>
          ) : null}
        </p>
        {item.evidence ? (
          <p className="t-sm">{t("mt.req.evidence", { quote: item.evidence })}</p>
        ) : null}
        {item.note ? <p className="t-sm muted">{item.note}</p> : null}
      </div>
    </li>
  )
}

function Requirements({ t, report }: { t: T; report: MatchReport | null }) {
  return (
    <section className="card card--pad stack-sm" aria-labelledby="mt-req">
      <h2 className="t-h3" id="mt-req">
        {t("mt.req.title")}
      </h2>
      <p className="t-sm muted">{t("mt.req.sub")}</p>
      {report ? (
        IMPORTANCE.map((importance) => {
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
        })
      ) : (
        <p className="muted">{t("mt.req.none")}</p>
      )}
    </section>
  )
}

function SideList({
  t,
  title,
  items,
}: {
  t: T
  title: CopyKey
  items: { key: string; head?: string; body: string; quote?: string }[]
}) {
  return (
    <section className="card card--pad stack-sm">
      <h2 className="t-h3">{t(title)}</h2>
      {items.length ? (
        <ul className="mt-side">
          {items.map((item) => (
            <li key={item.key}>
              {item.head ? <strong>{item.head}</strong> : null}
              <span>{item.body}</span>
              {item.quote ? (
                <span className="t-sm muted">{t("mt.req.evidence", { quote: item.quote })}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-sm muted">{t("mt.side.none")}</p>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- keywords and ATS */

function Keywords({ t, ats }: { t: T; ats: AtsReport }) {
  return (
    <section className="card card--pad stack-sm" aria-labelledby="mt-kw">
      <h2 className="t-h3" id="mt-kw">
        {t("mt.kw.title")}
      </h2>
      {ats.keywords.length ? (
        <>
          <p className="t-sm muted">{t("mt.kw.sub")}</p>
          <ul className="mt-kws">
            {ats.keywords.map((keyword) => (
              <li key={keyword.term} data-found={keyword.count > 0}>
                <span>{keyword.term}</span>
                <span className="t-caption muted">
                  {t(keyword.importance === "required" ? "mt.kw.required" : "mt.kw.preferred")}
                </span>
                <strong>{t("mt.kw.count", { n: keyword.count })}</strong>
              </li>
            ))}
          </ul>
          {ats.keywords.some((keyword) => keyword.count === 0) ? (
            <p className="t-sm muted">{t("mt.kw.zero")}</p>
          ) : null}
          {ats.overused.length ? (
            <p className="t-sm">{t("mt.kw.overused", { terms: ats.overused.join(", ") })}</p>
          ) : null}
        </>
      ) : (
        <p className="t-sm muted">{t("mt.kw.none")}</p>
      )}
    </section>
  )
}

function CheckRow({ t, ok, children }: { t: T; ok: boolean; children: ReactNode }) {
  return (
    <li className="mt-check" data-ok={ok}>
      {ok ? <Check aria-hidden /> : <CircleAlert aria-hidden />}
      <span>
        <span className="sr-only">{t(ok ? "mt.ats.ok" : "mt.ats.fix")}: </span>
        {children}
      </span>
    </li>
  )
}

function AtsChecks({
  t,
  locale,
  check,
  fileName,
}: {
  t: T
  locale: Locale
  check: CvCheck
  fileName: string
}) {
  const words = check.profileWords
  return (
    <section className="card card--pad stack-sm" aria-labelledby="mt-ats">
      <h2 className="t-h3" id="mt-ats">
        {t("mt.ats.title")}
      </h2>
      <p className="t-sm muted">{t("mt.ats.sub")}</p>
      <ul className="mt-checks">
        <CheckRow t={t} ok={check.email}>
          {t("mt.ats.email")}
        </CheckRow>
        <CheckRow t={t} ok={check.phone}>
          {t("mt.ats.phone")}
        </CheckRow>
        <CheckRow t={t} ok={check.experience}>
          {t("mt.ats.experience")}
        </CheckRow>
        <CheckRow t={t} ok={check.education}>
          {t("mt.ats.education")}
        </CheckRow>
        <CheckRow t={t} ok={check.skills}>
          {t("mt.ats.skills")}
        </CheckRow>
        <CheckRow t={t} ok={!check.oddTitles.length}>
          {check.oddTitles.length
            ? t("mt.ats.titlesBad", { titles: check.oddTitles.join(", ") })
            : t("mt.ats.titles")}
        </CheckRow>
        <CheckRow t={t} ok={check.datesConsistent}>
          {t("mt.ats.dates")}
        </CheckRow>
        <CheckRow t={t} ok={!check.long}>
          {check.long ? t("mt.ats.longBad", { n: check.long }) : t("mt.ats.long")}
        </CheckRow>
        <CheckRow t={t} ok={words != null && words <= PROFILE_WORDS}>
          {words == null
            ? t("mt.ats.profileNone")
            : words > PROFILE_WORDS
            ? t(`mt.ats.profileBad.${pluralKind(words, locale)}` as CopyKey, { n: words })
            : t("mt.ats.profile")}
        </CheckRow>
        <CheckRow t={t} ok>
          {t("mt.ats.file", { file: fileName })}
        </CheckRow>
      </ul>
    </section>
  )
}

/* ---------------------------------------------------------------- the offer and the steps */

function Offer({ t, match }: { t: T; match: MatchNotes }) {
  const analysis = match.analysis
  return (
    <section className="card card--pad stack-sm" aria-labelledby="mt-offer">
      <h2 className="t-h3" id="mt-offer">
        {t("mt.offer.title")}
      </h2>
      {analysis ? (
        <div className="mt-cols mt-cols--even">
          <div className="stack-sm">
            {analysis.role ? <p>{analysis.role}</p> : null}
            {analysis.seniority ? (
              <p className="t-sm muted">{t("mt.offer.seniority", { level: analysis.seniority })}</p>
            ) : null}
            {analysis.responsibilities.length ? (
              <>
                <h3 className="t-label">{t("mt.offer.resp")}</h3>
                <ul className="mt-plain">
                  {analysis.responsibilities.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
          <div className="stack-sm">
            <h3 className="t-label">{t("mt.offer.flags")}</h3>
            {analysis.redFlags.length ? (
              <ul className="mt-flags">
                {analysis.redFlags.map((flag) => (
                  <li key={flag.quote}>
                    <ShieldAlert aria-hidden />
                    <span>
                      <q>{flag.quote}</q> {flag.why}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-sm muted">{t("mt.offer.flagsNone")}</p>
            )}
            {analysis.signals.length ? (
              <>
                <h3 className="t-label">{t("mt.offer.signals")}</h3>
                <ul className="mt-flags mt-flags--good">
                  {analysis.signals.map((line) => (
                    <li key={line}>
                      <ThumbsUp aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="t-sm muted">{t("mt.offer.none")}</p>
      )}
    </section>
  )
}

function Steps({ t, match }: { t: T; match: MatchNotes }) {
  const order: string[] = [...TAILOR_STEPS, ...LETTER_STEPS]
  const steps = [...match.steps].sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step))
  return (
    <section className="card card--pad stack-sm" aria-labelledby="mt-steps">
      <h2 className="t-h3" id="mt-steps">
        {t("mt.steps.title")}
      </h2>
      <ol className="cvt-run">
        {steps.map((update) => (
          <li key={update.step} className="cvt-run__step" data-state={update.state}>
            {update.state === "done" ? (
              <Check aria-hidden />
            ) : update.state === "failed" ? (
              <CircleAlert aria-hidden />
            ) : (
              <Minus aria-hidden />
            )}
            <div>
              <strong>
                {t(STEP_KEYS[update.step].label)}
                <span className="sr-only">: {t(STATE_KEY[update.state])}</span>
              </strong>
              <span className="t-sm muted">{stepLine(t, update, update.step)}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
