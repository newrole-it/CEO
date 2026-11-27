"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronRight, Plus, Search, SearchX, X } from "lucide-react"
import { salaryCurrencies, seniorityValues } from "@newrole/profile/schema"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import { Badge, Banner, EmptyState, Field } from "@newrole/ui/primitives"
import { relativeTime } from "@newrole/ui/time"
import { useCopy } from "src/app/i18n/Locale"
import { numberFormat, pluralKind, type CopyKey, type Locale, type T } from "src/app/i18n/copy"
import { DECISION_KEY, DECISION_TONE } from "src/app/offers/[id]/evaluation/decision"
import { invoke } from "src/app/rpc"
import type { SearchCounts } from "src/server/offer-search/run"
import type { ScreenReason } from "src/server/offer-search/screen"
import type { OfferSearchView, SearchResultView } from "src/server/offer-search/service"
import { toApplyPath } from "src/shared/applications"
import { filtersDiffer, PAY_MAX, SearchFilters } from "src/shared/offer-search"
import addSearchResult from "./mutations/addSearchResult"
import dismissSearchResult from "./mutations/dismissSearchResult"
import startOfferSearch from "./mutations/startOfferSearch"
import getOfferSearch from "./queries/getOfferSearch"

/** How often the page asks for the search's progress while it runs. */
const POLL_MS = 4000

const RUNNING = ["queued", "searching", "reading", "evaluating"] as const
const STATUSES = [...RUNNING, "done", "failed"] as const
const ERROR_CODES = ["no-cli", "web-failed", "interrupted", "internal"] as const
const UNREAD_REASONS = ["unreadable", "link-only", "partial"] as const
const SCREEN_REASONS = [
  "pay-below",
  "work-mode",
  "place",
  "level",
  "excluded-word",
  "too-old",
] as const satisfies readonly ScreenReason[]
const PAY_PERIODS = ["hour", "day", "month", "year"] as const
const WORK_MODES = ["remote", "hybrid", "onsite", "any"] as const
const INDUSTRY_MODES = ["stick", "prefer", "any"] as const
const FRESHNESS = [7, 14, 30] as const

const oneOf = <V extends string | number>(values: readonly V[], value: unknown): V | null =>
  values.find((candidate) => candidate === value) ?? null

type Search = NonNullable<OfferSearchView["search"]>

/** The form as typed: lists as comma-separated text, the amount as text. */
type Draft = {
  roles: string
  level: string
  skills: string
  excluded: string
  places: string
  relocation: boolean
  workMode: SearchFilters["workMode"]
  amount: string
  currency: string
  period: SearchFilters["minPay"]["period"]
  contract: "" | "uop" | "b2b"
  contracts: string
  industries: string
  industryMode: SearchFilters["industryMode"]
  languages: string
  freshnessDays: SearchFilters["freshnessDays"]
}

const LISTS = [
  "roles",
  "skills",
  "excluded",
  "places",
  "contracts",
  "industries",
  "languages",
] as const
type ListField = (typeof LISTS)[number]

const LIST_LABEL: Record<ListField, CopyKey> = {
  roles: "os.f.roles",
  skills: "os.f.skills",
  excluded: "os.f.excluded",
  places: "os.f.places",
  contracts: "os.f.contracts",
  industries: "os.f.industries",
  languages: "os.f.languages",
}

const split = (text: string) =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

function draftOf(filters: SearchFilters): Draft {
  return {
    roles: filters.roles.join(", "),
    level: filters.level ?? "",
    skills: filters.skills.join(", "),
    excluded: filters.excluded.join(", "),
    places: filters.places.join(", "),
    relocation: filters.relocation,
    workMode: filters.workMode,
    amount: filters.minPay.amount == null ? "" : String(filters.minPay.amount),
    currency: filters.minPay.currency ?? "",
    period: filters.minPay.period,
    contract: filters.minPay.contract ?? "",
    contracts: filters.contracts.join(", "),
    industries: filters.industries.join(", "),
    industryMode: filters.industryMode,
    languages: filters.languages.join(", "),
    freshnessDays: filters.freshnessDays,
  }
}

/** The filters the form holds, not yet checked against the schema's limits. */
function filtersOf(draft: Draft): SearchFilters {
  const amount = draft.amount.trim() === "" ? null : Number(draft.amount)
  return {
    roles: split(draft.roles),
    level: oneOf(seniorityValues, draft.level),
    skills: split(draft.skills),
    excluded: split(draft.excluded),
    places: split(draft.places),
    relocation: draft.relocation,
    workMode: draft.workMode,
    minPay: {
      amount: amount != null && Number.isFinite(amount) ? amount : null,
      currency: oneOf(salaryCurrencies, draft.currency),
      period: draft.period,
      contract: draft.contract || null,
    },
    contracts: split(draft.contracts),
    industries: split(draft.industries),
    industryMode: draft.industryMode,
    languages: split(draft.languages),
    freshnessDays: draft.freshnessDays,
  }
}

type FieldErrors = Partial<Record<ListField, string>>

/**
 * The schema's own limits, worded per list field (a list too long, an item too long); null when
 * the filters pass. An issue outside the lists leaves `fields` empty, and the form still says so.
 */
function errorsOf(filters: SearchFilters, t: T): { fields: FieldErrors } | null {
  const parsed = SearchFilters.safeParse(filters)
  if (parsed.success) return null
  const fields: FieldErrors = {}
  for (const issue of parsed.error.issues) {
    const field = oneOf(LISTS, issue.path[0])
    if (!field || fields[field]) continue
    const max = issue.code === "too_big" ? Number(issue.maximum) : null
    fields[field] =
      max == null
        ? t("os.f.invalid")
        : issue.path.length > 1
          ? t("os.f.tooLong", { max })
          : t("os.f.tooMany", { max })
  }
  return { fields }
}

const isRunning = (status: string | undefined) => RUNNING.some((value) => value === status)

/** "24 000–30 000 PLN miesięcznie": the Job's pay, its period read as offerPay reads it (cv-core evaluation.ts). */
function payText(result: SearchResultView, t: T, locale: Locale): string | null {
  const amount = (value: number | null) =>
    value != null && Number.isFinite(value) && value > 0 ? value : null
  const min = amount(result.salaryMin)
  const max = amount(result.salaryMax)
  if (min == null && max == null) return null
  const nf = numberFormat(locale)
  // salaryCurrency may carry the period: "PLN/month" (@newrole/ats/payload)
  const [code = "", unit = ""] = (result.salaryCurrency ?? "").trim().split("/")
  const vars = {
    min: min == null ? "" : nf.format(min),
    max: max == null ? "" : nf.format(max),
    currency: code.trim().toUpperCase(),
  }
  const key =
    min != null && max != null
      ? min === max
        ? "os.pay.one"
        : "os.pay.range"
      : min != null
        ? "os.pay.from"
        : "os.pay.upTo"
  const pay = t(key, vars).trim()
  const period = oneOf(PAY_PERIODS, unit.trim().toLowerCase())
  return period ? t(`os.pay.per.${period}`, { pay }) : pay
}

/** "jobs.example.com/careers/123": the link without its scheme and query, for a row with no title. */
function hostPath(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.pathname === "/" ? parsed.host : `${parsed.host}${parsed.pathname}`
  } catch {
    return url
  }
}

/** The header line: each count is one phrase of its own; zero counts are left out. */
function countItems(
  search: Search,
  t: T,
  locale: Locale,
  evaluationLimit: number
): { key: string; text: string; tip?: string }[] {
  const counts: SearchCounts = search.counts
  const done = search.status === "done"
  const items: { key: string; text: string; tip?: string }[] = []
  const add = (
    name:
      | "found"
      | "known"
      | "read"
      | "closed"
      | "unreadable"
      | "evaluated"
      | "notEvaluated"
      | "shown"
      | "weaker",
    n: number | undefined,
    tip?: string
  ) => {
    if (!n) return
    items.push({ key: name, text: t(`os.counts.${name}.${pluralKind(n, locale)}`, { n }), tip })
  }
  add("found", counts.found)
  add("known", counts.known)
  add("read", counts.read)
  add("closed", counts.closed)
  for (const reason of SCREEN_REASONS) {
    const n = counts.screened?.[reason]
    if (!n) continue
    items.push({
      key: reason,
      text: t(`os.counts.screened.${reason}.${pluralKind(n, locale)}`, {
        n,
        days: search.filters.freshnessDays,
      }),
    })
  }
  add("unreadable", counts.unreadable)
  // while it runs, how many are evaluated so far; once ranked, the list and the rest
  if (!done) add("evaluated", counts.evaluated)
  add(
    "notEvaluated",
    counts.notEvaluated,
    t("os.counts.notEvaluated.tip", { limit: evaluationLimit })
  )
  if (done) {
    add("shown", counts.shown)
    add("weaker", counts.weaker)
  }
  return items
}

/**
 * "Znajdź oferty": the filters (from the profile or the last search), the search's progress while
 * it runs in the server, and its results to add to Offers or dismiss. Polls the search every few
 * seconds until it is done or failed.
 */
export function OfferSearchScreen({
  initial,
  evaluationLimit,
}: {
  initial: OfferSearchView
  /** At most this many offers are evaluated per search (src/server/offer-search/run.ts) */
  evaluationLimit: number
}) {
  const { t, locale } = useCopy()
  const id = useId()
  const toast = useToast()
  const [view, setView] = useState(initial)
  const [draft, setDraft] = useState(() => draftOf(initial.proposed))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [invalid, setInvalid] = useState(false)
  const [saveToProfile, setSaveToProfile] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<CopyKey | null>(null)
  const [alreadyRunning, setAlreadyRunning] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())
  /** Results added on this page, by id: kept over polled rows until the server reports addedAt */
  const [added, setAdded] = useState<ReadonlyMap<string, { jobId: string; addedAt: Date }>>(
    () => new Map()
  )
  /** Each view request takes the next number; a reply older than the newest request is dropped */
  const latest = useRef(0)

  const search = view.search
  const running = isRunning(search?.status)

  /** Fetches the view and keeps it only if no newer request has started since. */
  const refresh = useCallback(async () => {
    const request = ++latest.current
    const next = await invoke(getOfferSearch, null)
    if (request === latest.current) setView(next)
  }, [])

  useEffect(() => {
    if (!running) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // the next poll starts only after this one has answered, so replies come back in order
    const poll = () => {
      refresh()
        // a missed poll is retried by the next one
        .catch(() => undefined)
        .finally(() => {
          if (!stopped) timer = setTimeout(poll, POLL_MS)
        })
    }
    timer = setTimeout(poll, POLL_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [running, refresh])

  const filters = useMemo(() => filtersOf(draft), [draft])
  const differs = filtersDiffer(filters, view.profileFilters)
  const fromProfile = JSON.stringify(filters) === JSON.stringify(view.profileFilters)
  const profileEmpty =
    !view.profileFilters.roles.length &&
    !view.profileFilters.skills.length &&
    !view.profileFilters.places.length &&
    view.profileFilters.level == null

  const set =
    <K extends keyof Draft>(key: K) =>
    (value: Draft[K]) =>
      setDraft((current) => ({ ...current, [key]: value }))

  async function start(accepted: SearchFilters, save: boolean) {
    setStarting(true)
    setStartError(null)
    setAlreadyRunning(false)
    try {
      const result = await invoke(startOfferSearch, { filters: accepted, saveToProfile: save })
      if ("code" in result) {
        setStartError(`os.err.${result.code}`)
        return
      }
      if (!result.started) setAlreadyRunning(true)
      setSaveToProfile(false)
      setDismissed(new Set())
      await refresh()
    } catch {
      setStartError("os.err.start")
    } finally {
      setStarting(false)
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const found = errorsOf(filters, t)
    setErrors(found?.fields ?? {})
    setInvalid(found != null)
    if (found) return
    void start(filters, saveToProfile && differs)
  }

  async function add(result: SearchResultView) {
    setBusy(result.id)
    try {
      const { jobId } = await invoke(addSearchResult, { resultId: result.id })
      setAdded((current) => new Map(current).set(result.id, { jobId, addedAt: new Date() }))
      toast.show({
        message: t("os.addedToast", { company: result.company ?? "", title: result.title ?? "" }),
      })
    } catch {
      toast.show({ message: t("os.err.add"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  async function dismiss(result: SearchResultView) {
    setDismissed((current) => new Set(current).add(result.id))
    try {
      await invoke(dismissSearchResult, { resultId: result.id })
    } catch {
      setDismissed((current) => {
        const next = new Set(current)
        next.delete(result.id)
        return next
      })
      toast.show({ message: t("os.err.dismiss"), tone: "danger" })
    }
  }

  // dismissed here stay hidden, added here stay added, whatever an earlier poll says
  const visible = (rows: SearchResultView[]) =>
    rows
      .filter((row) => !dismissed.has(row.id))
      .map((row) => {
        const local = added.get(row.id)
        return local && row.addedAt == null ? { ...row, ...local } : row
      })
  const shown = search ? visible(search.shown) : []
  const weaker = search ? visible(search.weaker) : []
  const unreadable = search ? visible(search.unreadable) : []
  const status = oneOf(STATUSES, search?.status)
  const errorCode = oneOf(ERROR_CODES, search?.errorCode) ?? "internal"
  const counts = search ? countItems(search, t, locale, evaluationLimit) : []

  // the error is drawn here, not by Field, so both it and the hint carry an id the input names
  const listField = (field: ListField) => {
    const error = errors[field]
    const hintId = `${id}-${field}-hint`
    const errorId = `${id}-${field}-error`
    return (
      <Field
        label={t(LIST_LABEL[field])}
        htmlFor={`${id}-${field}`}
        hint={
          <span id={hintId}>{t(field === "places" ? "os.f.places.hint" : "os.f.listHint")}</span>
        }
      >
        <input
          id={`${id}-${field}`}
          className="input"
          value={draft[field]}
          placeholder={t("os.f.notSet")}
          autoComplete="off"
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
          aria-invalid={error ? true : undefined}
          onChange={(event) => set(field)(event.target.value)}
        />
        {error ? (
          <p id={errorId} className="field__error" role="alert">
            {error}
          </p>
        ) : null}
      </Field>
    )
  }

  const card = (result: SearchResultView) => {
    const pay = payText(result, t, locale)
    const published = relativeTime(result.publishedAt, t)
    const isAdded = result.addedAt != null && result.jobId != null
    return (
      <li key={result.id} className="card offer-item">
        <div className="stack-sm">
          <span className="offer-item__title">{result.title ?? hostPath(result.url)}</span>
          <div className="offer-item__meta">
            {result.company ? <span>{result.company}</span> : null}
            {result.location ? <span>{result.location}</span> : null}
            {pay ? <span>{pay}</span> : null}
            {published ? <span>{t("os.r.published", { when: published })}</span> : null}
          </div>
          <div className="row">
            {result.decision ? (
              <Badge tone={DECISION_TONE[result.decision]}>
                {t(DECISION_KEY[result.decision])}
              </Badge>
            ) : null}
            {result.score != null ? (
              <Badge tone="plain">{t("ev.score.value", { n: result.score })}</Badge>
            ) : null}
            {result.factsByModel ? (
              <Badge tone="plain" tip={t("os.r.byModel.tip")}>
                {t("os.r.byModel")}
              </Badge>
            ) : null}
            {isAdded ? <Badge tone="success">{t("os.added")}</Badge> : null}
          </div>
          {result.met != null && result.required ? (
            <p className="t-sm muted">
              {t(`os.r.met.${pluralKind(result.required, locale)}`, {
                met: result.met,
                required: result.required,
              })}
            </p>
          ) : null}
          {result.topGap ? (
            <p className="t-sm muted">{t("os.r.gap", { gap: result.topGap })}</p>
          ) : null}
        </div>
        <div className="offer-item__actions">
          {isAdded ? (
            <ButtonLink href={`/offers/${result.jobId}`} size="sm" variant="outline">
              {t("os.open")}
            </ButtonLink>
          ) : (
            <>
              <Button
                size="sm"
                variant="primary"
                icon={<Plus />}
                loading={busy === result.id}
                disabled={busy != null && busy !== result.id}
                onClick={() => void add(result)}
              >
                {t("os.add")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<X />}
                disabled={busy === result.id}
                onClick={() => void dismiss(result)}
              >
                {t("os.dismiss")}
              </Button>
            </>
          )}
          <ButtonLink href={result.url} external size="sm" variant="outline">
            {t("os.openPosting")}
          </ButtonLink>
        </div>
      </li>
    )
  }

  const unreadCard = (result: SearchResultView) => {
    const reason = oneOf(UNREAD_REASONS, result.reason) ?? "unreadable"
    return (
      <li key={result.id} className="card offer-item">
        <div className="stack-sm">
          <span className="offer-item__title" style={{ overflowWrap: "anywhere" }}>
            {hostPath(result.url)}
          </span>
          <p className="t-sm muted">{t(`os.unread.${reason}`)}</p>
        </div>
        <div className="offer-item__actions">
          <ButtonLink href={result.url} external size="sm" variant="outline">
            {t("os.unread.open")}
          </ButtonLink>
          <Button size="sm" variant="ghost" icon={<X />} onClick={() => void dismiss(result)}>
            {t("os.dismiss")}
          </Button>
        </div>
      </li>
    )
  }

  const nothing = status === "done" && !shown.length && !weaker.length && !unreadable.length

  return (
    <div className="stack-lg">
      <header className="page-head">
        <p>
          <Link className="link link--quiet t-sm" href={toApplyPath(null)}>
            <ArrowLeft aria-hidden size={14} /> {t("os.back")}
          </Link>
        </p>
        <h1 className="t-h1">{t("os.title")}</h1>
        <p>{t("os.sub")}</p>
      </header>

      <form
        className="card card--pad app-add"
        aria-labelledby={`${id}-filters`}
        onSubmit={submit}
        noValidate
      >
        <div className="row row--between">
          <h2 id={`${id}-filters`} className="t-h3">
            {t("os.f.title")}
          </h2>
          {search && !fromProfile ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setErrors({})
                setInvalid(false)
                setDraft(draftOf(view.profileFilters))
              }}
            >
              {t("os.fromProfile")}
            </Button>
          ) : null}
        </div>
        {profileEmpty ? (
          <Banner tone="info">
            <p>{t("os.noProfile")}</p>
            <p>
              <Link className="link" href="/profile">
                {t("os.noProfile.link")}
              </Link>
            </p>
          </Banner>
        ) : null}

        <div className="app-add__pair">
          {listField("roles")}
          <Field label={t("os.f.level")} htmlFor={`${id}-level`}>
            <select
              id={`${id}-level`}
              className="select"
              value={draft.level}
              onChange={(event) => set("level")(event.target.value)}
            >
              <option value="">{t("os.f.level.any")}</option>
              {seniorityValues.map((level) => (
                <option key={level} value={level}>
                  {t(`sen.${level}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="app-add__pair">
          {listField("skills")}
          {listField("excluded")}
        </div>
        <div className="app-add__pair">
          <div className="stack-sm">
            {listField("places")}
            <label className="check">
              <input
                type="checkbox"
                checked={draft.relocation}
                onChange={(event) => set("relocation")(event.target.checked)}
              />
              <span>{t("os.f.relocation")}</span>
            </label>
          </div>
          <Field label={t("os.f.workMode")} htmlFor={`${id}-workMode`}>
            <select
              id={`${id}-workMode`}
              className="select"
              value={draft.workMode}
              onChange={(event) => set("workMode")(oneOf(WORK_MODES, event.target.value) ?? "any")}
            >
              {WORK_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`os.f.workMode.${mode}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset className="stack-sm" style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="field__label">{t("os.f.pay")}</legend>
          <div className="app-add__pair">
            <Field label={t("os.f.pay.amount")} htmlFor={`${id}-amount`}>
              <input
                id={`${id}-amount`}
                className="input"
                type="number"
                inputMode="numeric"
                min={0}
                max={PAY_MAX}
                value={draft.amount}
                placeholder={t("os.f.notSet")}
                onChange={(event) => set("amount")(event.target.value)}
              />
            </Field>
            <Field label={t("os.f.pay.currency")} htmlFor={`${id}-currency`}>
              <select
                id={`${id}-currency`}
                className="select"
                value={oneOf(salaryCurrencies, draft.currency) ?? ""}
                onChange={(event) => set("currency")(event.target.value)}
              >
                <option value="">{t("os.f.notSet")}</option>
                {salaryCurrencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="app-add__pair">
            <Field label={t("os.f.pay.period")} htmlFor={`${id}-period`}>
              <select
                id={`${id}-period`}
                className="select"
                value={draft.period}
                onChange={(event) =>
                  set("period")(event.target.value === "year" ? "year" : "month")
                }
              >
                <option value="month">{t("os.f.pay.period.month")}</option>
                <option value="year">{t("os.f.pay.period.year")}</option>
              </select>
            </Field>
            <Field label={t("os.f.pay.contract")} htmlFor={`${id}-contract`}>
              <select
                id={`${id}-contract`}
                className="select"
                value={draft.contract}
                onChange={(event) =>
                  set("contract")(oneOf(["uop", "b2b"] as const, event.target.value) ?? "")
                }
              >
                <option value="">{t("os.f.pay.contract.any")}</option>
                <option value="uop">{t("os.f.pay.contract.uop")}</option>
                <option value="b2b">{t("os.f.pay.contract.b2b")}</option>
              </select>
            </Field>
          </div>
        </fieldset>

        <div className="app-add__pair">
          {listField("contracts")}
          {listField("languages")}
        </div>
        <div className="app-add__pair">
          {listField("industries")}
          <Field label={t("os.f.industryMode")} htmlFor={`${id}-industryMode`}>
            <select
              id={`${id}-industryMode`}
              className="select"
              value={draft.industryMode}
              onChange={(event) =>
                set("industryMode")(oneOf(INDUSTRY_MODES, event.target.value) ?? "prefer")
              }
            >
              {INDUSTRY_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`os.f.industryMode.${mode}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="app-add__pair">
          <Field label={t("os.f.freshness")} htmlFor={`${id}-freshness`}>
            <select
              id={`${id}-freshness`}
              className="select"
              value={String(draft.freshnessDays)}
              onChange={(event) =>
                set("freshnessDays")(oneOf(FRESHNESS, Number(event.target.value)) ?? 30)
              }
            >
              {FRESHNESS.map((days) => (
                <option key={days} value={String(days)}>
                  {t(`os.f.freshness.${days}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {invalid ? (
          <p className="field__error" role="alert">
            {t("os.f.fix")}
          </p>
        ) : null}

        {view.available ? (
          <div className="stack-sm">
            {differs ? (
              <div className="stack-sm">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={saveToProfile}
                    aria-describedby={`${id}-saveProfile-hint`}
                    onChange={(event) => setSaveToProfile(event.target.checked)}
                  />
                  <span>{t("os.saveProfile")}</span>
                </label>
                <p id={`${id}-saveProfile-hint`} className="t-sm muted">
                  {t("os.saveProfile.hint")}
                </p>
              </div>
            ) : null}
            <div className="row">
              <Button
                type="submit"
                variant="primary"
                icon={<Search />}
                loading={starting}
                disabled={running}
              >
                {t("os.search")}
              </Button>
            </div>
          </div>
        ) : (
          <Banner tone="info">
            <p>{t("os.noCli")}</p>
            <p>
              <Link className="link" href="/setup">
                {t("os.noCli.link")}
              </Link>
            </p>
          </Banner>
        )}
        {startError ? (
          <p className="field__error" role="alert">
            {t(startError)}
          </p>
        ) : null}
      </form>

      <section className="stack" aria-label={t("os.results")}>
        {/* the one live region for the search's progress */}
        <div role="status" aria-live="polite" className="stack-sm">
          {alreadyRunning && running ? <p className="t-sm">{t("os.alreadyRunning")}</p> : null}
          {status && running ? (
            <>
              <p>{t(`os.status.${status}`)}</p>
              <p className="t-sm muted">{t("os.running.note")}</p>
            </>
          ) : null}
          {status === "done" ? (
            <p className="t-sm muted">
              {t("os.status.done", {
                when: relativeTime(search?.finishedAt ?? search?.createdAt, t) ?? "",
              })}
            </p>
          ) : null}
        </div>

        {search && status === "failed" ? (
          <Banner tone="danger" role="alert">
            <p>
              <strong>{t("os.status.failed")}</strong>
            </p>
            <p>{t(`os.err.${errorCode}`)}</p>
            {view.available ? (
              <p>
                <Button
                  size="sm"
                  variant="outline"
                  loading={starting}
                  onClick={() => void start(search.filters, false)}
                >
                  {t("common.retry")}
                </Button>
              </p>
            ) : null}
          </Banner>
        ) : null}

        {counts.length ? (
          <ul className="offer-item__meta" role="list" aria-label={t("os.counts.label")}>
            {counts.map((item) => (
              <li key={item.key} title={item.tip}>
                {item.text}
              </li>
            ))}
          </ul>
        ) : null}

        {nothing ? (
          <EmptyState icon={<SearchX />} title={t("os.empty.title")} body={t("os.empty")} />
        ) : null}

        {shown.length ? (
          <ul className="offer-list" role="list">
            {shown.map(card)}
          </ul>
        ) : status === "done" && weaker.length ? (
          <p className="muted">{t("os.noneShown")}</p>
        ) : null}

        {weaker.length ? (
          <details className="disclosure">
            <summary>
              <ChevronRight aria-hidden />
              {t(`os.weaker.${pluralKind(weaker.length, locale)}`, { n: weaker.length })}
            </summary>
            <div className="stack-sm">
              <p className="t-sm muted">{t("os.weaker.sub")}</p>
              <ul className="offer-list" role="list">
                {weaker.map(card)}
              </ul>
            </div>
          </details>
        ) : null}

        {unreadable.length ? (
          <div className="stack-sm">
            <h2 className="t-h3">{t("os.unread.title")}</h2>
            <p className="t-sm muted">{t("os.unread.sub")}</p>
            <ul className="offer-list" role="list">
              {unreadable.map(unreadCard)}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  )
}
