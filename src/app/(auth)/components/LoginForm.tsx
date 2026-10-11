"use client"

import { AuthenticationError } from "blitz"
import Link from "next/link"
import { FormEvent, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { useRouter, useSearchParams } from "next/navigation"
import login from "../mutations/login"
import requestMagicLink from "../mutations/requestMagicLink"
import { Button } from "src/app/components/ui/button"
import { Input } from "src/app/components/ui/input"
import { safeReturnTo } from "src/shared/return-to"

const ERRORS: Record<string, string> = {
  expired: "That sign-in link is invalid or already used. Request a new one.",
  linkedin: "LinkedIn did not complete sign-in. Try again, or use email.",
  "linkedin-config": "LinkedIn sign-in is not configured on this server yet.",
}

export const LoginForm = () => {
  const [loginMutation, { isPending: passwordPending }] = useMutation(login)
  const [requestLink, { isPending }] = useMutation(requestMagicLink)
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(ERRORS[params.get("error") || ""] ?? null)
  const [notice, setNotice] = useState<string | null>(null)
  const destination = safeReturnTo(params.get("returnTo")) ?? "/"
  const linkedInHref = safeReturnTo(params.get("returnTo"))
    ? `/api/auth/linkedin/start?returnTo=${encodeURIComponent(destination)}`
    : "/api/auth/linkedin/start"

  async function onEmail(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    try {
      const result = await requestLink({ email })
      if (result.status === "signed-in") {
        router.refresh()
        router.push(destination)
        return
      }
      if (result.status === "limited") {
        setError("Too many sign-in links for this email or network. Wait an hour and try again.")
        return
      }
      setNotice(
        "If this email already has an account, a one-time link is on its way. It expires in 15 minutes. In local development the link is printed in the server log."
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue")
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
      if (err instanceof AuthenticationError) setError("Those credentials were not recognized.")
      else setError(err instanceof Error ? err.message : "Login failed")
    }
  }

  return (
    <div className="stack login-panel">
      <p className="kicker">Account</p>
      <h1>Sign in</h1>
      <p className="lede">
        The first time you enter an email, Nowa Rola creates the account and signs you in on this
        device. Later visits use a magic link. LinkedIn uses official sign-in and only shares your
        name, email, and picture.
      </p>
      {error ? <div className="form-error">{error}</div> : null}
      {notice ? <p className="hint">{notice}</p> : null}
      <form className="stack" onSubmit={onEmail}>
        <label className="field">
          Email
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? "Continuing…" : "Continue with email"}
        </Button>
      </form>
      <Button variant="outline" asChild>
        <Link href={linkedInHref}>Continue with LinkedIn</Link>
      </Button>
      <details>
        <summary>Owner password</summary>
        <form className="stack" onSubmit={onPassword}>
          <label className="field">
            Password
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <Button type="submit" variant="outline" disabled={passwordPending}>
            {passwordPending ? "Signing in…" : "Sign in with password"}
          </Button>
        </form>
      </details>
    </div>
  )
}
