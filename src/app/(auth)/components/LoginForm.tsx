"use client"

import { AuthenticationError } from "blitz"
import { FormEvent, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { useRouter, useSearchParams } from "next/navigation"
import { CircleAlert, MailCheck } from "lucide-react"
import login from "../mutations/login"
import requestMagicLink from "../mutations/requestMagicLink"
import { useCopy } from "src/app/i18n/Locale"
import { Button, ButtonLink } from "src/app/components/ds/Button"
import { Banner } from "src/app/components/ds/primitives"
import { LinkedInMark } from "src/app/components/site/Brand"
import { useLinkedInSignIn } from "src/app/components/site/LinkedInSignIn"
import { safeReturnTo } from "src/shared/return-to"

export const LoginForm = () => {
  const { t } = useCopy()
  const [loginMutation, { isPending: passwordPending }] = useMutation(login)
  const [requestLink, { isPending }] = useMutation(requestMagicLink)
  const linkedInEnabled = useLinkedInSignIn()
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const destination = safeReturnTo(params.get("returnTo")) ?? "/jobs"
  const linkedInHref = `/api/auth/linkedin/start?returnTo=${encodeURIComponent(destination)}`

  async function onEmail(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSent(false)
    try {
      const result = await requestLink({ email })
      if (result.status === "signed-in") {
        router.refresh()
        router.push(destination)
        return
      }
      if (result.status === "limited") {
        setError(t("login.limited"))
        return
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.failed"))
    }
  }

  async function onPassword(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await loginMutation({ email, password })
      router.refresh()
      router.push(destination)
    } catch (err) {
      setError(err instanceof AuthenticationError ? t("login.badCreds") : t("login.failed"))
    }
  }

  return (
    <div className="card auth-card">
      <div className="stack-sm">
        <h1 className="t-h1">{t("login.title")}</h1>
        <p className="muted">{t("login.sub")}</p>
      </div>
      {error ? (
        <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden />}>
          <p>{error}</p>
        </Banner>
      ) : null}
      {sent ? (
        <Banner tone="success" role="status" icon={<MailCheck aria-hidden />}>
          <p>{t("login.sent")}</p>
          <p className="t-caption">{t("login.sent.local")}</p>
        </Banner>
      ) : null}
      <form className="stack" onSubmit={onEmail}>
        <label className="field">
          <span className="field__label">{t("login.email")}</span>
          <input
            className="input input--lg"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <Button type="submit" variant="primary" size="lg" block loading={isPending}>
          {isPending ? t("login.sending") : t("login.email.cta")}
        </Button>
      </form>
      <p className="or">{t("common.or")}</p>
      <ButtonLink
        href={linkedInEnabled ? linkedInHref : "/start/linkedin"}
        variant="outline"
        size="lg"
        block
        icon={<LinkedInMark size={20} />}
      >
        {linkedInEnabled ? t("login.li") : t("login.li.setup")}
      </ButtonLink>
      <details className="disclosure">
        <summary>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m9 18 6-6-6-6" />
          </svg>
          {t("login.owner")}
        </summary>
        <form className="stack" onSubmit={onPassword}>
          <label className="field">
            <span className="field__label">{t("login.password")}</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <Button type="submit" variant="outline" loading={passwordPending}>
            {t("login.password.cta")}
          </Button>
        </form>
      </details>
    </div>
  )
}
