"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { useRouter } from "next/navigation"
import { CircleAlert, LoaderCircle } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { ButtonLink } from "src/app/components/ds/Button"
import { safeReturnTo } from "src/shared/return-to"
import consumeLoginToken from "../../mutations/consumeLoginToken"

export function VerifyToken({ token, next }: { token: string; next?: string | null }) {
  const { t } = useCopy()
  const [consume] = useMutation(consumeLoginToken)
  const router = useRouter()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)
  const destination = safeReturnTo(next) ?? "/jobs"

  useEffect(() => {
    if (started.current) return
    started.current = true
    consume({ token })
      .then(() => {
        router.refresh()
        router.replace(destination)
      })
      .catch(() => setFailed(true))
  }, [consume, destination, router, token])

  return (
    <div className="card auth-card" role="status">
      {failed ? (
        <>
          <p className="row" style={{ color: "var(--danger)" }}>
            <CircleAlert width={20} height={20} aria-hidden /> {t("li.toast.expired")}
          </p>
          <div>
            <ButtonLink href="/login" variant="primary">
              {t("login.title")}
            </ButtonLink>
          </div>
        </>
      ) : (
        <p className="row muted">
          <LoaderCircle className="spin" width={20} height={20} aria-hidden style={{ animation: "spin 1s linear infinite" }} />
          {t("login.verifying")}
        </p>
      )}
    </div>
  )
}
