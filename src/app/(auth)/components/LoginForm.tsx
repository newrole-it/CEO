"use client"

import { AuthenticationError } from "blitz"
import { FormEvent, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { useRouter } from "next/navigation"
import login from "../mutations/login"
import { Button } from "src/app/components/ui/button"
import { Input } from "src/app/components/ui/input"

export const LoginForm = () => {
  const [loginMutation, { isPending }] = useMutation(login)
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await loginMutation({ email, password })
      router.refresh()
      router.push("/")
    } catch (err) {
      if (err instanceof AuthenticationError)
        setError("Those credentials are not the owner account.")
      else setError(err instanceof Error ? err.message : "Login failed")
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card stack" onSubmit={onSubmit}>
        <p className="kicker">Jobscanner</p>
        <h1>Sign in</h1>
        <p className="lede">
          One owner account. The password is set in the environment and created by the database
          seed.
        </p>
        {error ? <div className="form-error">{error}</div> : null}
        <label className="field">
          Email
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
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
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? "Signing in…" : "Enter"}
        </Button>
      </form>
    </div>
  )
}
