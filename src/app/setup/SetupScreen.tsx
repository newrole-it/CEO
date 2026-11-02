"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  PartyPopper,
} from "lucide-react"
import { Button, ButtonLink } from "src/app/components/ds/Button"
import { CodeBlock, Modal, ModalHead } from "src/app/components/ds/interactive"
import { Banner, Badge } from "src/app/components/ds/primitives"
import { SETUP_SKIP_COOKIE } from "src/app/components/site/links"
import { useCopy } from "src/app/i18n/Locale"
import { numberFormat, type CopyKey } from "src/app/i18n/copy"
import type { SetupStatus } from "src/server/setup/status"
import {
  nextStep,
  progress,
  type SetupStep,
  type StepGroup,
  type StepState,
} from "src/server/setup/steps"

const POLL_MS = 4000
const GROUPS: StepGroup[] = ["run", "you", "connect"]
const STATE_ICON: Record<StepState, typeof Circle> = {
  done: CircleCheck,
  todo: Circle,
  wait: LoaderCircle,
  error: CircleAlert,
}

type Hello = { connected: boolean; version: string | null }

/** Set once the "everything connected" dialog was seen, so it shows once per browser. */
const CELEBRATED_KEY = "nr-setup-celebrated"

function celebrated(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(CELEBRATED_KEY) === "1"
  } catch {
    return false
  }
}

/** The extension's content script says hello on this page, so the page knows it is installed. */
function useExtensionHello() {
  const [hello, setHello] = useState<Hello | null>(null)
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return
      const data = event.data as { type?: unknown; connected?: unknown; version?: unknown } | null
      if (data?.type !== "newrole:hello") return
      setHello({
        connected: data.connected === true,
        version: typeof data.version === "string" ? data.version : null,
      })
    }
    window.addEventListener("message", onMessage)
    const ping = () => window.postMessage({ type: "newrole:ping" }, window.location.origin)
    ping()
    window.addEventListener("focus", ping)
    return () => {
      window.removeEventListener("message", onMessage)
      window.removeEventListener("focus", ping)
    }
  }, [])
  return hello
}

export function SetupScreen({ initial }: { initial: SetupStatus }) {
  const { t } = useCopy()
  const router = useRouter()
  const [status, setStatus] = useState(initial)
  const [offline, setOffline] = useState(false)
  const hello = useExtensionHello()

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/setup/status", { cache: "no-store" })
      if (!response.ok) throw new Error(`status ${response.status}`)
      setStatus((await response.json()) as SetupStatus)
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, POLL_MS)
    window.addEventListener("focus", refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [refresh])

  // The extension knows it is paired before the server has seen it use the token.
  const steps = useMemo(
    () =>
      status.steps.map(
        (step): SetupStep =>
          step.id === "extension" && hello?.connected
            ? { ...step, state: "done", note: "ok", path: undefined, command: undefined }
            : step
      ),
    [status.steps, hello]
  )
  const next = nextStep(steps)
  const count = progress(steps)
  // Every step, optional ones too; the index may still be filling.
  const complete = steps.every((step) => step.state === "done" || step.state === "wait")
  const [seen, setSeen] = useState(celebrated)

  function closeCelebration() {
    try {
      window.localStorage.setItem(CELEBRATED_KEY, "1")
    } catch {
      // Without storage the dialog may show again on the next visit. That is all.
    }
    setSeen(true)
  }

  function skip() {
    document.cookie = `${SETUP_SKIP_COOKIE}=1; path=/; max-age=31536000; samesite=lax`
    router.push("/jobs?tab=all")
  }

  return (
    <div>
      <header className="page-head">
        <h1 className="t-h1">{t("setup.title")}</h1>
        <p>{t("setup.sub")}</p>
      </header>

      <div className="setup-progress">
        <div
          className="setup-progress__bar"
          role="progressbar"
          aria-label={t("setup.progressLabel")}
          aria-valuemin={0}
          aria-valuemax={count.total}
          aria-valuenow={count.done}
        >
          <span style={{ width: `${Math.round((count.done / count.total) * 100)}%` }} />
        </div>
        <p className="t-sm muted" aria-live="polite">
          {t("setup.progress", count)}
        </p>
      </div>

      {offline ? (
        <div style={{ marginBottom: 24 }}>
          <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden />}>
            <p>{t("setup.offline")}</p>
          </Banner>
        </div>
      ) : null}

      {status.ready ? (
        <div style={{ marginBottom: 24 }}>
          <Banner tone="success" icon={<PartyPopper aria-hidden />}>
            <p>
              <strong>{t("setup.ready.title")}</strong> {t("setup.ready.body")}
            </p>
            <div style={{ marginTop: 8 }}>
              <ButtonLink href="/jobs" variant="primary" size="sm">
                {t("setup.ready.cta")}
              </ButtonLink>
            </div>
          </Banner>
        </div>
      ) : null}

      <div className="setup-groups">
        {GROUPS.map((group) => (
          <section key={group} aria-labelledby={`setup-${group}`}>
            <div className="setup-group__head">
              <h2 id={`setup-${group}`}>{t(`setup.group.${group}` as CopyKey)}</h2>
              <p className="t-sm muted">{t(`setup.group.${group}.sub` as CopyKey)}</p>
            </div>
            <ol className="setup-steps">
              {steps
                .filter((step) => step.group === group)
                .map((step) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    isNext={next?.id === step.id}
                    hello={hello}
                    signedIn={status.signedIn}
                    onChanged={refresh}
                  />
                ))}
            </ol>
          </section>
        ))}
      </div>

      {status.ready ? null : (
        <div className="setup-foot">
          <button type="button" className="link link--quiet t-sm" onClick={skip}>
            {t("setup.skip")}
          </button>
        </div>
      )}

      <Modal open={complete && !seen} onClose={closeCelebration} labelledBy="setup-done-title">
        <ModalHead title={t("setup.done.title")} id="setup-done-title" onClose={closeCelebration} />
        <div className="modal__body">
          <p className="muted">{t("setup.done.body")}</p>
        </div>
        <div className="modal__foot">
          <Button variant="ghost" onClick={closeCelebration}>
            {t("setup.done.stay")}
          </Button>
          <ButtonLink href="/jobs" variant="primary" onClick={closeCelebration}>
            {t("setup.done.cta")}
          </ButtonLink>
        </div>
      </Modal>
    </div>
  )
}

function StepRow({
  step,
  isNext,
  hello,
  signedIn,
  onChanged,
}: {
  step: SetupStep
  isNext: boolean
  hello: Hello | null
  signedIn: boolean
  onChanged: () => Promise<void>
}) {
  const { t, locale } = useCopy()
  const prefix = `setup.${step.id}`
  const Icon = STATE_ICON[step.state]
  const hasBody = step.state !== "done"
  // Open by default on the next step; after that the person's own choice wins.
  const [choice, setChoice] = useState<boolean | null>(null)
  const open = hasBody && (choice ?? isNext)
  const vars = Object.fromEntries(
    Object.entries(step.vars ?? {}).map(([key, value]) => [
      key,
      typeof value === "number" ? numberFormat(locale).format(value) : value,
    ])
  )
  const note = t(`${prefix}.${step.note}` as CopyKey, vars)
  const main = (
    <>
      <span className="setup-step__icon" aria-hidden>
        <Icon className={step.state === "wait" ? "spin" : undefined} />
      </span>
      <span className="setup-step__main">
        <span className="setup-step__title">
          {t(`${prefix}.title` as CopyKey)}
          {step.importance === "optional" ? (
            <Badge tone="plain">{t("setup.optional")}</Badge>
          ) : null}
          {isNext ? <Badge tone="primary">{t("setup.next")}</Badge> : null}
        </span>
        <span className="setup-step__note">{note}</span>
      </span>
      <span className="setup-step__state">
        {t(`setup.state.${step.state}` as CopyKey)}
        {hasBody ? (
          open ? (
            <ChevronDown size={14} aria-hidden />
          ) : (
            <ChevronRight size={14} aria-hidden />
          )
        ) : null}
      </span>
    </>
  )
  return (
    <li className="setup-step" data-state={step.state} data-next={isNext}>
      {hasBody ? (
        <button
          type="button"
          className="setup-step__row"
          aria-expanded={open}
          onClick={() => setChoice(!open)}
        >
          {main}
        </button>
      ) : (
        <div className="setup-step__row">{main}</div>
      )}
      {open ? (
        <div className="setup-step__body">
          <p className="setup-step__why">{t(`${prefix}.why` as CopyKey)}</p>
          {step.id === "extension" && step.path ? (
            <ExtensionInstall
              path={step.path}
              hello={hello}
              signedIn={signedIn}
              onChanged={onChanged}
            />
          ) : null}
          {step.command ? (
            <div className="stack-sm">
              <p className="t-sm">
                {t(step.id === "claude" ? "setup.runAnywhere" : "setup.runThis")}
              </p>
              <CodeBlock code={step.command} />
            </div>
          ) : null}
          {step.href && step.state !== "wait" ? (
            <div className="setup-step__cta">
              <ButtonLink href={step.href} variant={isNext ? "primary" : "outline"} size="sm">
                {t(`${prefix}.cta` as CopyKey)}
              </ButtonLink>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function ExtensionInstall({
  path,
  hello,
  signedIn,
  onChanged,
}: {
  path: string
  hello: Hello | null
  signedIn: boolean
  onChanged: () => Promise<void>
}) {
  const { t } = useCopy()
  const [state, setState] = useState<"idle" | "working" | "failed">("idle")
  const token = useRef<string | null>(null)

  // newrole:paired comes from the content script: prove the token works, then refresh the list.
  useEffect(() => {
    async function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return
      if ((event.data as { type?: unknown } | null)?.type !== "newrole:paired") return
      if (token.current) {
        await fetch("/api/ext/me", { headers: { Authorization: `Bearer ${token.current}` } }).catch(
          () => undefined
        )
        token.current = null
      }
      setState("idle")
      await onChanged()
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [onChanged])

  async function connect() {
    setState("working")
    try {
      const response = await fetch("/api/ext/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      if (!response.ok) throw new Error(`status ${response.status}`)
      const data = (await response.json()) as { token: string }
      token.current = data.token
      window.postMessage(
        { type: "newrole:pair", token: data.token, origin: window.location.origin },
        window.location.origin
      )
      window.setTimeout(
        () => setState((current) => (current === "working" ? "failed" : current)),
        5000
      )
    } catch {
      setState("failed")
    }
  }

  if (hello) {
    return (
      <div className="stack-sm">
        <p className="t-sm">{t("setup.extension.installed")}</p>
        {signedIn ? (
          <div className="setup-step__cta">
            <Button
              variant="primary"
              size="sm"
              loading={state === "working"}
              onClick={() => void connect()}
            >
              {state === "working" ? t("setup.extension.connecting") : t("setup.extension.connect")}
            </Button>
          </div>
        ) : (
          <p className="t-sm muted">{t("setup.extension.needAccount")}</p>
        )}
        {state === "failed" ? (
          <p className="field__error" role="alert">
            {t("setup.extension.failed")}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <ol className="setup-install">
      <li>
        <div className="setup-install__body">
          <span>{t("setup.extension.step1")}</span>
          <CodeBlock code="chrome://extensions" />
        </div>
      </li>
      <li>
        <div className="setup-install__body">
          <span>{t("setup.extension.step2")}</span>
          <CodeBlock code={path} />
        </div>
      </li>
      <li>
        <span>{t("setup.extension.step3")}</span>
      </li>
    </ol>
  )
}
