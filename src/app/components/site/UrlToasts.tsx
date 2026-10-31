"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef } from "react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { useToast } from "src/app/components/ds/interactive"

const MESSAGES: Record<string, CopyKey> = {
  "linkedin-config": "li.toast.config",
  "linkedin-cancelled": "li.toast.cancelled",
  "linkedin-denied": "li.toast.denied",
  "linkedin-state": "li.toast.state",
  "linkedin-exchange": "li.toast.exchange",
  "linkedin-unverified": "li.toast.unverified",
  expired: "li.toast.expired",
}

function Inner() {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const toast = useToast()
  const { t } = useCopy()
  const done = useRef<string | null>(null)
  const error = params.get("error")

  useEffect(() => {
    if (!error || done.current === error) return
    if (!error.startsWith("linkedin") && error !== "expired") return
    done.current = error
    const key = MESSAGES[error] ?? "li.toast.failed"
    const setup = error === "linkedin-config" || error === "linkedin-exchange"
    toast.show({
      message: t(key),
      tone: setup ? "default" : "danger",
      duration: 9000,
      action: setup
        ? { label: t("li.toast.config.act"), onClick: () => router.push("/start/linkedin") }
        : undefined,
    })
    const next = new URLSearchParams(params.toString())
    next.delete("error")
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [error, params, pathname, router, t, toast])
  return null
}

/** Turns ?error=linkedin-* (from the LinkedIn routes) into a toast on any page. */
export function UrlToasts() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
