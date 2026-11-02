"use client"

import { invoke } from "@blitzjs/rpc"
import { useCallback, useEffect, useRef, useState } from "react"
import { cvContentError, cvTooLongLimit, type CvContent } from "src/shared/cv/schema"
import updateCvDocument from "../mutations/updateCvDocument"

export type CvLanguage = "pl" | "en"
/** "conflict": the stored CV is newer than this tab's copy; saving stops until a reload */
export type SaveState = "saved" | "saving" | "error" | "conflict"

type Doc = { title: string; language: CvLanguage; content: CvContent }

function isConflict(error: unknown): boolean {
  return error instanceof Error && error.message === "conflict"
}

const AUTOSAVE_MS = 800
const HISTORY_LIMIT = 200
/** Keystrokes in one field within this window undo together */
const GROUP_MS = 1000

/**
 * The document being edited: content with undo/redo snapshots, title and language, and
 * autosave 0.8 s after the last change. Saves run one at a time; a change made during a save is
 * sent right after it. Nothing is lost when a save fails: the state says so and retry() resends.
 * Each save carries the updatedAt this tab knows (`loadedAt`, then each save's reply); when the
 * server has a newer one, another tab saved in between and the state turns to "conflict".
 */
export function useCvDocument(id: string, initial: Doc, loadedAt: Date) {
  const [doc, setDoc] = useState<Doc>(initial)
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveLimit, setSaveLimit] = useState<number | null>(null)
  const [, setHistoryTick] = useState(0)

  const latest = useRef(doc)
  const saved = useRef(initial)
  const past = useRef<CvContent[]>([])
  const future = useRef<CvContent[]>([])
  const lastEdit = useRef<{ group: string | null; at: number }>({ group: null, at: 0 })
  const timer = useRef<number | null>(null)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const version = useRef(loadedAt)
  const conflicted = useRef(false)

  const clearTimer = () => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
  }

  const flush = useCallback((): Promise<boolean> => {
    clearTimer()
    if (inFlight.current) return inFlight.current.then(() => flush())
    // a newer save exists elsewhere: sending this copy again would only be refused again
    if (conflicted.current) return Promise.resolve(false)
    const snapshot = latest.current
    const base = saved.current
    const patch = {
      id,
      ...(snapshot.title !== base.title ? { title: snapshot.title } : {}),
      ...(snapshot.language !== base.language ? { language: snapshot.language } : {}),
      ...(snapshot.content !== base.content ? { content: snapshot.content } : {}),
    }
    if (Object.keys(patch).length === 1) {
      setSaveState("saved")
      setSaveError(null)
      return Promise.resolve(true)
    }
    setSaveState("saving")
    const run = invoke(updateCvDocument, { ...patch, baseUpdatedAt: version.current }).then(
      (result) => {
        inFlight.current = null
        saved.current = snapshot
        if (result) version.current = result.updatedAt
        setSaveError(null)
        if (latest.current !== snapshot) return flush()
        setSaveState("saved")
        return true
      },
      (error: unknown) => {
        inFlight.current = null
        if (isConflict(error)) {
          conflicted.current = true
          setSaveError(null)
          setSaveLimit(null)
          setSaveState("conflict")
          return false
        }
        const invalid = cvContentError(snapshot.content)
        // Invalid content is the person's to fix and the toolbar says how; anything else is a bug.
        if (!invalid) console.error("CV save failed", error)
        setSaveError(invalid)
        setSaveLimit(cvTooLongLimit(snapshot.content))
        setSaveState("error")
        return false
      }
    )
    inFlight.current = run
    return run
  }, [id])

  const change = useCallback(
    (next: Doc) => {
      latest.current = next
      setDoc(next)
      // after a conflict the message stays until the person reloads
      if (conflicted.current) return
      setSaveState("saving")
      clearTimer()
      timer.current = window.setTimeout(() => void flush(), AUTOSAVE_MS)
    },
    [flush]
  )

  /** One edit. `group` merges quick successive edits of one field into a single undo step. */
  const edit = useCallback(
    (update: (content: CvContent) => CvContent, group?: string) => {
      const current = latest.current.content
      const next = update(current)
      if (next === current) return
      const now = Date.now()
      const merge =
        Boolean(group) && lastEdit.current.group === group && now - lastEdit.current.at < GROUP_MS
      if (!merge) {
        past.current.push(current)
        if (past.current.length > HISTORY_LIMIT) past.current.shift()
      }
      future.current = []
      lastEdit.current = { group: group ?? null, at: now }
      change({ ...latest.current, content: next })
      setHistoryTick((tick) => tick + 1)
    },
    [change]
  )

  const undo = useCallback(() => {
    const previous = past.current.pop()
    if (!previous) return
    future.current.push(latest.current.content)
    lastEdit.current = { group: null, at: 0 }
    change({ ...latest.current, content: previous })
    setHistoryTick((tick) => tick + 1)
  }, [change])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(latest.current.content)
    lastEdit.current = { group: null, at: 0 }
    change({ ...latest.current, content: next })
    setHistoryTick((tick) => tick + 1)
  }, [change])

  /**
   * Content the server already stored (a restored version, a new generation): nothing to save,
   * and the state before it is one undo away. Call flush() first, so no save is pending.
   * `updatedAt` is the document's after that write: this tab now matches what is stored.
   */
  const replace = useCallback((next: Pick<Doc, "content" | "language">, updatedAt: Date) => {
    clearTimer()
    version.current = updatedAt
    conflicted.current = false
    past.current.push(latest.current.content)
    if (past.current.length > HISTORY_LIMIT) past.current.shift()
    future.current = []
    lastEdit.current = { group: null, at: 0 }
    const updated = { ...latest.current, ...next }
    latest.current = updated
    saved.current = updated
    setDoc(updated)
    setSaveState("saved")
    setSaveError(null)
    setHistoryTick((tick) => tick + 1)
  }, [])

  const setTitle = useCallback((title: string) => change({ ...latest.current, title }), [change])
  const setLanguage = useCallback(
    (language: CvLanguage) => change({ ...latest.current, language }),
    [change]
  )

  // leaving the page: warn when unsaved, and send what is pending when moving within the app
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (latest.current === saved.current) return
      void flush()
      event.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      if (latest.current !== saved.current) void flush()
    }
  }, [flush])

  return {
    ...doc,
    saveState,
    saveError,
    saveLimit,
    edit,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    setTitle,
    setLanguage,
    flush,
    replace,
  }
}
