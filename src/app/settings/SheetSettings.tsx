"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { invoke } from "@blitzjs/rpc"
import type { PromiseReturnType } from "blitz"
import { ChevronRight, ExternalLink, RefreshCw, Unplug } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { CodeBlock, CopyButton, useToast } from "@newrole/ui/interactive"
import { Banner, Field, Skeleton } from "@newrole/ui/primitives"
import getSheetSettings from "src/app/applications/queries/getSheetSettings"
import saveSheetSettings from "src/app/applications/mutations/saveSheetSettings"
import syncSheetNow from "src/app/applications/mutations/syncSheetNow"
import { longDate } from "src/app/applications/rows"

type Settings = PromiseReturnType<typeof getSheetSettings>
type Status = Settings["status"]
type SyncReply = PromiseReturnType<typeof saveSheetSettings>

const WEBHOOK =
  /^https:\/\/script\.google\.com\/(?:a\/macros\/[a-z0-9.-]+\/|macros\/)s\/[A-Za-z0-9_-]+\/exec$/
const SPREADSHEET = /^https:\/\/docs\.google\.com\/spreadsheets\/\S+$/
const STALE_QUEUE_MS = 2 * 60_000

/**
 * Settings → Google Sheet (stream A). Loads its own data; rendered inside SettingsScreen.
 * `after`: /setup on a local install, where a working connection goes back to the checklist.
 */
export function SheetSettings({ after = null }: { after?: string | null }) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const router = useRouter()
  const [data, setData] = useState<Settings | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [webhook, setWebhook] = useState("")
  const [sheetUrl, setSheetUrl] = useState("")
  const [tabName, setTabName] = useState("")
  const [fieldError, setFieldError] = useState<{ webhook?: string; sheet?: string }>({})
  const [busy, setBusy] = useState<null | "test" | "sync" | "toggle" | "disconnect">(null)
  const [showScript, setShowScript] = useState(false)

  const load = useCallback(async () => {
    setState("loading")
    try {
      const next = await invoke(getSheetSettings, {})
      setData(next)
      setWebhook(next.status.webhookUrl ?? "")
      setSheetUrl(next.status.spreadsheetUrl ?? "")
      setTabName(next.status.tabName)
      setState("ready")
    } catch {
      setState("error")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const errorText = (status: Status) =>
    status.lastErrorCode ? t(`sheet.err.${status.lastErrorCode}` as CopyKey) : status.lastError

  function report(reply: SyncReply) {
    setData((current) => (current ? { ...current, status: reply.status } : current))
    const sync = reply.sync
    if (!sync) return
    const imported = sync.imported
    if (
      sync.status === "synced" &&
      imported &&
      imported.created + imported.updated + imported.deleted
    )
      toast.show({ message: t("sheet.imported", imported), duration: 8000 })
    else if (sync.status === "synced") toast.show({ message: t("sheet.ok", { n: sync.rows }) })
    else if (sync.status === "not-configured")
      toast.show({ message: t("sheet.notConnected"), tone: "danger" })
    else
      toast.show({
        message: errorText(reply.status) ?? t("sheet.err.generic"),
        tone: "danger",
        duration: 8000,
      })
    if (sync.status === "synced" && (sync.table === "no-service" || sync.table === "error"))
      toast.show({
        message:
          sync.table === "error"
            ? t("sheet.table.error", { detail: sync.tableDetail ?? "" })
            : t("sheet.table.noService"),
        duration: 10000,
      })
  }

  async function saveAndTest() {
    const nextErrors: typeof fieldError = {}
    const hook = webhook.trim()
    const sheet = sheetUrl.trim()
    if (!WEBHOOK.test(hook)) nextErrors.webhook = t("sheet.invalidUrl")
    if (sheet && !SPREADSHEET.test(sheet))
      nextErrors.sheet = "https://docs.google.com/spreadsheets/…"
    setFieldError(nextErrors)
    if (nextErrors.webhook || nextErrors.sheet) return
    setBusy("test")
    try {
      const reply = await invoke(saveSheetSettings, {
        webhookUrl: hook,
        spreadsheetUrl: sheet || null,
        tabName: tabName.trim(),
        test: true,
      })
      report(reply)
      if (after && reply.sync?.status === "synced") router.push(after)
    } catch {
      toast.show({ message: t("err.save"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  async function syncNow() {
    setBusy("sync")
    try {
      report(await invoke(syncSheetNow, {}))
    } catch {
      toast.show({ message: t("sheet.err.generic"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  async function toggle(patch: { autoSync?: boolean; includeNotes?: boolean }) {
    if (!data) return
    const before = data.status
    setData({ ...data, status: { ...before, ...patch } })
    setBusy("toggle")
    try {
      const reply = await invoke(saveSheetSettings, patch)
      setData((current) => (current ? { ...current, status: reply.status } : current))
      toast.show({ message: t("sheet.saved") })
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
      const reply = await invoke(saveSheetSettings, { webhookUrl: null })
      setData((current) => (current ? { ...current, status: reply.status } : current))
      setWebhook("")
      toast.show({ message: t("sheet.disconnected") })
    } catch {
      toast.show({ message: t("err.save"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  const status = data?.status
  const queuedLong =
    status?.pendingSince && new Date(status.pendingSince).getTime() < Date.now() - STALE_QUEUE_MS

  const steps = data ? (
    <ol className="sheet-steps">
      <li className="sheet-step">
        <h3>{t("sheet.step1.title")}</h3>
        <p className="t-sm muted">{t("sheet.step1.body")}</p>
        <div>
          <ButtonLink
            href="https://sheets.new"
            external
            size="sm"
            variant="outline"
            iconRight={<ExternalLink />}
          >
            {t("sheet.step1.cta")}
          </ButtonLink>
        </div>
      </li>
      <li className="sheet-step">
        <h3>{t("sheet.step2.title")}</h3>
        <p className="t-sm muted">{t("sheet.step2.body")}</p>
        <p className="t-sm muted">{t("sheet.step2.service")}</p>
        <div className="stack-sm">
          <div className="row">
            <CopyButton text={data.script} label={t("sheet.step2.copy")} variant="primary" />
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={showScript}
              onClick={() => setShowScript((value) => !value)}
            >
              {showScript ? t("sheet.step2.hide") : t("sheet.step2.show")}
            </Button>
          </div>
          {showScript ? <CodeBlock code={data.script} /> : null}
        </div>
      </li>
      <li className="sheet-step">
        <h3>{t("sheet.step3.title")}</h3>
        <ul className="t-sm muted">
          <li>{t("sheet.step3.deploy")}</li>
          <li>{t("sheet.step3.access")}</li>
          <li>{t("sheet.step3.warning")}</li>
          <li>{t("sheet.step3.copy")}</li>
        </ul>
      </li>
      <li className="sheet-step">
        <h3>{t("sheet.step4.title")}</h3>
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void saveAndTest()
          }}
        >
          <Field label={t("sheet.webhook")} htmlFor="sheet-webhook" error={fieldError.webhook}>
            <input
              id="sheet-webhook"
              className="input"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={t("sheet.webhookPh")}
              value={webhook}
              aria-invalid={Boolean(fieldError.webhook) || undefined}
              onChange={(event) => setWebhook(event.target.value)}
            />
          </Field>
          <Field
            label={t("sheet.spreadsheet")}
            htmlFor="sheet-url"
            hint={t("sheet.spreadsheetHint")}
            error={fieldError.sheet}
          >
            <input
              id="sheet-url"
              className="input"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              value={sheetUrl}
              aria-invalid={Boolean(fieldError.sheet) || undefined}
              onChange={(event) => setSheetUrl(event.target.value)}
            />
          </Field>
          <Field label={t("sheet.tab")} htmlFor="sheet-tab" hint={t("sheet.tabHint")}>
            <input
              id="sheet-tab"
              className="input"
              autoComplete="off"
              spellCheck={false}
              placeholder="Aplikacje"
              value={tabName}
              onChange={(event) => setTabName(event.target.value)}
            />
          </Field>
          <div>
            <Button type="submit" variant="primary" loading={busy === "test"}>
              {t("sheet.saveTest")}
            </Button>
          </div>
        </form>
      </li>
    </ol>
  ) : null

  return (
    <section className="card settings-sec" id="st-sheet" aria-labelledby="st-sheet-title">
      <h2 id="st-sheet-title">{t("sheet.title")}</h2>
      <p>{t("sheet.lead")}</p>

      {state === "loading" && !data ? (
        <div className="stack-sm" aria-busy="true">
          <Skeleton h={20} w="60%" />
          <Skeleton h={40} />
        </div>
      ) : state === "error" && !data ? (
        <Banner tone="danger" role="alert">
          <p>{t("sheet.loadError")}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </Banner>
      ) : status && data ? (
        <>
          <div className="sheet-status" role="status">
            <span className={`sheet-status__dot${status.configured ? " is-on" : ""}`} aria-hidden />
            <strong>{status.configured ? t("sheet.connected") : t("sheet.notConnected")}</strong>
            {status.configured ? (
              <span className="muted">
                {status.lastSyncedAt
                  ? t("sheet.lastSync", {
                      when: longDate(status.lastSyncedAt, locale, true),
                      n: status.lastRowCount ?? 0,
                    })
                  : t("sheet.never")}
              </span>
            ) : null}
          </div>
          {status.lastError ? (
            <Banner tone="danger">
              {t("sheet.lastError", { error: errorText(status) ?? "" })}
            </Banner>
          ) : null}
          {queuedLong ? (
            <Banner tone="warning">
              {t("sheet.queued", { when: longDate(status.pendingSince!, locale, true) })}
            </Banner>
          ) : null}

          {status.configured ? (
            <>
              <div className="row">
                <Button
                  size="sm"
                  variant="primary"
                  icon={<RefreshCw />}
                  loading={busy === "sync"}
                  onClick={() => void syncNow()}
                >
                  {t("sheet.syncNow")}
                </Button>
                {status.spreadsheetUrl ? (
                  <ButtonLink
                    href={status.spreadsheetUrl}
                    external
                    size="sm"
                    variant="outline"
                    iconRight={<ExternalLink />}
                  >
                    {t("sheet.open")}
                  </ButtonLink>
                ) : null}
                <Button
                  size="sm"
                  variant="danger-ghost"
                  icon={<Unplug />}
                  loading={busy === "disconnect"}
                  onClick={() => void disconnect()}
                >
                  {t("sheet.disconnect")}
                </Button>
              </div>
              <div className="sheet-toggles">
                <div className="sheet-toggle">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={status.autoSync}
                      disabled={busy === "toggle"}
                      aria-describedby="sheet-auto-hint"
                      onChange={(event) => void toggle({ autoSync: event.target.checked })}
                    />
                    {t("sheet.auto")}
                  </label>
                  <p className="field__hint" id="sheet-auto-hint">
                    {t("sheet.autoHint")}
                  </p>
                </div>
                <div className="sheet-toggle">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={status.includeNotes}
                      disabled={busy === "toggle"}
                      aria-describedby="sheet-notes-hint"
                      onChange={(event) => void toggle({ includeNotes: event.target.checked })}
                    />
                    {t("sheet.notes")}
                  </label>
                  <p className="field__hint" id="sheet-notes-hint">
                    {t("sheet.notesHint")}
                  </p>
                </div>
              </div>
              <details className="disclosure">
                <summary>
                  <ChevronRight aria-hidden />
                  {t("sheet.steps")}
                </summary>
                <div>{steps}</div>
              </details>
            </>
          ) : (
            steps
          )}
        </>
      ) : null}
    </section>
  )
}
