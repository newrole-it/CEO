"use client"

import { useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { useRouter } from "next/navigation"
import deleteMyAccount from "src/app/profile/mutations/deleteMyAccount"
import deleteMyProfile from "src/app/profile/mutations/deleteMyProfile"
import { useCopy } from "src/app/i18n/Locale"

export function SettingsScreen({ email }: { email: string }) {
  const { t } = useCopy()
  const [removeProfile, profileState] = useMutation(deleteMyProfile)
  const [removeAccount, accountState] = useMutation(deleteMyAccount)
  const [confirm, setConfirm] = useState<null | "profile" | "account">(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const pending = profileState.isPending || accountState.isPending

  async function onConfirm() {
    setError(null)
    try {
      if (confirm === "profile") {
        await removeProfile(null)
        setConfirm(null)
        setMessage(t("settingsProfileDone"))
        router.refresh()
        return
      }
      if (confirm === "account") {
        await removeAccount(null)
        router.push("/")
        router.refresh()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("settingsDeleting"))
    }
  }

  return (
    <div className="stack">
      <section className="hero">
        <p className="kicker">{t("settingsKicker")}</p>
        <h1>{t("settingsTitle")}</h1>
        <p className="lede">
          {t("settingsSignedIn")} {email}.
        </p>
      </section>
      <section className="panel stack">
        <h2>{t("settingsExportTitle")}</h2>
        <p className="hint">{t("settingsExportBody")}</p>
        <a className="btn btn-line" href="/api/account/export">
          {t("settingsExport")}
        </a>
      </section>
      <section className="panel stack">
        <h2>{t("settingsProfileTitle")}</h2>
        <p className="hint">{t("settingsProfileBody")}</p>
        {message ? <p className="hint">{message}</p> : null}
        <button
          className="btn btn-line"
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null)
            setConfirm("profile")
          }}
        >
          {t("settingsProfileButton")}
        </button>
      </section>
      <section className="panel stack">
        <h2>{t("settingsAccountTitle")}</h2>
        <p className="hint">{t("settingsAccountBody")}</p>
        <button
          className="btn btn-line"
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null)
            setConfirm("account")
          }}
        >
          {t("settingsAccountButton")}
        </button>
      </section>
      {confirm ? (
        <div className="panel stack" role="alertdialog" aria-labelledby="delete-title">
          <h2 id="delete-title">
            {confirm === "profile" ? t("settingsProfileTitle") : t("settingsAccountTitle")}
          </h2>
          <p className="hint">
            {confirm === "profile" ? t("settingsProfileConfirm") : t("settingsAccountConfirm")}
          </p>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="cta-row">
            <button
              className="btn btn-line"
              type="button"
              disabled={pending}
              onClick={() => setConfirm(null)}
            >
              {t("settingsCancel")}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={pending}
              onClick={() => void onConfirm()}
            >
              {pending ? t("settingsDeleting") : t("settingsConfirm")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
