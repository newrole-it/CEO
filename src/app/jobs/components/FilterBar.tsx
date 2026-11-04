"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  Building,
  Building2,
  ChevronDown,
  Clock,
  House,
  Keyboard,
  MapPin,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button } from "@newrole/ui/Button"
import { Modal, ModalHead, useIsMobile, usePopoverFocus } from "@newrole/ui/interactive"
import { cx } from "@newrole/ui/cx"
import { loadCities } from "../actions"
import {
  LEVELS,
  clearedFilters,
  filtersQuery,
  noCountry,
  type FeedFilters,
  type Level,
} from "../feed-filters"
import { countryLabel } from "../format"
import type { FeedTab } from "../types"
import { ActiveTags, TagSearch } from "./TagSearch"

type PillId = "mode" | "city" | "pay" | "level" | "source"
type City = { city: string; count: number }

export function FilterBar({
  filters,
  tab,
  cities,
  countries,
  country,
  ownCountry,
  companyName,
  lead,
  onShortcuts,
  searchRef,
}: {
  filters: FeedFilters
  tab: FeedTab
  cities: City[]
  countries: { country: string; count: number }[]
  country: string | null
  ownCountry: string | null
  companyName: string | null
  /** Shown first in the row (the sort on a phone). */
  lead?: ReactNode
  onShortcuts: () => void
  searchRef: React.RefObject<HTMLInputElement | null>
}) {
  const { t, locale } = useCopy()
  const router = useRouter()
  const mobile = useIsMobile()
  const [open, setOpen] = useState<PillId | null>(null)
  const [draft, setDraft] = useState<FeedFilters>(filters)
  // Shown at once; the list follows when the page comes back with them.
  const [tags, setTags] = useState(filters.tags)
  const barRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  // desktop popover: focus goes in when it opens and back to its pill when it closes
  usePopoverFocus(popoverRef, mobile ? null : open, triggerRef)

  useEffect(() => {
    setDraft(filters)
    setTags(filters.tags)
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

  function applyTags(next: string[]) {
    setTags(next)
    router.push(filtersQuery({ ...filters, tags: next }, tab), { scroll: false })
  }

  const modeLabel =
    filters.mode === "remote"
      ? t("mode.remote")
      : filters.mode === "hybrid"
      ? t("mode.hybrid")
      : filters.mode === "onsite"
      ? t("mode.onsite")
      : null
  // The place pill always says where the list is: a city, else the country (the person's own by
  // default, removable like any other), else every country, which is no filter at all.
  const placeLabel = filters.city ? filters.city : country ? countryLabel(country, locale) : null
  const cityLabel = placeLabel && country && filters.remoteHere ? `${placeLabel} +1` : placeLabel
  const payLabel = filters.pay
    ? t("filter.payValue", {
        n: (filters.pay / 1000).toLocaleString(locale, { maximumFractionDigits: 1 }),
      })
    : null
  const levelLabel = filters.levels.length
    ? filters.levels.map((level) => t(`sen.${level}`)).join(", ")
    : null
  const sourceLabel =
    filters.companyOnly && filters.payOnly
      ? `${t("filter.companyOnly")} +1`
      : filters.companyOnly
      ? t("filter.companyOnly")
      : filters.payOnly
      ? t("filter.payOnly")
      : null
  const anyActive = Boolean(
    modeLabel ||
      cityLabel ||
      payLabel ||
      levelLabel ||
      sourceLabel ||
      filters.fresh ||
      filters.tags.length ||
      filters.company
  )

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
    city: (
      <CityBody
        draft={draft}
        setDraft={setDraft}
        cities={cities}
        countries={countries}
        country={country}
        ownCountry={ownCountry}
      />
    ),
    pay: (
      <PayField
        value={draft.pay}
        onChange={(pay) => setDraft({ ...draft, pay })}
        onEnter={() => apply(draft)}
      />
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
    // Removes what the pill says: a city leaves its country, a country leaves every country.
    city: filters.city
      ? { city: "", country: country && country !== ownCountry ? country : filters.country }
      : { city: "", country: noCountry(ownCountry), remoteHere: false },
    pay: { pay: null },
    level: { levels: [] },
    source: { companyOnly: false, payOnly: false },
  }

  const pills: {
    id: PillId
    label: string
    value: string | null
    /** What the pill says with no value, when the bare label would hide where the list is. */
    idle?: string
    icon: ReactNode
  }[] = [
    { id: "mode", label: t("filter.mode"), value: modeLabel, icon: <House aria-hidden /> },
    {
      id: "city",
      label: t("filter.city"),
      value: cityLabel,
      idle: t("filter.country.any"),
      icon: <MapPin aria-hidden />,
    },
    { id: "pay", label: t("filter.pay"), value: payLabel, icon: <Wallet aria-hidden /> },
    { id: "level", label: t("filter.level"), value: levelLabel, icon: <TrendingUp aria-hidden /> },
    {
      id: "source",
      label: t("filter.source"),
      value: sourceLabel,
      icon: <Building2 aria-hidden />,
    },
  ]

  // The place popover's Clear clears the whole place; the pill's x goes one step at a time.
  const clearFoot = (id: PillId): Partial<FeedFilters> =>
    id === "city" ? { city: "", country: noCountry(ownCountry), remoteHere: false } : clearOne[id]

  const footer = (id: PillId) => (
    <div className="popover__foot">
      <Button variant="ghost" size="sm" onClick={() => apply({ ...filters, ...clearFoot(id) })}>
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
        {lead}
        {filters.company ? (
          <div className="rel" style={{ flex: "none" }}>
            <span className="pill is-active pill--clearable">
              <Building aria-hidden />
              <span>{companyName ?? t("filter.company")}</span>
            </span>
            <button
              type="button"
              className="pill__x"
              aria-label={t("filter.remove", { name: t("filter.company") })}
              onClick={() => apply({ ...filters, company: "" })}
            >
              <X aria-hidden />
            </button>
          </div>
        ) : null}
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
              <span>{pill.value ?? pill.idle ?? pill.label}</span>
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
          <button
            type="button"
            className="link t-sm"
            style={{ flex: "none", padding: "0 6px" }}
            onClick={() => apply(clearedFilters(filters, ownCountry))}
          >
            {t("filter.clearAll")}
          </button>
        ) : null}
        <TagSearch tags={tags} onChange={applyTags} searchRef={searchRef} mobile={mobile} />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className="is-desktop-inline"
          icon={<Keyboard />}
          aria-label={t("keys.link")}
          title={t("keys.link")}
          onClick={onShortcuts}
        />
      </div>

      {tags.length ? (
        <ActiveTags
          tags={tags}
          onChange={applyTags}
          trailing={
            <button type="button" className="link t-sm" onClick={() => applyTags([])}>
              {t("tags.clear")}
            </button>
          }
        />
      ) : null}

      {mobile && open ? (
        <Modal open kind="sheet" onClose={() => setOpen(null)} labelledBy="filter-sheet-title">
          <ModalHead
            title={pills.find((pill) => pill.id === open)?.label}
            id="filter-sheet-title"
            onClose={() => setOpen(null)}
          />
          <div className="modal__body">{body[open]}</div>
          {footer(open)}
        </Modal>
      ) : null}
    </div>
  )
}

function PayField({
  value,
  onChange,
  onEnter,
}: {
  value: number | null
  onChange: (pay: number | null) => void
  onEnter: () => void
}) {
  const { t } = useCopy()
  // The typed text stays as typed, so "12," or "12.5" can be finished.
  const [text, setText] = useState(value ? String(value / 1000) : "")
  return (
    <label className="field">
      <span className="field__label">{t("filter.pay")}</span>
      <span className="input-affix">
        <input
          className="input num"
          inputMode="decimal"
          autoFocus
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            const n = Number(event.target.value.replace(",", ".").replace(/\s/g, ""))
            onChange(Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : null)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") onEnter()
          }}
        />
        <span className="input-affix__suffix">{t("f.salaryUnit")}</span>
      </span>
      <span className="field__hint">{t("filter.payHint")}</span>
    </label>
  )
}

function CityBody({
  draft,
  setDraft,
  cities,
  countries,
  country,
  ownCountry,
}: {
  draft: FeedFilters
  setDraft: (filters: FeedFilters) => void
  cities: City[]
  countries: { country: string; count: number }[]
  country: string | null
  ownCountry: string | null
}) {
  const { t, locale } = useCopy()
  const [search, setSearch] = useState("")
  const picked = draft.country === "any" ? null : draft.country || ownCountry
  // The page brings the cities of the country on screen; another country picked here loads its own.
  const [loaded, setLoaded] = useState<{ country: string | null; cities: City[] }>({
    country,
    cities,
  })
  useEffect(() => {
    if (picked === loaded.country) return
    let live = true
    loadCities(picked).then(
      (list) => live && setLoaded({ country: picked, cities: list }),
      () => live && setLoaded({ country: picked, cities: [] })
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked])
  const list = loaded.country === picked ? loaded.cities : null
  const shown = (list ?? []).filter((item) =>
    item.city.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale))
  )
  const options = countries.filter((item) => item.country !== ownCountry)
  return (
    <div className="stack-sm">
      <label className="field">
        <span className="field__label">{t("filter.country")}</span>
        <select
          className="input"
          value={draft.country}
          onChange={(event) => {
            const value = event.target.value
            // every country leaves no other one to tie a remote offer to
            const every = value === "any" || (!value && !ownCountry)
            setDraft({ ...draft, country: value, city: "", remoteHere: draft.remoteHere && !every })
          }}
        >
          {ownCountry ? (
            <option value="">
              {t("filter.country.own", { country: countryLabel(ownCountry, locale) })}
            </option>
          ) : null}
          <option value={ownCountry ? "any" : ""}>{t("filter.country.any")}</option>
          {options.map((item) => (
            <option key={item.country} value={item.country}>
              {countryLabel(item.country, locale)} ({item.count})
            </option>
          ))}
        </select>
        <span className="field__hint">{t("filter.country.hint")}</span>
      </label>
      {picked ? (
        <div className="radio-list">
          <label>
            <input
              type="checkbox"
              checked={draft.remoteHere}
              aria-describedby="remote-here-hint"
              onChange={(event) => setDraft({ ...draft, remoteHere: event.target.checked })}
            />
            {t("filter.remoteHere")}
          </label>
          <span className="field__hint" id="remote-here-hint">
            {t("filter.remoteHere.hint")}
          </span>
        </div>
      ) : null}
      {list === null ? (
        <p className="t-sm subtle" role="status">
          {t("common.loading")}
        </p>
      ) : list.length ? (
        <>
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
              <input
                type="radio"
                name="city"
                checked={!draft.city}
                onChange={() => setDraft({ ...draft, city: "" })}
              />
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
        </>
      ) : null}
    </div>
  )
}
