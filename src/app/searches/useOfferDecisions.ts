"use client"

import { useMutation } from "@blitzjs/rpc"
import { useCallback, useEffect, useRef, useState } from "react"
import { rememberDecision } from "./local-decisions"
import markMatch from "./mutations/markMatch"
import {
  actionForStatus,
  popUndo,
  pushUndo,
  type TriageStatus,
  type UndoStep,
} from "src/shared/triage"

export function useOfferDecisions(refetch: () => Promise<unknown>) {
  const [mark] = useMutation(markMatch)
  const [stack, setStack] = useState<UndoStep[]>([])
  const [toast, setToast] = useState<UndoStep | null>(null)
  const timer = useRef<number | null>(null)
  const stackRef = useRef(stack)
  stackRef.current = stack

  const show = useCallback((step: UndoStep | null) => {
    setToast(step)
    if (timer.current) window.clearTimeout(timer.current)
    if (!step) return
    timer.current = window.setTimeout(() => setToast(null), 5000)
  }, [])

  const apply = useCallback(
    async (matchId: string, status: TriageStatus) => {
      await mark({ id: matchId, action: actionForStatus(status) })
    },
    [mark]
  )

  const decide = useCallback(
    async (input: {
      matchId: string
      jobId: string
      label: string
      from: TriageStatus
      to: TriageStatus
    }) => {
      if (input.from === input.to) return
      await apply(input.matchId, input.to)
      rememberDecision({ jobId: input.jobId, action: input.to, at: Date.now() })
      const step: UndoStep = input
      setStack((current) => pushUndo(current, step))
      show(step)
      await refetch()
    },
    [apply, refetch, show]
  )

  const undo = useCallback(async () => {
    const popped = popUndo(stackRef.current)
    if (!popped.step) return
    setStack(popped.stack)
    await apply(popped.step.matchId, popped.step.from)
    rememberDecision({ jobId: popped.step.jobId, action: popped.step.from, at: Date.now() })
    show(popped.stack[popped.stack.length - 1] ?? null)
    await refetch()
  }, [apply, refetch, show])

  const undoRef = useRef(undo)
  undoRef.current = undo
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "z" && event.key !== "Z") return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return
      event.preventDefault()
      void undoRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    []
  )

  return { decide, undo, toast, canUndo: stack.length > 0, pending: stack.length }
}
