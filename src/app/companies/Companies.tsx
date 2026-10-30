"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { invoke } from "@blitzjs/rpc"
import {
  BadgeCheck,
  Building2,
  CircleAlert,
  CircleCheck,
  Ellipsis,
  ExternalLink,
  Heart,
  Info,
  Link2,
  Plus,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { pluralKind, type CopyKey } from "src/app/i18n/copy"
import { Button, ButtonLink } from "src/app/components/ds/Button"
import { useToast } from "src/app/components/ds/interactive"
import { Badge, Banner, CompanyInitial, EmptyState } from "src/app/components/ds/primitives"
import { cx } from "src/app/components/ds/cx"
import { COMPANIES_SEEN_COOKIE } from "src/app/components/site/links"
import { relativeTime } from "src/app/jobs/format"
import type { CompanySuggestions } from "src/server/discovery/similar-companies"
import type { WatchResult } from "src/server/watchlist/watch"
import watchCompany from "./mutations/watchCompany"
import unwatchCompany from "./mutations/unwatchCompany"
import { providerLabel } from "./providers"

export type WatchedView = {
  companyId: string
  name: string
  domain: string | null
  source: string
  reason: string | null
  openJobs: number
  newJobs: number
  provider: string | null
  readMode: "ats" | "career-site" | "link-only" | null
  careerPageUrl: string | null
  lastFetchedAt: string | null
}

const DISMISSED = "nr.co-dismissed.v1"

function shortUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return `${parsed.host.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`.slice(0, 44)
  } catch {
    return url.slice(0, 44)
  }
}

export function Companies({
  watched: initial,
  suggestions,
  focus,
  hasSeen,
}: {
  watched: WatchedView[]
  suggestions: CompanySuggestions
  focus: string | null
  hasSeen: boolean
}) {
  const { t, locale } = useCopy()
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState(initial)
  const [value, setValue] = useState("")
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<(WatchResult & { name: string }) | null>(null)
  const [flash, setFlash] = useState<string | null>(focus)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [simWatching, setSimWatching] = useState(new Set<string>())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.cookie = `${COMPANIES_SEEN_COOKIE}=${Date.now()}; path=/; max-age=31536000; samesite=lax`
    try {
      setDismissed(JSON.parse(localStorage.getItem(DISMISSED) || "[]") as string[])
    } catch {}
    if (focus) document.getElementById(`co-${focus}`)?.scrollIntoView({ block: "center" })
  }, [focus])

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), 1400)
    return () => window.clearTimeout(timer)
  }, [flash])

  async function submit(raw: string) {
    const text = raw.trim()
    if (!text) return
    setPending(true)
    setResult(null)
    try {
      const isUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(text) && !text.includes(" ")
      const res = await invoke(watchCompany, isUrl ? { url: text, source: "user" } : { name: text, source: "user" })
      // "watching" also means "already in the index, now watched": only say "already" when it was on the list.
      const wasWatched = rows.some((row) => row.companyId === res.companyId)
      const status: WatchResult["status"] =
        res.status === "watching" && !wasWatched
          ? providerLabel(res.provider)
            ? "resolved-ats"
            : "career-site"
          : res.status
      setResult({ ...res, status, name: text })
      if (res.companyId && res.status !== "not-found") {
        setValue("")
        setFlash(res.companyId)
        router.refresh()
      }
    } catch {
      toast.show({ message: t("co.res.error"), tone: "danger" })
    } finally {
      setPending(false)
    }
  }

  useEffect(() => setRows(initial), [initial])

  async function unwatch(row: WatchedView) {
    setRows((current) => current.filter((item) => item.companyId !== row.companyId))
    try {
      await invoke(unwatchCompany, { companyId: row.companyId })
    } catch {
      setRows((current) => [row, ...current])
      toast.show({ message: t("err.save"), tone: "danger" })
    }
  }

  async function watchSuggestion(name: string, companyId: string | undefined, reason: string) {
    const key = companyId ?? name
    setSimWatching((current) => new Set(current).add(key))
    try {
      await invoke(watchCompany, companyId ? { companyId, source: "similar", reason } : { name, source: "similar", reason })
      router.refresh()
    } catch {
      setSimWatching((current) => {
        const copy = new Set(current)
        copy.delete(key)
        return copy
      })
      toast.show({ message: t("err.save"), tone: "danger" })
    }
  }

  const sorted = [...rows].sort((a, b) => b.newJobs - a.newJobs || a.name.localeCompare(b.name, "pl"))
  const displayName = (res: WatchResult & { name: string }) =>
    rows.find((row) => row.companyId === res.companyId)?.name ?? res.name
  const resultLine = result
    ? (() => {
        const name = displayName(result)
        switch (result.status) {
          case "resolved-ats":
            return { tone: "success" as const, text: t("co.res.ats", { name, provider: providerLabel(result.provider) ?? "ATS" }) }
          case "career-site":
            return { tone: "success" as const, text: t("co.res.site", { name }) }
          case "link-only":
            return { tone: "info" as const, text: t("co.res.link", { name }) }
          case "watching":
            return { tone: undefined, text: t("co.res.already", { name }) }
          default:
            return { tone: "warning" as const, text: t("co.res.notFound") }
        }
      })()
    : null

  const visibleSuggestions = suggestions.suggestions.filter(
    (item) => !dismissed.includes(item.companyId ?? item.name)
  )

  return (
    <div className="stack-lg">
      <section className="card add-co" aria-label={t("co.input.label")}>
        <form
          className="add-co__row"
          onSubmit={(event) => {
            event.preventDefault()
            void submit(value)
          }}
        >
          <span className="input-affix input-affix--icon">
            <Plus className="input-affix__icon" aria-hidden />
            <input
              ref={inputRef}
              className="input input--lg"
              value={value}
              placeholder={t("co.input.ph")}
              aria-label={t("co.input.label")}
              onChange={(event) => setValue(event.target.value)}
              disabled={pending}
            />
          </span>
          <Button type="submit" variant="primary" loading={pending} disabled={!value.trim()}>
            {t("co.watch")}
          </Button>
        </form>
        <div aria-live="polite">
          {pending ? <p className="field__hint">{t("co.checking")}</p> : null}
          {resultLine && result ? (
            <Banner
              tone={resultLine.tone}
              icon={
                resultLine.tone === "success" ? (
                  <CircleCheck aria-hidden />
                ) : resultLine.tone === "warning" ? (
                  <CircleAlert aria-hidden />
                ) : (
                  <Info aria-hidden />
                )
              }
            >
              <p>{resultLine.text}</p>
              <details className="disclosure">
                <summary className="t-caption">{t("co.res.details")}</summary>
                <div className="t-caption">{result.message}</div>
              </details>
            </Banner>
          ) : null}
        </div>
      </section>

      <section className="stack" aria-labelledby="watched-title">
        <h2 id="watched-title" className="t-h3">
          {t("co.watched", { n: rows.length })}
        </h2>
        {sorted.length === 0 ? (
          <EmptyState icon={<Building2 />} title={t("co.empty.t")} body={t("co.empty.b")}>
            {["Allegro", "Revolut", "Booksy"].map((name) => (
              <button
                key={name}
                type="button"
                className="chip"
                onClick={() => {
                  setValue(name)
                  inputRef.current?.focus()
                }}
              >
                <Plus aria-hidden /> {name}
              </button>
            ))}
          </EmptyState>
        ) : (
          <ul className="watch-list" style={{ listStyle: "none" }}>
            {sorted.map((row) => (
              <WatchRow
                key={row.companyId}
                row={row}
                flash={flash === row.companyId}
                hasSeen={hasSeen}
                onUnwatch={() => void unwatch(row)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="stack" aria-labelledby="sim-title">
        <div className="stack-sm">
          <h2 id="sim-title" className="t-h3">
            {t("co.sim.title")}
          </h2>
          <p className="muted t-sm">{t("co.sim.sub")}</p>
        </div>
        {suggestions.status === "needs-likes" ? (
          <div className="card card--quiet card--pad row row--between">
            <span className="row">
              <Heart width={18} height={18} aria-hidden className="muted" /> {t("co.sim.needLikes")}
            </span>
            <Link className="link" href="/jobs">
              {t("co.sim.goOffers")}
            </Link>
          </div>
        ) : suggestions.status === "unavailable" || (!visibleSuggestions.length && !suggestions.canSearch) ? (
          <div className="card card--pad row row--between">
            <span className="row muted" style={{ flex: "1 1 300px" }}>
              <SquareTerminal width={18} height={18} aria-hidden /> {t("co.sim.needSearch")}
            </span>
            <ButtonLink href="/connect" variant="primary" size="sm">
              {t("co.sim.connect")}
            </ButtonLink>
          </div>
        ) : !visibleSuggestions.length ? (
          <p className="muted t-sm">{t("co.sim.none")}</p>
        ) : (
          <div className="sim-grid">
            {visibleSuggestions.map((item) => {
              const key = item.companyId ?? item.name
              const on = simWatching.has(key)
              const label = providerLabel(item.provider)
              return (
                <article key={key} className="card sim-card">
                  <div className="sim-card__top">
                    <CompanyInitial name={item.name} />
                    <strong>{item.name}</strong>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={`${t("co.sim.dismiss")}: ${item.name}`}
                      icon={<X />}
                      onClick={() => {
                        const next = [...dismissed, key]
                        setDismissed(next)
                        try {
                          localStorage.setItem(DISMISSED, JSON.stringify(next.slice(-200)))
                        } catch {}
                      }}
                    />
                  </div>
                  {item.domain ? <span className="t-sm subtle">{item.domain}</span> : null}
                  <p>{item.reason}</p>
                  <div className="row">
                    {label ? <Badge icon={<Link2 aria-hidden />}>{label}</Badge> : null}
                    {item.openJobs ? (
                      <span className="t-sm muted num">{t(`co.jobs.${pluralKind(item.openJobs, locale)}` as CopyKey, { n: item.openJobs })}</span>
                    ) : (
                      <span className="t-sm subtle">{t("co.indexNew")}</span>
                    )}
                  </div>
                  <div className="sim-card__foot">
                    <Button
                      variant={on ? "soft" : "secondary"}
                      size="sm"
                      disabled={on}
                      onClick={() => void watchSuggestion(item.name, item.companyId, item.reason)}
                    >
                      {on ? t("co.watchingBtn") : t("co.watch")}
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function WatchRow({
  row,
  flash,
  hasSeen,
  onUnwatch,
}: {
  row: WatchedView
  flash: boolean
  hasSeen: boolean
  onUnwatch: () => void
}) {
  const { t, locale } = useCopy()
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    ref.current?.querySelector<HTMLElement>(".menu__item")?.focus()
    function onDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setMenu(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [menu])
  const label = providerLabel(row.provider)
  const badge =
    row.readMode === "ats" ? (
      <Badge icon={<Link2 aria-hidden />}>{label ?? "ATS"}</Badge>
    ) : row.readMode === "career-site" ? (
      <Badge tone="success" icon={<BadgeCheck aria-hidden />}>
        {t("co.read.site")}
      </Badge>
    ) : row.readMode === "link-only" ? (
      <Badge icon={<ExternalLink aria-hidden />}>{t("src.link")}</Badge>
    ) : null
  const checked = row.lastFetchedAt
    ? t("co.checked", { when: relativeTime(row.lastFetchedAt, t) ?? "" })
    : row.readMode === "link-only"
      ? "—"
      : t("co.queued")
  const source =
    row.source === "similar" ? t("co.fromSimilar") : row.source === "mcp" ? t("co.fromClaude") : null
  return (
    <li id={`co-${row.companyId}`} className={cx("watch-row", flash && "flash")}>
      <CompanyInitial name={row.name} />
      <div className="watch-row__name">
        <strong>{row.name}</strong>
        <span>
          {row.domain ?? shortUrl(row.careerPageUrl) ?? ""}
          {source ? (
            <span title={row.reason ?? undefined}>
              {" · "}
              {source}
            </span>
          ) : null}
        </span>
      </div>
      <div className="watch-row__meta">
        {badge}
        {row.readMode === "link-only" && !row.openJobs ? (
          <span className="subtle">—</span>
        ) : (
          <Link className="link num" href={`/jobs?tab=all&company=${row.companyId}`}>
            {t(`co.jobs.${pluralKind(row.openJobs, locale)}` as CopyKey, { n: row.openJobs })}
          </Link>
        )}
        {hasSeen && row.newJobs ? <span className="badge badge--new">{t("co.newJobs", { n: row.newJobs })}</span> : null}
        <span className="subtle">{checked}</span>
      </div>
      <div className="watch-row__menu rel" ref={ref}>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("co.menu", { name: row.name })}
          aria-haspopup="menu"
          aria-expanded={menu}
          icon={<Ellipsis />}
          onClick={() => setMenu((open) => !open)}
        />
        {menu ? (
          <div className="menu" role="menu">
            {row.careerPageUrl ? (
              <a className="menu__item" role="menuitem" href={row.careerPageUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink aria-hidden /> {t("co.openCareers")}
              </a>
            ) : null}
            <button
              type="button"
              className="menu__item menu__item--danger"
              role="menuitem"
              onClick={() => {
                setMenu(false)
                onUnwatch()
              }}
            >
              <Trash2 aria-hidden /> {t("co.unwatch")}
            </button>
          </div>
        ) : null}
      </div>
    </li>
  )
}
