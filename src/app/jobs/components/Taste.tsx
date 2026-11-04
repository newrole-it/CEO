"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { invoke } from "@blitzjs/rpc"
import { ChevronRight, Heart, Minus } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button } from "@newrole/ui/Button"
import { Modal, ModalHead, usePopoverFocus, useToast } from "@newrole/ui/interactive"
import { cx } from "@newrole/ui/cx"
import muteSignal from "src/app/feedback/mutations/muteSignal"
import type { PreferenceSummary } from "src/server/preferences/model"
import type { TasteItem } from "src/server/preferences/types"

function label(item: TasteItem, locale: "pl" | "en") {
  return locale === "en" ? item.tagI18n.en : item.tagI18n.pl
}

/** One learned chip with a "where this comes from" popover and "remove this signal". */
export function TasteChip({
  item,
  fresh,
  onRemoved,
}: {
  item: TasteItem
  fresh?: boolean
  onRemoved?: (key: string) => void
}) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const positive = item.sign > 0
  // focus goes into the popover when it opens and back to the chip when it closes
  usePopoverFocus(popoverRef, open, triggerRef)

  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  async function remove() {
    setBusy(true)
    try {
      await invoke(muteSignal, { key: item.key })
      setOpen(false)
      onRemoved?.(item.key)
      toast.show({
        message: `${label(item, locale)} — ${t("taste.remove").toLowerCase()} ✓`,
        action: {
          label: t("act.undo"),
          onClick: () =>
            void invoke(muteSignal, { key: item.key, restore: true }).then(() => onRemoved?.("")),
        },
      })
    } catch {
      toast.show({ message: t("err.save"), tone: "danger" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="rel" ref={ref} style={{ display: "inline-flex" }}>
      <button
        ref={triggerRef}
        type="button"
        className={cx("chip chip--sm", positive ? "chip--pos" : "chip--neg", fresh && "flash")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {positive ? null : <Minus aria-hidden />}
        <span>{label(item, locale)}</span>
      </button>
      {open ? (
        <div
          ref={popoverRef}
          className="menu"
          role="dialog"
          aria-label={label(item, locale)}
          tabIndex={-1}
          style={{ left: 0, right: "auto", width: 260 }}
        >
          <p className="menu__label" style={{ whiteSpace: "normal" }}>
            {item.source === "profile"
              ? t("taste.fromProfile")
              : t("taste.source", { n: item.count })}
          </p>
          {item.removable ? (
            <button
              type="button"
              className="menu__item"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Minus aria-hidden /> {t("taste.remove")}
            </button>
          ) : (
            <Link className="menu__item" href="/profile">
              {t("empty.filters.edit")}
            </Link>
          )}
        </div>
      ) : null}
    </span>
  )
}

export function TastePanel({
  summary,
  freshKeys,
  onChanged,
}: {
  summary: PreferenceSummary | null
  freshKeys?: Set<string>
  onChanged?: () => void
}) {
  const { t } = useCopy()
  const [how, setHow] = useState(false)
  const likes = summary?.likes.filter((item) => !summary.muted.includes(item.key)).slice(0, 8) ?? []
  const avoids =
    summary?.dislikes.filter((item) => !summary.muted.includes(item.key)).slice(0, 6) ?? []
  const empty = !likes.length && !avoids.length
  return (
    <section className="card rail-card" aria-labelledby="taste-title">
      <div className="rail-card__head">
        <h2 id="taste-title">{t("taste.title")}</h2>
        <Link className="link t-sm" href="/profile#taste">
          {t("taste.edit")}
        </Link>
      </div>
      {empty ? (
        <p>{t("taste.empty")}</p>
      ) : (
        <div className="stack-sm">
          {likes.length ? (
            <div className="taste-row">
              <span>{t("taste.likes")}</span>
              <div className="chips chips--sm">
                {likes.map((item) => (
                  <TasteChip
                    key={item.key}
                    item={item}
                    fresh={freshKeys?.has(item.key)}
                    onRemoved={onChanged}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {avoids.length ? (
            <div className="taste-row">
              <span>{t("taste.avoids")}</span>
              <div className="chips chips--sm">
                {avoids.map((item) => (
                  <TasteChip key={item.key} item={item} onRemoved={onChanged} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
      <div className="row row--between t-caption subtle">
        {summary && (summary.liked || summary.disliked) ? (
          <span>{t("taste.basis", { likes: summary.liked, passes: summary.disliked })}</span>
        ) : (
          <span />
        )}
        <button type="button" className="link t-caption" onClick={() => setHow(true)}>
          {t("taste.how")}
        </button>
      </div>
      <Modal open={how} onClose={() => setHow(false)} labelledBy="taste-how">
        <ModalHead title={t("taste.how")} id="taste-how" onClose={() => setHow(false)} />
        <div className="modal__body">
          <p className="muted">{t("taste.howBody")}</p>
        </div>
        <div className="modal__foot">
          <Button variant="primary" onClick={() => setHow(false)}>
            {t("onb.coach.ok")}
          </Button>
        </div>
      </Modal>
    </section>
  )
}

/** Tablet/mobile one-liner; opens the full panel in a bottom sheet. */
export function TasteStrip({
  summary,
  onChanged,
}: {
  summary: PreferenceSummary | null
  onChanged?: () => void
}) {
  const { t, locale } = useCopy()
  const [open, setOpen] = useState(false)
  const likes = summary?.likes.filter((item) => !summary.muted.includes(item.key)).slice(0, 4) ?? []
  return (
    <>
      <button
        type="button"
        className="taste-strip"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Heart aria-hidden />
        <span>
          {likes.length
            ? `${t("taste.likes")} ${likes.map((item) => label(item, locale)).join(" · ")}`
            : t("taste.empty")}
        </span>
        <ChevronRight aria-hidden />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} kind="sheet" label={t("taste.title")}>
        <div className="modal__body" style={{ paddingTop: 16 }}>
          <TastePanel summary={summary} onChanged={onChanged} />
        </div>
      </Modal>
    </>
  )
}
