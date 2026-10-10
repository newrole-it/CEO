"use client"

import { useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { useRouter } from "next/navigation"
import { Button } from "src/app/components/ui/button"
import rerunProfileAudit from "../mutations/rerunProfileAudit"

export function RerunAudit({ label }: { label: string }) {
  const router = useRouter()
  const [run, { isPending }] = useMutation(rerunProfileAudit)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="rerun-audit"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        void run({}).then(
          () => router.refresh(),
          (err: unknown) => setError(err instanceof Error ? err.message : "Could not run the audit")
        )
      }}
    >
      <Button type="submit" disabled={isPending}>
        {isPending ? "Reading the profile…" : label}
      </Button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  )
}
