"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Briefcase, Check, FileText, Search, X } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { numberFormat, pluralKind, type CopyKey } from "src/app/i18n/copy"
import { Modal, ModalHead } from "@newrole/ui/interactive"
import { cx } from "@newrole/ui/cx"
import type { TitleSuggestion } from "src/server/jobs/title-suggest"
import {
  MAX_TAGS,
  ROLE_GROUPS,
  groupOf,
  roleOf,
  suggestRoles,
  tagKey,
  titleWords,
  type Role,
} from "src/shared/title-tags"
import { loadTitleSuggestions } from "../actions"

type Option =
  | { kind: "text"; tag: string }
  | { kind: "role"; tag: string; role: Role }
  | { kind: "title"; tag: string; count: number; role: string | null }

/** What a catalog role covers, for its tooltip: its phrases, "*" shown as "…". */
function covers(role: Role): string {
  return role.match.map((phrase) => phrase.replace(/\*/g, "…")).join(", ")
}

/**
 * The search box of the offer list, as tags: what is typed becomes a tag, and an offer matching any
 * tag is shown. Empty, it lists the catalog roles to add or remove; while typing, it offers the
 * typed text, catalog roles and the titles open offers carry. A sheet on a phone.
 */
export function TagSearch({
  tags,
  onChange,
  searchRef,
  mobile,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  mobile: boolean
}) {
  const { t, locale } = useCopy()
  const nf = numberFormat(locale)
  const [text, setText] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [found, setFound] = useState<{ query: string; items: TitleSuggestion[] } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const sheetTitleId = useId()

  const query = text.trim()
  const searchable = titleWords(query).join("").length >= 2
  const keys = new Set(tags.map(tagKey))
  const full = tags.length >= MAX_TAGS

  useEffect(() => {
    if (!searchable) return
    let live = true
    const timer = setTimeout(() => {
      loadTitleSuggestions(query).then(
        (items) => live && setFound({ query, items }),
        () => live && setFound({ query, items: [] })
      )
    }, 200)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query, searchable])

  useEffect(() => {
    if (!open || mobile) return
    function onDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open, mobile])

  const options: Option[] = []
  if (query) {
    const named = roleOf(query)
    if (!named) options.push({ kind: "text", tag: query })
    const roles = suggestRoles(query)
    for (const role of named ? [named, ...roles.filter((item) => item !== named)] : roles) {
      options.push({ kind: "role", tag: role.name, role })
    }
    const titles = found && found.query === query ? found.items : []
    for (const item of titles) {
      if (tagKey(item.title) === tagKey(query)) continue
      options.push({ kind: "title", tag: item.title, count: item.count, role: item.role })
    }
  }
  const loading = searchable && found?.query !== query

  function toggle(tag: string) {
    const key = tagKey(tag)
    if (keys.has(key)) onChange(tags.filter((item) => tagKey(item) !== key))
    else if (!full) onChange([...tags, tag])
  }

  function pick(option: Option) {
    toggle(option.tag)
    setText("")
    setActive(0)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!options.length) return
      event.preventDefault()
      setOpen(true)
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((active + step + options.length) % options.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      const option = options[Math.min(active, options.length - 1)]
      if (option) pick(option)
    } else if (event.key === "Escape") {
      if (text) setText("")
      else if (!mobile) {
        setOpen(false)
        event.currentTarget.blur()
      }
    }
  }

  const input = (props: { autoFocus?: boolean; inputRef?: React.Ref<HTMLInputElement> }) => (
    <div className="feed-search" role="search">
      <Search aria-hidden />
      <input
        ref={props.inputRef}
        autoFocus={props.autoFocus}
        className="input"
        type="search"
        role="combobox"
        aria-expanded={mobile ? Boolean(query) : open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={query && options.length ? `${listId}-${active}` : undefined}
        aria-label={t("tags.label")}
        aria-keyshortcuts="/"
        placeholder={tags.length ? t("tags.placeholderMore") : t("tags.placeholder")}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setText(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
      />
      {!text && !mobile ? <kbd className="kbd">/</kbd> : null}
    </div>
  )

  // Clicks inside keep the focus in the box, so it stays open for the next tag.
  const keepFocus = (event: React.MouseEvent) => event.preventDefault()

  const catalog = (
    <div className="tag-panel__body">
      <p className="t-sm subtle">{full ? t("tags.max", { n: MAX_TAGS }) : t("tags.hint")}</p>
      {ROLE_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`${listId}-${group.id}`}>
          <h3 className="tag-panel__head" id={`${listId}-${group.id}`}>
            {t(`tags.group.${group.id}`)}
          </h3>
          <div className="chips chips--sm">
            {group.roles.map((role) => {
              const on = keys.has(tagKey(role.name))
              return (
                <button
                  key={role.name}
                  type="button"
                  className="chip chip--sm"
                  aria-pressed={on}
                  disabled={!on && full}
                  title={t("tags.covers", { list: covers(role) })}
                  onMouseDown={keepFocus}
                  onClick={() => toggle(role.name)}
                >
                  {on ? <Check aria-hidden /> : null}
                  <span>{role.name}</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )

  const groups: { id: string; label: string | null; items: { option: Option; index: number }[] }[] =
    [
      { id: "text", label: null, items: [] },
      { id: "role", label: t("tags.roles"), items: [] },
      { id: "title", label: t("tags.titles"), items: [] },
    ]
  options.forEach((option, index) => {
    groups.find((group) => group.id === option.kind)!.items.push({ option, index })
  })

  const optionBody = (option: Option): ReactNode => {
    const on = keys.has(tagKey(option.tag))
    if (option.kind === "text") {
      return (
        <>
          <Search aria-hidden />
          <span className="tag-option__main">{t("tags.free", { text: option.tag })}</span>
          <span className="tag-option__meta">
            {on ? <Check aria-hidden /> : t("tags.free.hint")}
          </span>
        </>
      )
    }
    if (option.kind === "role") {
      return (
        <>
          <Briefcase aria-hidden />
          <span
            className="tag-option__main"
            title={t("tags.covers", { list: covers(option.role) })}
          >
            {option.tag}
          </span>
          <span className="tag-option__meta">
            {on ? <Check aria-hidden /> : t(`tags.group.${groupOf(option.role)}`)}
          </span>
        </>
      )
    }
    return (
      <>
        <FileText aria-hidden />
        <span className="tag-option__main">{option.tag}</span>
        {option.role ? (
          <span className="tag-option__meta">{t("tags.inRole", { role: option.role })}</span>
        ) : null}
        <span
          className="tag-option__count"
          title={t(`tags.count.${pluralKind(option.count, locale)}` as CopyKey, {
            n: nf.format(option.count),
          })}
        >
          {on ? <Check aria-hidden /> : nf.format(option.count)}
        </span>
      </>
    )
  }

  const suggestions = (
    <div className="tag-options">
      <div role="listbox" id={listId} aria-label={t("tags.label")}>
        {groups.map((group) =>
          group.items.length ? (
            <div
              key={group.id}
              role="group"
              aria-labelledby={group.label ? `${listId}-g-${group.id}` : undefined}
            >
              {group.label ? (
                <div className="tag-panel__head tag-options__head" id={`${listId}-g-${group.id}`}>
                  {group.label}
                </div>
              ) : null}
              {group.items.map(({ option, index }) => (
                <div
                  key={`${option.kind}:${option.tag}`}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  aria-disabled={full && !keys.has(tagKey(option.tag))}
                  className={cx("tag-option", index === active && "is-active")}
                  onMouseDown={keepFocus}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(option)}
                >
                  {optionBody(option)}
                </div>
              ))}
            </div>
          ) : null
        )}
      </div>
      {loading ? (
        <p className="t-sm subtle tag-options__status" role="status">
          {t("common.loading")}
        </p>
      ) : null}
      {full ? (
        <p className="t-sm subtle tag-options__status">{t("tags.max", { n: MAX_TAGS })}</p>
      ) : null}
    </div>
  )

  const panel = query ? suggestions : catalog

  if (mobile) {
    return (
      <>
        <div className="feed-search">
          <Search aria-hidden />
          <button
            type="button"
            className="input feed-search__trigger"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            {tags.length ? t("tags.placeholderMore") : t("tags.placeholder")}
          </button>
        </div>
        {open ? (
          <Modal open kind="sheet" onClose={() => setOpen(false)} labelledBy={sheetTitleId}>
            <ModalHead title={t("tags.title")} id={sheetTitleId} onClose={() => setOpen(false)} />
            <div className="modal__body tag-sheet">
              {input({ autoFocus: true })}
              {tags.length ? <ActiveTags tags={tags} onChange={onChange} /> : null}
              {panel}
            </div>
          </Modal>
        ) : null}
      </>
    )
  }

  return (
    <div
      className="tag-search"
      ref={wrapRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      {input({ inputRef: searchRef })}
      {open ? (
        // focusable, so a click on its empty space keeps the focus inside and the panel open
        <div className="popover tag-panel" tabIndex={-1}>
          {panel}
        </div>
      ) : null}
    </div>
  )
}

/** The tags in force, "or" between them, each removable. */
export function ActiveTags({
  tags,
  onChange,
  trailing,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  trailing?: ReactNode
}) {
  const { t } = useCopy()
  return (
    <div className="tag-active" role="group" aria-label={t("tags.active")}>
      {tags.map((tag, index) => {
        const role = roleOf(tag)
        return (
          <span key={tagKey(tag)} className="tag-active__item">
            {index ? <span className="tag-active__or">{t("tags.or")}</span> : null}
            <span
              className="chip chip--sm chip--on"
              title={role ? t("tags.covers", { list: covers(role) }) : t("tags.textTip")}
            >
              {role ? <Briefcase aria-hidden /> : <Search aria-hidden />}
              <span>{tag}</span>
              <button
                type="button"
                className="chip__x"
                aria-label={t("filter.remove", { name: tag })}
                onClick={() => onChange(tags.filter((item) => item !== tag))}
              >
                <X aria-hidden />
              </button>
            </span>
          </span>
        )
      })}
      {trailing}
    </div>
  )
}
