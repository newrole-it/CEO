"use client"

import { useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { useRouter } from "next/navigation"
import { CircleAlert } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { safeReturnTo } from "src/shared/return-to"
import consumeLoginToken from "../../mutations/consumeLoginToken"

/** Asks before signing in: the person sees which account the link opens and clicks. */
export function VerifyToken({
  token,
  next,
  account,
  switching,
}: {
  token: string
  next?: string | null
  account: string | null
  switching: boolean
}) {
  const { t } = useCopy()
  const [consume, { isPending }] = useMutation(consumeLoginToken)
  const router = useRouter()
  const [failed, setFailed] = useState(!account)
  const destination = safeReturnTo(next) ?? "/jobs"

  function signIn() {
    consume({ token })
      .then(() => {
        router.refresh()
        router.replace(destination)
      })
      .catch(() => setFailed(true))
  }

  return (
    <div className="card auth-card" role="status">
      {failed || !account ? (
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
        <>
          <div className="stack-sm">
            <h1 className="t-h1">{t("login.confirm.title", { email: account })}</h1>
            {switching ? <p className="muted">{t("login.confirm.switch")}</p> : null}
            <p className="muted">{t("login.confirm.notYou")}</p>
          </div>
          <div>
            <Button variant="primary" onClick={signIn} loading={isPending} disabled={isPending}>
              {isPending ? t("login.verifying") : t("login.confirm.cta")}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
