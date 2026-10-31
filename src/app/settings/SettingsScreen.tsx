"use client"

import { useEffect, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import { useRouter } from "next/navigation"
import { Download, Trash2 } from "lucide-react"
import deleteMyAccount from "src/app/profile/mutations/deleteMyAccount"
import deleteMyProfile from "src/app/profile/mutations/deleteMyProfile"
import { useCopy } from "src/app/i18n/Locale"
import { Button, ButtonLink } from "src/app/components/ds/Button"
import { Modal, ModalHead, useToast } from "src/app/components/ds/interactive"
import { Segmented } from "src/app/components/ds/primitives"
import { LinkedInMark } from "src/app/components/site/Brand"
import { useLocaleToggle, useThemeToggle } from "src/app/components/site/SiteHeader"
import { SHORTCUTS_KEY } from "src/app/jobs/components/Shortcuts"
import { linkedInStartHref } from "src/app/start/pending"
import { ExtensionSettings } from "./ExtensionSettings"
import { GmailSettings } from "./GmailSettings"
import { PasswordSettings } from "./PasswordSettings"
import { SheetSettings } from "./SheetSettings"

export function SettingsScreen({
  email,
  linkedIn,
  linkedInConfigured,
  hasPassword,
}: {
  email: string
  linkedIn: boolean
  linkedInConfigured: boolean
  hasPassword: boolean
}) {
  const { t, locale } = useCopy()
  const router = useRouter()
  const toast = useToast()
  const theme = useThemeToggle()
  const setLocale = useLocaleToggle()
  const [removeProfile, profileState] = useMutation(deleteMyProfile)
  const [removeAccount, accountState] = useMutation(deleteMyAccount)
  const [confirm, setConfirm] = useState<null | "profile" | "account">(null)
  const [typed, setTyped] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [themeValue, setThemeValue] = useState<"light" | "dark" | "system">("system")
  const [shortcuts, setShortcuts] = useState<"on" | "off">("on")
  const pending = profileState.isPending || accountState.isPending

  useEffect(() => {
    try {
      const saved = localStorage.getItem("js-theme")
      setThemeValue(saved === "dark" || saved === "light" ? saved : "system")
      setShortcuts(localStorage.getItem(SHORTCUTS_KEY) === "off" ? "off" : "on")
    } catch {}
  }, [])

  async function onConfirm() {
    setError(null)
    try {
      if (confirm === "profile") {
        await removeProfile(null)
        setConfirm(null)
        toast.show({ message: t("st.delProfileDone") })
        router.refresh()
        return
      }
      if (confirm === "account") {
        await removeAccount(null)
        router.push("/")
        router.refresh()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("err.save"))
    }
  }

  const word = t("st.delWord")

  return (
    <div className="stack">
      <section className="card settings-sec" aria-labelledby="st-account">
        <h2 id="st-account">{t("st.account")}</h2>
        <p>{t("st.email", { email })}</p>
        <div className="settings-row">
          <span className="row t-sm">
            <LinkedInMark />
            {linkedIn ? t("st.linkedin.on", { email }) : t("st.linkedin.off")}
          </span>
          {!linkedIn ? (
            <ButtonLink href={linkedInConfigured ? linkedInStartHref() : "/start/linkedin"} variant="outline" size="sm">
              {t("st.linkedin.connect")}
            </ButtonLink>
          ) : null}
        </div>
      </section>

      <PasswordSettings hasPassword={hasPassword} />
      <SheetSettings />
      <GmailSettings />
      <ExtensionSettings />

      <section className="card settings-sec">
        <div className="settings-row">
          <h2>{t("st.language")}</h2>
          <Segmented<"pl" | "en">
            label={t("st.language")}
            value={locale}
            options={[
              { value: "pl", label: "Polski" },
              { value: "en", label: "English" },
            ]}
            onChange={(next) => next !== locale && setLocale(next)}
          />
        </div>
        <div className="settings-row">
          <h2>{t("st.theme")}</h2>
          <Segmented<"light" | "dark" | "system">
            label={t("st.theme")}
            value={themeValue}
            options={[
              { value: "light", label: t("st.theme.light") },
              { value: "dark", label: t("st.theme.dark") },
              { value: "system", label: t("st.theme.system") },
            ]}
            onChange={(next) => {
              setThemeValue(next)
              theme.setTheme(next)
            }}
          />
        </div>
        <div className="settings-row">
          <h2>{t("st.shortcuts")}</h2>
          <Segmented<"on" | "off">
            label={t("st.shortcuts")}
            value={shortcuts}
            options={[
              { value: "on", label: t("st.shortcuts.on") },
              { value: "off", label: t("st.shortcuts.off") },
            ]}
            onChange={(next) => {
              setShortcuts(next)
              try {
                localStorage.setItem(SHORTCUTS_KEY, next)
              } catch {}
            }}
          />
        </div>
      </section>

      <section className="card settings-sec" aria-labelledby="st-data">
        <h2 id="st-data">{t("st.data")}</h2>
        <div className="settings-row">
          <p>{t("st.exportBody")}</p>
          <ButtonLink href="/api/account/export" variant="outline" size="sm" icon={<Download />}>
            {t("st.export")}
          </ButtonLink>
        </div>
        <hr className="divider" />
        <div className="settings-row">
          <p style={{ flex: "1 1 300px" }}>{t("st.delProfileBody")}</p>
          <Button variant="danger-ghost" size="sm" icon={<Trash2 />} disabled={pending} onClick={() => setConfirm("profile")}>
            {t("st.delProfile")}
          </Button>
        </div>
        <hr className="divider" />
        <div className="settings-row">
          <p style={{ flex: "1 1 300px" }}>{t("st.delAccountBody")}</p>
          <Button
            variant="danger-ghost"
            size="sm"
            icon={<Trash2 />}
            disabled={pending}
            onClick={() => {
              setTyped("")
              setConfirm("account")
            }}
          >
            {t("st.delAccount")}
          </Button>
        </div>
      </section>

      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)} labelledBy="confirm-title">
        <ModalHead
          title={confirm === "profile" ? t("st.delProfile") : t("st.delAccount")}
          id="confirm-title"
          onClose={() => setConfirm(null)}
        />
        <div className="modal__body stack-sm">
          <p className="muted">{confirm === "profile" ? t("st.delProfileBody") : t("st.delAccountBody")}</p>
          {confirm === "account" ? (
            <label className="field">
              <span className="field__label">{t("st.delConfirm")}</span>
              <input className="input" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
            </label>
          ) : null}
          {error ? (
            <p className="field__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="modal__foot">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            loading={pending}
            disabled={confirm === "account" && typed.trim().toUpperCase() !== word}
            onClick={() => void onConfirm()}
          >
            {pending ? t("st.deleting") : confirm === "profile" ? t("st.delProfile") : t("st.delAccount")}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
