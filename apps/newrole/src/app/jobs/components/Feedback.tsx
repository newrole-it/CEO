"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Briefcase,
  Building2,
  Check,
  Code,
  Factory,
  FileText,
  Heart,
  House,
  MapPin,
  PenLine,
  Target,
  TrendingUp,
  Undo2,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button } from "@newrole/ui/Button"
import { Skeleton } from "@newrole/ui/primitives"
import { FEEDBACK_ASPECTS, type FeedbackAspect } from "src/shared/feedback-aspects"
import type { FeedbackPrompt } from "src/server/preferences/types"

export const ASPECT_ICON: Record<FeedbackAspect, LucideIcon> = {
  role: Briefcase,
  stack: Code,
  seniority: TrendingUp,
  salary: Wallet,
  remote: House,
  location: MapPin,
  company: Building2,
  industry: Factory,
  scope: Target,
  contract: FileText,
}

export type ChipPick = { aspect: FeedbackAspect; tag: string | null; label: string; on: boolean }

function chipsFromPrompt(prompt: FeedbackPrompt | null, t: (key: CopyKey) => string): ChipPick[] {
  if (!prompt) return []
  const out: ChipPick[] = []
  for (const suggestion of prompt.suggestions) {
    if (!suggestion.tags.length) {
      out.push({
        aspect: suggestion.aspect,
        tag: null,
        label: t(`aspect.${suggestion.aspect}` as CopyKey),
        on: suggestion.preselected,
      })
    } else {
      for (const tag of suggestion.tags) {
        out.push({ aspect: suggestion.aspect, tag, label: tag, on: suggestion.preselected })
      }
    }
  }
  return out
}

/** "Co Ci się w niej podoba?" — inline panel (desktop / drawer) or sheet body (mobile). */
export function LikePanel({
  prompt,
  loading,
  onSave,
  onSkip,
  autoFocus = true,
  idPrefix,
}: {
  prompt: FeedbackPrompt | null
  loading: boolean
  onSave: (input: { aspects: FeedbackAspect[]; tags: string[]; note: string | null }) => void
  onSkip: () => void
  autoFocus?: boolean
  idPrefix: string
}) {
  const { t } = useCopy()
  const base = useMemo(() => chipsFromPrompt(prompt, t), [prompt, t])
  const [chips, setChips] = useState<ChipPick[]>(base)
  const [showAll, setShowAll] = useState(false)
  const [other, setOther] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const titleId = `${idPrefix}-like-title`

  useEffect(() => setChips(base), [base])

  useEffect(() => {
    if (!autoFocus || loading) return
    root.current?.querySelector<HTMLElement>(".chip, .btn")?.focus({ preventScroll: true })
  }, [autoFocus, loading])

  const visible = showAll ? chips : chips.slice(0, 9)
  const present = new Set(chips.map((chip) => chip.aspect))
  const extra = FEEDBACK_ASPECTS.filter((aspect) => !present.has(aspect))

  function toggle(index: number) {
    setChips((current) =>
      current.map((chip, at) => (at === index ? { ...chip, on: !chip.on } : chip))
    )
  }

  function submit() {
    const picked = chips.filter((chip) => chip.on)
    onSave({
      aspects: [...new Set(picked.map((chip) => chip.aspect))],
      tags: picked.flatMap((chip) => (chip.tag ? [chip.tag] : [])),
      note: note.trim() ? note.trim().slice(0, 280) : null,
    })
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const inField = (event.target as HTMLElement).closest("textarea, input")
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      onSkip()
      return
    }
    if (inField) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        submit()
      }
      return
    }
    if (event.key === "Enter" && !(event.target as HTMLElement).closest("button")) {
      event.preventDefault()
      submit()
      return
    }
    if (/^[1-9]$/.test(event.key)) {
      const index = Number(event.key) - 1
      if (index < visible.length) {
        event.preventDefault()
        event.stopPropagation()
        toggle(index)
      }
      return
    }
    if (event.key === "n" || event.key === "N") {
      event.preventDefault()
      event.stopPropagation()
      setNoteOpen(true)
      window.setTimeout(() => noteRef.current?.focus(), 0)
    }
    // keep feed shortcuts (J/K/A) from firing while the panel has focus
    if (["j", "k", "a", "z", "J", "K", "A", "Z", "o", "O"].includes(event.key))
      event.stopPropagation()
  }

  return (
    <div
      ref={root}
      className="like-panel"
      role="group"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="like-panel__head">
        <div>
          <h3 id={titleId}>{t("like.title")}</h3>
          <p>{t("like.sub")}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onSkip} kbd="Esc" className="show-kbd">
          {t("like.skip")}
        </Button>
      </div>
      <div className="chips">
        {loading
          ? [72, 64, 96, 80, 110, 70].map((w, index) => (
              <Skeleton key={index} w={w} h={32} r={999} />
            ))
          : visible.map((chip, index) => {
              const Icon = chip.on ? Check : ASPECT_ICON[chip.aspect]
              return (
                <button
                  key={`${chip.aspect}-${chip.tag ?? ""}-${index}`}
                  type="button"
                  className="chip"
                  aria-pressed={chip.on}
                  onClick={() => toggle(index)}
                  title={t(`aspect.${chip.aspect}` as CopyKey)}
                >
                  <Icon aria-hidden />
                  <span>{chip.label}</span>
                  {index < 9 ? (
                    <span className="chip__num" aria-hidden>
                      {index + 1}
                    </span>
                  ) : null}
                </button>
              )
            })}
        {!loading && !showAll && chips.length > 9 ? (
          <button type="button" className="chip chip--ghost" onClick={() => setShowAll(true)}>
            +{chips.length - 9}
          </button>
        ) : null}
        {!loading && !other && extra.length ? (
          <button type="button" className="chip chip--ghost" onClick={() => setOther(true)}>
            {t("like.other")}
          </button>
        ) : null}
        {other
          ? extra.map((aspect) => {
              const Icon = ASPECT_ICON[aspect]
              return (
                <button
                  key={aspect}
                  type="button"
                  className="chip"
                  aria-pressed={false}
                  onClick={() =>
                    setChips((current) => [
                      ...current,
                      { aspect, tag: null, label: t(`aspect.${aspect}` as CopyKey), on: true },
                    ])
                  }
                >
                  <Icon aria-hidden />
                  <span>{t(`aspect.${aspect}` as CopyKey)}</span>
                </button>
              )
            })
          : null}
      </div>
      {noteOpen ? (
        <div className="field">
          <label className="sr-only" htmlFor={`${idPrefix}-note`}>
            {t("like.noteLabel")}
          </label>
          <textarea
            ref={noteRef}
            id={`${idPrefix}-note`}
            className="textarea"
            rows={2}
            maxLength={280}
            style={{ minHeight: 64 }}
            placeholder={t("like.note.ph")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          {note.length >= 240 ? <p className="like-panel__count">{note.length}/280</p> : null}
        </div>
      ) : null}
      <div className="like-panel__foot">
        {!noteOpen ? (
          <button
            type="button"
            className="link link--quiet t-sm row"
            style={{ gap: 6 }}
            onClick={() => {
              setNoteOpen(true)
              window.setTimeout(() => noteRef.current?.focus(), 0)
            }}
          >
            <PenLine width={16} height={16} aria-hidden /> {t("like.note")}
          </button>
        ) : (
          <span />
        )}
        <Button variant="primary" onClick={submit} kbd="↵" className="show-kbd">
          {t("like.save")}
        </Button>
      </div>
    </div>
  )
}

/** After 3 skips in a row: one-line prompt, one tap saves that chip. */
export function CompactPrompt({
  prompt,
  onPick,
  onMore,
}: {
  prompt: FeedbackPrompt | null
  onPick: (chip: ChipPick) => void
  onMore: () => void
}) {
  const { t } = useCopy()
  const chips = chipsFromPrompt(prompt, t).slice(0, 3)
  return (
    <div className="compact-prompt" onClick={(event) => event.stopPropagation()}>
      <span className="muted">{t("like.compact")}</span>
      {chips.map((chip, index) => (
        <button key={index} type="button" className="chip chip--sm" onClick={() => onPick(chip)}>
          {chip.label}
        </button>
      ))}
      <button type="button" className="link t-sm" onClick={onMore}>
        {t("like.compact.more")}
      </button>
    </div>
  )
}

const PASS_ORDER: FeedbackAspect[] = [
  "salary",
  "stack",
  "seniority",
  "location",
  "company",
  "industry",
]

function passChips(
  prompt: FeedbackPrompt | null,
  t: (key: CopyKey, vars?: Record<string, string | number>) => string
) {
  const byAspect = new Map<FeedbackAspect, string | null>()
  for (const suggestion of prompt?.suggestions ?? []) {
    if (!PASS_ORDER.includes(suggestion.aspect) || byAspect.has(suggestion.aspect)) continue
    byAspect.set(suggestion.aspect, suggestion.tags[0] ?? null)
  }
  const order = [
    ...[...byAspect.keys()],
    ...PASS_ORDER.filter((aspect) => !byAspect.has(aspect)),
  ].slice(0, 6)
  return order.map((aspect) => {
    const tag = byAspect.get(aspect) ?? null
    let label = t(`aspect.${aspect}` as CopyKey)
    if (tag) {
      if (aspect === "salary") label = t("pass.salary", { amount: tag })
      else if (aspect === "location") label = t("pass.locationOnly", { city: tag })
      else label = tag
    }
    return { aspect, tag, label }
  })
}

/** "Odrzucono. Dlaczego?" strip. Auto-dismisses after 6 s (paused on hover/focus). */
export function PassStrip({
  title,
  prompt,
  onReason,
  onUndo,
  onDone,
}: {
  title: string
  prompt: FeedbackPrompt | null
  onReason: (aspect: FeedbackAspect, tag: string | null) => void
  onUndo: () => void
  onDone: () => void
}) {
  const { t } = useCopy()
  const [picked, setPicked] = useState<string[]>([])
  const [paused, setPaused] = useState(false)
  const timer = useRef<number | null>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const chips = passChips(prompt, t)

  useEffect(() => {
    if (paused) return
    const wait = picked.length ? 1200 : 6000
    timer.current = window.setTimeout(() => doneRef.current(), wait)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [paused, picked.length])

  return (
    <div
      className="strip strip--pass"
      role="group"
      aria-label={t("pass.title")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setPaused(false)
      }}
    >
      <X aria-hidden />
      <span className="strip__text">
        {picked.length ? (
          <span role="status">{t("pass.thanks")}</span>
        ) : (
          <>
            <strong>{t("pass.title")}</strong> <span className="subtle">· {title}</span>
          </>
        )}
      </span>
      <div className="chips chips--sm">
        {chips.map((chip, index) => {
          const key = `${chip.aspect}:${chip.tag ?? ""}`
          const on = picked.includes(key)
          return (
            <button
              key={key}
              type="button"
              className="chip chip--sm"
              aria-pressed={on}
              onClick={() => {
                if (on) return
                setPicked((current) => [...current, key])
                setPaused(false)
                onReason(chip.aspect, chip.tag)
              }}
            >
              {chip.label}
              <span className="chip__num" aria-hidden>
                {index + 1}
              </span>
            </button>
          )
        })}
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={<Undo2 />}
        onClick={onUndo}
        kbd="Z"
        className="show-kbd"
      >
        {t("act.undo")}
      </Button>
    </div>
  )
}

export function LikedStrip({
  title,
  company,
  onUndo,
}: {
  title: string
  company: string
  onUndo: () => void
}) {
  const { t } = useCopy()
  return (
    <div className="strip strip--liked">
      <Heart aria-hidden />
      <span className="strip__text">{t("strip.liked", { title, company })}</span>
      <Button variant="ghost" size="sm" icon={<Undo2 />} onClick={onUndo}>
        {t("act.undo")}
      </Button>
    </div>
  )
}

export function AppliedStrip({ onUndo }: { onUndo: () => void }) {
  const { t } = useCopy()
  return (
    <div className="strip">
      <Check aria-hidden />
      <span className="strip__text">{t("strip.applied")}</span>
      <Button variant="ghost" size="sm" icon={<Undo2 />} onClick={onUndo}>
        {t("act.undo")}
      </Button>
    </div>
  )
}
