"use client"

import { useMutation } from "@blitzjs/rpc"
import { useEffect, useRef } from "react"
import { clearDecisions, readDecisions } from "./local-decisions"
import mergeDecisions from "./mutations/mergeDecisions"

export function MergeDecisions({ enabled }: { enabled: boolean }) {
  const [merge] = useMutation(mergeDecisions)
  const started = useRef(false)
  useEffect(() => {
    if (!enabled || started.current) return
    const decisions = readDecisions()
    if (!decisions.length) return
    started.current = true
    void merge({ decisions })
      .then(() => clearDecisions())
      .catch(() => {
        started.current = false
      })
  }, [enabled, merge])
  return null
}
