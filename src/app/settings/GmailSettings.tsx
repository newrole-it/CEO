"use client"

import { useCallback, useEffect, useState } from "react"
import { invoke } from "@blitzjs/rpc"
import type { PromiseReturnType } from "blitz"
import { ChevronRight, ExternalLink, Mail, RefreshCw, ShieldCheck, Unplug } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button, ButtonLink, buttonClass } from "src/app/components/ds/Button"
import { CodeBlock, useToast } from "src/app/components/ds/interactive"
import { Banner, Skeleton } from "src/app/components/ds/primitives"
import { longDate } from "src/app/applications/rows"
import { GOOGLE_PERMISSIONS } from "src/shared/gmail"
import disconnectGmail from "./gmail/mutations/disconnectGmail"
import saveGmailSettings from "./gmail/mutations/saveGmailSettings"
import syncGmailNow from "./gmail/mutations/syncGmailNow"
import getGmailSettings from "./gmail/queries/getGmailSettings"

type Settings = PromiseReturnType<typeof getGmailSettings>

/** What the callback can report in ?gmail=. Anything else in the URL is not ours to show. */
const RESULTS = [
  "connected",
  "cancelled",
  "denied",
  "state",
  "exchange",
  "config",
  "key",
  "scope-missing",
  "scope-broader",
]

/** Settings → Gmail. Loads its own data; rendered inside SettingsScreen. */
export function GmailSettings() {
  const { t, locale } = useCopy()
  const toast = useToast()
  const [data, setData] = useState<Settings | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [busy, setBusy] = useState<null | "sync" | "toggle" | "disconnect">(null)
  const [result, setResult] = useState<string | null>(null)
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
    const url = new URL(window.location.href)
    const reported = url.searchParams.get("gmail")
    if (!reported) return
    if (RESULTS.includes(reported)) setResult(reported)
    url.searchParams.delete("gmail")
    window.history.replaceState(null, "", url)
  }, [load])

  async function syncNow() {
    setBusy("sync")
    try {
      const reply = await invoke(syncGmailNow, {})
      setData((current) =>
        current ? { ...current, status: reply.status, log: reply.log } : current
      )
      if (reply.result.status === "synced") toast.show({ message: t("gm.synced") })
      else if (reply.result.status === "busy") toast.show({ message: t("gm.busy") })
    } catch {
      toast.show({ message: t("gm.err.http"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  async function toggle(patch: { autoApply?: boolean; useModel?: boolean }) {
    if (!data) return
    const before = data.status
    setData({ ...data, status: { ...before, ...patch } })
    setBusy("toggle")
    try {
      const status = await invoke(saveGmailSettings, patch)
      setData((current) => (current ? { ...current, status } : current))
    } catch {
      setData((current) => (current ? { ...current, status: before } : current))
      toast.show({ message: t("err.save"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    setBusy("disconnect")
    try {
      const reply = await invoke(disconnectGmail, {})
      setData((current) => (current ? { ...current, status: reply.status, log: [] } : current))
      setManualRevoke(!reply.revoked)
      setResult(null)
      if (reply.revoked) toast.show({ message: t("gm.disconnected") })
    } catch {
      toast.show({ message: t("err.save"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  const connectLink = (label: CopyKey) => (
    // A plain link: this leaves the app for Google, and must not be prefetched.
    <a href="/api/auth/gmail/start" className={buttonClass({ variant: "primary" })}>
      <Mail aria-hidden />
      {t(label)}
    </a>
  )

  const status = data?.status
  const stats = status?.lastStats
  const needsReconnect = status?.lastErrorCode === "reconnect" || status?.lastErrorCode === "key"
  const canConnect = Boolean(data?.setup.configured && data.setup.keyReady)

  return (
    <section className="card settings-sec" id="st-gmail" aria-labelledby="st-gmail-title">
      <h2 id="st-gmail-title">{t("gm.title")}</h2>
      <p>{t("gm.lead")}</p>

      {result ? (
        <Banner tone={result === "connected" ? "success" : "danger"} role="status">
          {t(`gm.result.${result}` as CopyKey)}
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

      {state === "loading" && !data ? (
        <div className="stack-sm" aria-busy="true">
          <Skeleton h={20} w="60%" />
          <Skeleton h={40} />
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
          <div className="gm-facts">
            <h3 className="row t-sm">
              <ShieldCheck aria-hidden />
              {t("gm.reads.title")}
            </h3>
            <ul className="t-sm muted">
              <li>{t("gm.reads.1")}</li>
              <li>{t("gm.reads.2")}</li>
              <li>{t("gm.reads.3")}</li>
              <li>{t("gm.reads.4")}</li>
            </ul>
          </div>

          <div className="sheet-status" role="status">
            <span className={`sheet-status__dot${status.connected ? " is-on" : ""}`} aria-hidden />
            <strong>
              {status.connected
                ? t("gm.connected", { email: status.email ?? "" })
                : t("gm.notConnected")}
            </strong>
            {status.connected ? (
              <span className="muted">
                {status.lastSyncedAt
                  ? t("gm.lastSync", { when: longDate(status.lastSyncedAt, locale, true) })
                  : t("gm.never")}
              </span>
            ) : null}
          </div>

          {status.lastErrorCode ? (
            <Banner tone={needsReconnect ? "danger" : "warning"} role="alert">
              <p>{t(`gm.err.${status.lastErrorCode}` as CopyKey)}</p>
              {needsReconnect && canConnect ? connectLink("gm.reconnect") : null}
            </Banner>
          ) : null}

          {!data.setup.keyReady ? (
            <Banner tone="warning" role="alert">
              <p>{t("gm.setup.key")}</p>
              <CodeBlock code="openssl rand -hex 32" />
            </Banner>
          ) : null}

          {status.connected ? (
            <>
              {stats ? <p className="t-sm muted">{t("gm.stats", { ...stats })}</p> : null}
              <div className="row">
                <Button
                  size="sm"
                  variant="primary"
                  icon={<RefreshCw />}
                  loading={busy === "sync"}
                  onClick={() => void syncNow()}
                >
                  {t("gm.syncNow")}
                </Button>
                <Button
                  size="sm"
                  variant="danger-ghost"
                  icon={<Unplug />}
                  loading={busy === "disconnect"}
                  onClick={() => void disconnect()}
                >
                  {t("gm.disconnect")}
                </Button>
              </div>
              <div className="sheet-toggles">
                <div className="sheet-toggle">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={status.autoApply}
                      disabled={busy === "toggle"}
                      aria-describedby="gm-auto-hint"
                      onChange={(event) => void toggle({ autoApply: event.target.checked })}
                    />
                    {t("gm.auto")}
                  </label>
                  <p className="field__hint" id="gm-auto-hint">
                    {t("gm.autoHint")}
                  </p>
                </div>
                <div className="sheet-toggle">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={status.useModel}
                      disabled={busy === "toggle"}
                      aria-describedby="gm-model-hint"
                      onChange={(event) => void toggle({ useModel: event.target.checked })}
                    />
                    {t("gm.model")}
                  </label>
                  <p className="field__hint" id="gm-model-hint">
                    {t("gm.modelHint")}
                  </p>
                </div>
              </div>
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
          ) : data.setup.configured ? (
            canConnect ? (
              <div>{connectLink("gm.connect")}</div>
            ) : null
          ) : (
            <>
              <h3 className="t-sm">{t("gm.setup.title")}</h3>
              <p className="t-sm muted">{t("gm.setup.lead")}</p>
              <ol className="sheet-steps">
                <li className="sheet-step">
                  <h3>{t("gm.setup.step1.title")}</h3>
                  <p className="t-sm muted">{t("gm.setup.step1.body")}</p>
                  <CodeBlock code={data.setup.scope} />
                  <div>
                    <ButtonLink
                      href={data.setup.consoleUrl}
                      external
                      size="sm"
                      variant="outline"
                      iconRight={<ExternalLink />}
                    >
                      {t("gm.setup.step1.cta")}
                    </ButtonLink>
                  </div>
                </li>
                <li className="sheet-step">
                  <h3>{t("gm.setup.step2.title")}</h3>
                  <p className="t-sm muted">{t("gm.setup.step2.body")}</p>
                </li>
                <li className="sheet-step">
                  <h3>{t("gm.setup.step3.title")}</h3>
                  <p className="t-sm muted">{t("gm.setup.step3.body")}</p>
                  <CodeBlock code={data.setup.redirectUri} />
                </li>
                <li className="sheet-step">
                  <h3>{t("gm.setup.step4.title")}</h3>
                  <p className="t-sm muted">{t("gm.setup.step4.body")}</p>
                  <CodeBlock code={data.setup.envKeys.map((key) => `${key}=""`).join("\n")} />
                </li>
              </ol>
            </>
          )}
        </>
      ) : null}
    </section>
  )
}
