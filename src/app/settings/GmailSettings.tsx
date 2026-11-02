"use client"

import { useCallback, useEffect, useState } from "react"
import { invoke } from "@blitzjs/rpc"
import type { PromiseReturnType } from "blitz"
import { ChevronRight, ExternalLink, ShieldCheck, Unplug } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button, ButtonLink } from "src/app/components/ds/Button"
import { useToast } from "src/app/components/ds/interactive"
import { Banner, Skeleton } from "src/app/components/ds/primitives"
import { longDate } from "src/app/applications/rows"
import { GOOGLE_PERMISSIONS } from "src/shared/gmail"
import disconnectGmail from "./gmail/mutations/disconnectGmail"
import getGmailSettings from "./gmail/queries/getGmailSettings"

type Settings = PromiseReturnType<typeof getGmailSettings>

/** Settings → Gmail. Loads its own data; rendered inside SettingsScreen. */
export function GmailSettings() {
  const { t, locale } = useCopy()
  const toast = useToast()
  const [data, setData] = useState<Settings | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [busy, setBusy] = useState(false)
  const [removed, setRemoved] = useState(false)
  const [manualRevoke, setManualRevoke] = useState(false)

  const load = useCallback(async () => {
    setState("loading")
    try {
      setData(await invoke(getGmailSettings, {}))
      setState("ready")
    } catch {
      setState("error")
    }
  }, [])

  useEffect(() => {
    void load()
    // An old "Połącz Gmail" link or a consent that came back from Google lands here with ?gmail=off.
    const url = new URL(window.location.href)
    if (!url.searchParams.has("gmail")) return
    setRemoved(url.searchParams.get("gmail") === "off")
    url.searchParams.delete("gmail")
    window.history.replaceState(null, "", url)
  }, [load])

  async function disconnect() {
    setBusy(true)
    try {
      const reply = await invoke(disconnectGmail, {})
      setData((current) => (current ? { ...current, status: reply.status, log: [] } : current))
      setManualRevoke(!reply.revoked)
      if (reply.revoked) toast.show({ message: t("gm.disconnected") })
    } catch {
      toast.show({ message: t("err.save"), tone: "danger" })
    } finally {
      setBusy(false)
    }
  }

  const status = data?.status

  return (
    <section className="card settings-sec" id="st-gmail" aria-labelledby="st-gmail-title">
      <h2 id="st-gmail-title">{t("gm.title")}</h2>
      <p>{t("gm.lead")}</p>

      {removed ? (
        <Banner tone="info" role="status">
          {t("gm.result.off")}
        </Banner>
      ) : null}
      {manualRevoke ? (
        <Banner tone="warning" role="alert">
          <p>{t("gm.disconnectedManual")}</p>
          <ButtonLink
            href={GOOGLE_PERMISSIONS}
            external
            size="sm"
            variant="outline"
            iconRight={<ExternalLink />}
          >
            {t("gm.permissions")}
          </ButtonLink>
        </Banner>
      ) : null}

      <ol className="sheet-steps">
        <li className="sheet-step">
          <h3>{t("gm.how.1.title")}</h3>
          <p className="t-sm muted">{t("gm.how.1.body")}</p>
        </li>
        <li className="sheet-step">
          <h3>{t("gm.how.2.title")}</h3>
          <p className="t-sm muted">{t("gm.how.2.body")}</p>
        </li>
        <li className="sheet-step">
          <h3>{t("gm.how.3.title")}</h3>
          <p className="t-sm muted">{t("gm.how.3.body")}</p>
        </li>
      </ol>

      <div className="gm-facts">
        <h3 className="row t-sm">
          <ShieldCheck aria-hidden />
          {t("gm.reads.title")}
        </h3>
        <ul className="t-sm muted">
          <li>{t("gm.reads.1")}</li>
          <li>{t("gm.reads.2")}</li>
          <li>{t("gm.reads.3")}</li>
        </ul>
      </div>

      {state === "loading" && !data ? (
        <div className="stack-sm" aria-busy="true">
          <Skeleton h={20} w="60%" />
        </div>
      ) : state === "error" && !data ? (
        <Banner tone="danger" role="alert">
          <p>{t("gm.loadError")}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </Banner>
      ) : status && data ? (
        <>
          {status.connected ? (
            <Banner tone="warning" role="alert">
              <p>{t("gm.legacy", { email: status.email ?? "" })}</p>
              <Button
                size="sm"
                variant="danger-ghost"
                icon={<Unplug />}
                loading={busy}
                onClick={() => void disconnect()}
              >
                {t("gm.disconnect")}
              </Button>
            </Banner>
          ) : null}
          <details className="disclosure">
            <summary>
              <ChevronRight aria-hidden />
              {t("gm.log.title", { n: data.log.length })}
            </summary>
            <div className="stack-sm">
              <p className="t-sm muted">{t("gm.log.lead")}</p>
              {data.log.length ? (
                <ul className="mail-list">
                  {data.log.map((item) => (
                    <li key={item.id} className="mail-item">
                      <div className="mail-item__main">
                        <p className="t-sm mail-item__subject">{item.subject}</p>
                        <p className="mail-meta muted">
                          {item.fromAddress} · {longDate(item.receivedAt, locale, true)}
                        </p>
                        <p className="mail-meta muted">
                          {t(`gm.signal.${item.signal}` as CopyKey)} (
                          {t(item.reader === "model" ? "gm.log.byModel" : "gm.log.byRules")}) ·{" "}
                          {t(`gm.outcome.${item.outcome}` as CopyKey)}
                          {item.application ? ` · ${item.application.company}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-sm muted">{t("gm.log.empty")}</p>
              )}
            </div>
          </details>
        </>
      ) : null}
    </section>
  )
}
