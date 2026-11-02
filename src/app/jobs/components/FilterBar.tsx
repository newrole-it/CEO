"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Building2, ChevronDown, Clock, House, Keyboard, MapPin, Search, TrendingUp, Wallet, X } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button } from "src/app/components/ds/Button"
import { Modal, ModalHead, useIsMobile, usePopoverFocus } from "src/app/components/ds/interactive"
import { cx } from "src/app/components/ds/cx"
import { LEVELS, filtersQuery, type FeedFilters, type Level } from "../feed-filters"
import type { FeedTab } from "../types"

type PillId = "mode" | "city" | "pay" | "level" | "source"

export function FilterBar({
  filters,
  tab,
  cities,
  onShortcuts,
  searchRef,
}: {
  filters: FeedFilters
  tab: FeedTab
  cities: { city: string; count: number }[]
  onShortcuts: () => void
  searchRef: React.RefObject<HTMLInputElement | null>
}) {
  const { t } = useCopy()
  const router = useRouter()
  const mobile = useIsMobile()
  const [open, setOpen] = useState<PillId | null>(null)
  const [draft, setDraft] = useState<FeedFilters>(filters)
  const [q, setQ] = useState(filters.q)
  const barRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  // desktop popover: focus goes in when it opens and back to its pill when it closes
  usePopoverFocus(popoverRef, mobile ? null : open, triggerRef)

  useEffect(() => {
    setDraft(filters)
    setQ(filters.q)
  }, [filters])

  useEffect(() => {
    if (!open || mobile) return
    function onDown(event: MouseEvent) {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, mobile])

  function apply(next: FeedFilters) {
    setOpen(null)
    router.push(filtersQuery(next, tab), { scroll: false })
  }

  const modeLabel =
    filters.mode === "remote"
      ? t("mode.remote")
      : filters.mode === "hybrid"
        ? t("mode.hybrid")
        : filters.mode === "onsite"
          ? t("mode.onsite")
          : null
  const cityLabel = filters.city
    ? filters.city
    : filters.where === "pl"
      ? t("filter.where.pl")
      : filters.where === "abroad"
        ? t("filter.where.abroad")
        : null
  const payLabel = filters.pay ? t("filter.payValue", { n: Math.round(filters.pay / 1000) }) : null
  const levelLabel = filters.levels.length ? filters.levels.map((level) => t(`sen.${level}`)).join(", ") : null
  const sourceLabel =
    filters.companyOnly && filters.payOnly
      ? `${t("filter.companyOnly")} +1`
      : filters.companyOnly
        ? t("filter.companyOnly")
        : filters.payOnly
          ? t("filter.payOnly")
          : null
  const anyActive = Boolean(modeLabel || cityLabel || payLabel || levelLabel || sourceLabel || filters.fresh || filters.q)

  const body: Record<PillId, ReactNode> = {
    mode: (
      <div className="radio-list" role="radiogroup" aria-label={t("filter.mode")}>
        {(["any", "remote", "hybrid", "onsite"] as const).map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name="mode"
              checked={draft.mode === mode}
              onChange={() => setDraft({ ...draft, mode })}
            />
            {mode === "any" ? t("filter.any") : t(`mode.${mode}`)}
          </label>
        ))}
      </div>
    ),
    city: <CityBody draft={draft} setDraft={setDraft} cities={cities} />,
    pay: (
      <label className="field">
        <span className="field__label">{t("filter.pay")}</span>
        <span className="input-affix">
          <input
            className="input num"
            inputMode="numeric"
            autoFocus
            value={draft.pay ? String(Math.round(draft.pay / 1000)) : ""}
            onChange={(event) => {
              const n = Number(event.target.value.replace(",", "."))
              setDraft({ ...draft, pay: Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : null })
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply(draft)
            }}
          />
          <span className="input-affix__suffix">{t("f.salaryUnit")}</span>
        </span>
        <span className="field__hint">{t("filter.payHint")}</span>
      </label>
    ),
    level: (
      <div className="radio-list">
        {LEVELS.map((level) => (
          <label key={level}>
            <input
              type="checkbox"
              checked={draft.levels.includes(level)}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  levels: event.target.checked
                    ? [...draft.levels, level]
                    : draft.levels.filter((item: Level) => item !== level),
                })
              }
            />
            {t(`sen.${level}`)}
          </label>
        ))}
      </div>
    ),
    source: (
      <div className="radio-list">
        <label>
          <input
            type="checkbox"
            checked={draft.companyOnly}
            onChange={(event) => setDraft({ ...draft, companyOnly: event.target.checked })}
          />
          {t("filter.companyOnly")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.payOnly}
            onChange={(event) => setDraft({ ...draft, payOnly: event.target.checked })}
          />
          {t("filter.payOnly")}
        </label>
      </div>
    ),
  }

  const clearOne: Record<PillId, Partial<FeedFilters>> = {
    mode: { mode: "any" },
    city: { city: "", where: "any" },
    pay: { pay: null },
    level: { levels: [] },
    source: { companyOnly: false, payOnly: false },
  }

  const pills: { id: PillId; label: string; value: string | null; icon: ReactNode }[] = [
    { id: "mode", label: t("filter.mode"), value: modeLabel, icon: <House aria-hidden /> },
    { id: "city", label: t("filter.city"), value: cityLabel, icon: <MapPin aria-hidden /> },
    { id: "pay", label: t("filter.pay"), value: payLabel, icon: <Wallet aria-hidden /> },
    { id: "level", label: t("filter.level"), value: levelLabel, icon: <TrendingUp aria-hidden /> },
    { id: "source", label: t("filter.source"), value: sourceLabel, icon: <Building2 aria-hidden /> },
  ]

  const footer = (id: PillId) => (
    <div className="popover__foot">
      <Button variant="ghost" size="sm" onClick={() => apply({ ...filters, ...clearOne[id] })}>
        {t("filter.clear")}
      </Button>
      <Button variant="primary" size="sm" onClick={() => apply(draft)}>
        {t("filter.apply")}
      </Button>
    </div>
  )

  return (
    <div className="filterbar" ref={barRef}>
      <div className="filterbar__row" role="toolbar" aria-label={t("filter.label")}>
        {pills.map((pill) => (
          <div key={pill.id} className="rel" style={{ flex: "none" }}>
            <button
              type="button"
              className={cx("pill", pill.value && "is-active", pill.value && "pill--clearable")}
              aria-haspopup="dialog"
              aria-expanded={open === pill.id}
              onClick={(event) => {
                triggerRef.current = event.currentTarget
                setDraft(filters)
                setOpen(open === pill.id ? null : pill.id)
              }}
            >
              {pill.icon}
              <span>{pill.value ?? pill.label}</span>
              {pill.value ? null : <ChevronDown aria-hidden />}
            </button>
            {/* a sibling of the pill, not inside it: a button cannot hold another button */}
            {pill.value ? (
              <button
                type="button"
                className="pill__x"
                aria-label={t("filter.remove", { name: pill.label })}
                onClick={(event) => {
                  // this button goes away with the filter; keep focus on its pill
                  ;(event.currentTarget.previousElementSibling as HTMLElement | null)?.focus()
                  apply({ ...filters, ...clearOne[pill.id] })
                }}
              >
                <X aria-hidden />
              </button>
            ) : null}
            {open === pill.id && !mobile ? (
              <div
                ref={popoverRef}
                className="popover"
                role="dialog"
                aria-label={pill.label}
                tabIndex={-1}
              >
                <div className="popover__body">{body[pill.id]}</div>
                {footer(pill.id)}
              </div>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="pill"
          aria-pressed={filters.fresh}
          onClick={() => apply({ ...filters, fresh: !filters.fresh })}
        >
          <Clock aria-hidden />
          <span>{t("filter.fresh")}</span>
        </button>
        {anyActive ? (
          <button type="button" className="link t-sm" style={{ flex: "none", padding: "0 6px" }} onClick={() => apply({ ...filters, q: "", where: "any", city: "", mode: "any", pay: null, levels: [], companyOnly: false, payOnly: false, fresh: false })}>
            {t("filter.clearAll")}
          </button>
        ) : null}
        <form
          className="feed-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            apply({ ...filters, q: q.trim() })
          }}
        >
          <Search aria-hidden />
          <input
            ref={searchRef}
            className="input"
            type="search"
            value={q}
            placeholder={t("feed.search")}
            aria-label={t("feed.searchLabel")}
            aria-keyshortcuts="/"
            onChange={(event) => setQ(event.target.value)}
          />
          {!q ? <kbd className="kbd">/</kbd> : null}
        </form>
        <Button variant="ghost" size="sm" className="is-desktop-inline" icon={<Keyboard />} onClick={onShortcuts}>
          {t("keys.link")}
        </Button>
      </div>

      {mobile && open ? (
        <Modal open kind="sheet" onClose={() => setOpen(null)} labelledBy="filter-sheet-title">
          <ModalHead title={pills.find((pill) => pill.id === open)?.label} id="filter-sheet-title" onClose={() => setOpen(null)} />
          <div className="modal__body">{body[open]}</div>
          {footer(open)}
        </Modal>
      ) : null}
    </div>
  )
}

function CityBody({
  draft,
  setDraft,
  cities,
}: {
  draft: FeedFilters
  setDraft: (filters: FeedFilters) => void
  cities: { city: string; count: number }[]
}) {
  const { t } = useCopy()
  const [search, setSearch] = useState("")
  const shown = cities.filter((item) => item.city.toLocaleLowerCase("pl").includes(search.toLocaleLowerCase("pl")))
  return (
    <div className="stack-sm">
      <div className="seg" role="radiogroup" aria-label={t("filter.city")}>
        {(["pl", "abroad", "any"] as const).map((where) => (
          <button
            key={where}
            type="button"
            role="radio"
            aria-checked={draft.where === where}
            onClick={() => setDraft({ ...draft, where })}
          >
            {t(`filter.where.${where}`)}
          </button>
        ))}
      </div>
      <input
        className="input"
        type="search"
        placeholder={t("filter.citySearch")}
        aria-label={t("filter.citySearch")}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="radio-list">
        <label>
          <input type="radio" name="city" checked={!draft.city} onChange={() => setDraft({ ...draft, city: "" })} />
          {t("filter.cityAll")}
        </label>
        {shown.map((item) => (
          <label key={item.city}>
            <input
              type="radio"
              name="city"
              checked={draft.city === item.city}
              onChange={() => setDraft({ ...draft, city: item.city })}
            />
            {item.city}
            <span className="count">{item.count}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
