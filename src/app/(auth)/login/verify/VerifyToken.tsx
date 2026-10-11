"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { useRouter } from "next/navigation"
import { safeReturnTo } from "src/shared/return-to"
import consumeLoginToken from "../mutations/consumeLoginToken"

export function VerifyToken({ token, next }: { token: string; next?: string | null }) {
  const [consume] = useMutation(consumeLoginToken)
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const destination = safeReturnTo(next) ?? "/"

  useEffect(() => {
    if (started.current) return
    started.current = true
    consume({ token })
      .then(() => {
        router.refresh()
        router.replace(destination)
      })
      .catch(() => {
        setError("That sign-in link is invalid or already used.")
      })
  }, [consume, destination, router, token])

  if (error) {
    return (
      <section className="hero">
        <h1>Link expired</h1>
        <p className="lede">{error} Request a new one from the sign-in page.</p>
      </section>
    )
  }
  return <p className="hint">Signing you in…</p>
}
