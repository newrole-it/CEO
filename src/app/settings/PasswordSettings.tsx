"use client"

import { FormEvent, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { AuthenticationError } from "blitz"
import { KeyRound } from "lucide-react"
import setPassword from "src/app/(auth)/mutations/setPassword"
import { useCopy } from "src/app/i18n/Locale"
import { Button } from "src/app/components/ds/Button"
import { useToast } from "src/app/components/ds/interactive"

/** Settings → Password: optional for every account; sign-in links keep working. */
export function PasswordSettings({ hasPassword }: { hasPassword: boolean }) {
  const { t } = useCopy()
  const toast = useToast()
  const [save, { isPending }] = useMutation(setPassword)
  const [has, setHas] = useState(hasPassword)
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [repeat, setRepeat] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (next.trim().length < 10) return setError(t("pw.short"))
    if (next !== repeat) return setError(t("pw.mismatch"))
    try {
      await save({ currentPassword: has ? current : undefined, newPassword: next })
      setHas(true)
      setOpen(false)
      setCurrent("")
      setNext("")
      setRepeat("")
      toast.show({ message: t("pw.saved") })
    } catch (caught) {
      setError(caught instanceof AuthenticationError ? t("pw.wrongCurrent") : t("err.save"))
    }
  }

  return (
    <section className="card settings-sec" aria-labelledby="st-password">
      <div className="settings-row">
        <h2 id="st-password">{t("pw.title")}</h2>
        {!open ? (
          <Button variant="outline" size="sm" icon={<KeyRound />} onClick={() => setOpen(true)}>
            {has ? t("pw.change") : t("pw.set")}
          </Button>
        ) : null}
      </div>
      <p>{has ? t("pw.on") : t("pw.off")}</p>
      {open ? (
        <form className="stack-sm" onSubmit={onSubmit}>
          {has ? (
            <label className="field">
              <span className="field__label">{t("pw.current")}</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                required
              />
            </label>
          ) : null}
          <label className="field">
            <span className="field__label">{t("pw.new")}</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={10}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              required
            />
            <span className="field__hint">{t("pw.hint")}</span>
          </label>
          <label className="field">
            <span className="field__label">{t("pw.repeat")}</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
              required
            />
          </label>
          {error ? (
            <p className="field__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="row">
            <Button type="submit" variant="primary" size="sm" loading={isPending}>
              {t("common.save")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
