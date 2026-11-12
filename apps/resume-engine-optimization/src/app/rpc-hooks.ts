"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { WireError } from "src/shared/errors"
import { invoke } from "./rpc"

type Answer<O> = { ok: true; result: O } | { ok: false; error: WireError }
type Resolver<I, O> = (input: I) => Promise<Answer<O>>

/** [call, { isPending }]: call() resolves to the result or throws the resolver's error. */
export function useMutation<I, O>(resolver: Resolver<I, O>) {
  const [isPending, setPending] = useState(false)
  const call = useCallback(
    async (input: I) => {
      setPending(true)
      try {
        return await invoke(resolver, input)
      } finally {
        setPending(false)
      }
    },
    [resolver]
  )
  return [call, { isPending }] as const
}

/** [data, { error, refetch }]: loads once on mount and again on refetch(). */
export function useQuery<I, O>(resolver: Resolver<I, O>, input: I) {
  const [data, setData] = useState<O | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)
  // The input of the first render: callers pass a constant (null) and refetch for fresh data.
  const inputRef = useRef(input)
  const refetch = useCallback(async () => {
    try {
      setData(await invoke(resolver, inputRef.current))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)))
    }
  }, [resolver])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return [data, { error, refetch }] as const
}
