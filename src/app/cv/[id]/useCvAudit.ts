"use client"

import { invoke } from "@blitzjs/rpc"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import { useToast } from "@newrole/ui/interactive"
import { useCopy } from "src/app/i18n/Locale"
import {
  applyNote,
  openNotes,
  placeCards,
  type AuditCategory,
  type CvAudit,
  type CvAuditNote,
} from "@newrole/cv-core/audit"
import type { CvContent } from "@newrole/cv-core/schema"
import runCvAudit from "../mutations/runCvAudit"
import setCvAuditDismissed from "../mutations/setCvAuditDismissed"
import { placeCaret } from "./Editable"
import {
  anchorTop,
  fieldElement,
  HIGHLIGHT_ACTIVE,
  markField,
  paintHighlights,
  placeholderRange,
  quoteRange,
  rangeContains,
  revealTop,
  selectRange,
} from "./audit-dom"

type Anchor = { element: HTMLElement; range: Range | null }

/**
 * The audit on the editor's sheet: the latest audit, which notes still apply to the text being
 * edited, the squiggles under them and the cards beside the sheet. Call it after usePagination,
 * so its layout effects run once page breaks have moved the text.
 */
export function useCvAudit({
  id,
  content,
  initial,
  startOpen,
  flowRef,
  flush,
  edit,
  undo,
}: {
  id: string
  content: CvContent
  initial: CvAudit | null
  startOpen: boolean
  flowRef: RefObject<HTMLElement | null>
  flush: () => Promise<boolean>
  edit: (update: (content: CvContent) => CvContent) => void
  undo: () => void
}) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const [audit, setAudit] = useState(initial)
  const [open, setOpen] = useState(startOpen)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<AuditCategory>>(() => new Set())

  const stackRef = useRef<HTMLDivElement>(null)
  const anchors = useRef(new Map<string, Anchor>())
  const pendingPlaceholder = useRef<string | null>(null)

  const allOpen = useMemo(() => openNotes(audit, content), [audit, content])
  const notes = useMemo(
    () => allOpen.filter(({ note }) => !hidden.has(note.category)),
    [allOpen, hidden]
  )
  const position = notes.findIndex(({ note }) => note.id === activeId)
  const active = position >= 0 ? notes[position].note : null

  // ---------------------------------------------------------------- squiggles
  useLayoutEffect(() => {
    const flow = flowRef.current
    anchors.current.clear()
    const groups = new Map<string, Range[]>()
    const add = (name: string, range: Range) =>
      groups.set(name, [...(groups.get(name) ?? []), range])
    let outlined: HTMLElement | null = null
    if (open && flow) {
      for (const { note, spot } of notes) {
        const element = fieldElement(flow, spot.field.field)
        if (!element) continue
        const range = note.anchor === "quote" ? quoteRange(element, note.quote) : null
        anchors.current.set(note.id, { element, range })
        if (range) add(`cva-${note.category}`, range)
        if (note.id !== activeId) continue
        if (range) add(HIGHLIGHT_ACTIVE, range)
        else outlined = element
      }
    }
    paintHighlights(groups)
    markField(flow, outlined)
  }, [open, notes, activeId, flowRef])

  useEffect(() => () => paintHighlights(new Map()), [])

  // ---------------------------------------------------------------- cards
  const layout = useCallback(() => {
    const stack = stackRef.current
    if (!stack) return
    const base = stack.getBoundingClientRect().top
    const cards = notes.flatMap(({ note }) => {
      const element = stack.querySelector<HTMLElement>(`[data-note="${CSS.escape(note.id)}"]`)
      const anchor = anchors.current.get(note.id)
      if (!element || !anchor) return []
      const want = anchorTop(anchor.element, anchor.range) - base
      return [{ id: note.id, element, want, height: element.offsetHeight }]
    })
    cards.sort((a, b) => a.want - b.want)
    const tops = placeCards(
      cards,
      cards.findIndex((card) => card.id === activeId)
    )
    cards.forEach((card, index) => {
      card.element.style.top = `${tops[index]}px`
    })
    const last = cards.length - 1
    stack.style.height = last >= 0 ? `${tops[last] + cards[last].height}px` : ""
  }, [notes, activeId])

  useLayoutEffect(() => {
    layout()
  })

  // page breaks are margins set outside React, and the flow's height is what they change
  useEffect(() => {
    const flow = flowRef.current
    const stack = stackRef.current
    if (!open || !flow || !stack) return
    let frame: number | null = null
    const schedule = () => {
      if (frame != null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        layout()
      })
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(flow)
    observer.observe(stack)
    void document.fonts?.ready.then(schedule)
    return () => {
      observer.disconnect()
      if (frame != null) window.cancelAnimationFrame(frame)
    }
  }, [open, flowRef, layout])

  // after a suggestion with a placeholder, the placeholder is what to type over
  useLayoutEffect(() => {
    const field = pendingPlaceholder.current
    const flow = flowRef.current
    if (!field || !flow) return
    pendingPlaceholder.current = null
    const element = fieldElement(flow, field)
    const range = element ? placeholderRange(element) : null
    if (element && range) selectRange(element, range)
  }, [content, flowRef])

  // ---------------------------------------------------------------- moving between notes
  const activate = useCallback((noteId: string | null, reveal = true) => {
    setActiveId(noteId)
    if (!noteId || !reveal) return
    const anchor = anchors.current.get(noteId)
    if (anchor) revealTop(anchorTop(anchor.element, anchor.range))
  }, [])

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!notes.length) return
      const at = position < 0 ? (direction > 0 ? -1 : 0) : position
      activate(notes[(at + direction + notes.length) % notes.length].note.id)
    },
    [notes, position, activate]
  )

  /** A click on the sheet: the squiggle under the pointer, else a note about that whole field. */
  const onCanvasClick = useCallback(
    (event: React.MouseEvent) => {
      if (!open) return
      const hits = notes.filter(({ note }) => {
        const range = anchors.current.get(note.id)?.range
        return range && rangeContains(range, event.clientX, event.clientY)
      })
      if (hits.length) {
        const next = hits.find(({ note }) => note.id !== activeId) ?? hits[0]
        activate(next.note.id, false)
        return
      }
      const element = (event.target as Element).closest<HTMLElement>("[data-field]")
      const about = notes.find(
        ({ note, spot }) => note.anchor !== "quote" && spot.field.field === element?.dataset.field
      )
      if (about) activate(about.note.id, false)
    },
    [open, notes, activeId, activate]
  )

  // ---------------------------------------------------------------- actions
  const run = useCallback(async () => {
    setBusy(true)
    setFailed(false)
    try {
      if (!(await flush())) throw new Error("not saved")
      const result = await invoke(runCvAudit, { id, locale })
      if (!result) throw new Error("no result")
      setAudit(result)
      setHidden(new Set())
      setActiveId(openNotes(result, content)[0]?.note.id ?? null)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }, [id, locale, flush, content])

  const toggle = useCallback(() => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (!audit && !busy) void run()
    else if (!activeId) setActiveId(allOpen[0]?.note.id ?? null)
  }, [open, audit, busy, run, activeId, allOpen])

  // opened from the "CV audit" link: first visit runs it, later ones point at the first note
  const opened = useRef(false)
  useEffect(() => {
    if (!startOpen || opened.current) return
    opened.current = true
    if (!initial) void run()
    else setActiveId(openNotes(initial, content)[0]?.note.id ?? null)
    // once, on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nextAfter = useCallback(
    (note: CvAuditNote) => {
      const rest = notes.filter((entry) => entry.note.id !== note.id)
      if (!rest.length) return null
      const at = notes.findIndex((entry) => entry.note.id === note.id)
      return rest[Math.min(at, rest.length - 1)].note.id
    },
    [notes]
  )

  const apply = useCallback(
    (note: CvAuditNote) => {
      const hasPlaceholder = /\[[^\]\n]{1,60}\]/.test(note.rewrite ?? "")
      const field = notes.find((entry) => entry.note.id === note.id)?.spot.field.field
      if (hasPlaceholder && field) pendingPlaceholder.current = field
      setActiveId(nextAfter(note))
      edit((current) => applyNote(current, note))
      toast.show({
        message: t(hasPlaceholder ? "cv.au.appliedFill" : "cv.au.applied"),
        action: { label: t("cv.ed.undo"), onClick: undo },
        duration: hasPlaceholder ? 8000 : undefined,
      })
    },
    [notes, nextAfter, edit, toast, t, undo]
  )

  /** Puts the caret on the note's words, selected, so typing replaces them. */
  const editNote = useCallback((note: CvAuditNote) => {
    const anchor = anchors.current.get(note.id)
    if (!anchor) return
    if (anchor.range) {
      selectRange(anchor.element, anchor.range)
    } else {
      anchor.element.focus()
      placeCaret(anchor.element)
    }
  }, [])

  const saveDismissed = useCallback(
    (dismissed: string[], previous: CvAudit) => {
      setAudit({ ...previous, dismissed })
      invoke(setCvAuditDismissed, { id, dismissed }).catch(() => {
        setAudit(previous)
        toast.show({ message: t("cv.err.action"), tone: "danger" })
      })
    },
    [id, toast, t]
  )

  const skip = useCallback(
    (note: CvAuditNote) => {
      if (!audit) return
      setActiveId(nextAfter(note))
      saveDismissed([...audit.dismissed, note.id], audit)
    },
    [audit, nextAfter, saveDismissed]
  )

  const restoreSkipped = useCallback(() => {
    if (audit) saveDismissed([], audit)
  }, [audit, saveDismissed])

  const toggleCategory = useCallback((category: AuditCategory) => {
    setHidden((current) => {
      const next = new Set(current)
      if (!next.delete(category)) next.add(category)
      return next
    })
  }, [])

  return {
    audit,
    open,
    busy,
    failed,
    toggle,
    run,
    notes,
    allOpen,
    active,
    position,
    activate,
    step,
    onCanvasClick,
    apply,
    editNote,
    skip,
    restoreSkipped,
    hidden,
    toggleCategory,
    stackRef,
  }
}

export type CvAuditState = ReturnType<typeof useCvAudit>
