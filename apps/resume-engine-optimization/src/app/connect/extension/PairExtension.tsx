"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { CircleCheck, ClipboardList, FileText, Hand, Puzzle, TriangleAlert } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { CodeBlock } from "@newrole/ui/interactive"
import { Banner } from "@newrole/ui/primitives"
import { useCopy } from "src/app/i18n/Locale"

/** How long pair.js gets to answer before the token is shown for pasting. */
const ANSWER_TIMEOUT_MS = 3000

type State = "idle" | "working" | "done" | "manual" | "error"

export function PairExtension() {
  const { t } = useCopy()
  const [state, setState] = useState<State>("idle")
  const [token, setToken] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return
      if ((event.data as { type?: unknown } | null)?.type !== "newrole:paired") return
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = null
      setToken(null)
      setState("done")
    }
    window.addEventListener("message", onMessage)
    return () => {
      window.removeEventListener("message", onMessage)
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  async function pair() {
    setState("working")
    setToken(null)
    try {
      const response = await fetch("/api/ext/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      if (!response.ok) throw new Error(`status ${response.status}`)
      const data = (await response.json()) as { token: string }
      setToken(data.token)
      // Only this exact origin receives the message; pair.js checks the same on its side.
      window.postMessage(
        { type: "newrole:pair", token: data.token, origin: window.location.origin },
        window.location.origin
      )
      timer.current = window.setTimeout(() => setState("manual"), ANSWER_TIMEOUT_MS)
    } catch {
      setState("error")
    }
  }

  const items = [
    { icon: FileText, text: t("ext.pair.what1") },
    { icon: ClipboardList, text: t("ext.pair.what2") },
    { icon: Hand, text: t("ext.pair.what3") },
  ]

  return (
    <div className="stack-lg">
      <header className="page-head" style={{ marginBottom: 0 }}>
        <h1 className="t-h1 row" style={{ gap: 12 }}>
          <Puzzle width={30} height={30} aria-hidden style={{ color: "var(--primary)" }} />
          {t("ext.pair.title")}
        </h1>
        <p className="t-lg">{t("ext.pair.sub")}</p>
      </header>

      <ul className="ext-what">
        {items.map(({ icon: Icon, text }) => (
          <li key={text} className="card">
            <Icon aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      {state === "done" ? (
        <Banner tone="success" icon={<CircleCheck aria-hidden />} role="status">
          <p>{t("ext.pair.done")}</p>
        </Banner>
      ) : null}

      {state === "error" ? (
        <Banner tone="danger" icon={<TriangleAlert aria-hidden />} role="alert">
          <p>{t("ext.pair.error")}</p>
        </Banner>
      ) : null}

      {state === "manual" && token ? (
        <div className="stack-sm">
          <Banner tone="warning" icon={<TriangleAlert aria-hidden />} role="status">
            <p>
              <strong>{t("ext.pair.manualTitle")}</strong>
            </p>
            <p>{t("ext.pair.manualBody")}</p>
          </Banner>
          <CodeBlock code={token} copyVariant="primary" />
          <p className="t-sm muted">{t("ext.pair.tokenOnce")}</p>
        </div>
      ) : null}

      <div className="row">
        <Button
          variant={state === "done" ? "outline" : "primary"}
          loading={state === "working"}
          onClick={() => void pair()}
        >
          {state === "working"
            ? t("ext.pair.working")
            : state === "idle"
            ? t("ext.pair.cta")
            : t("ext.pair.again")}
        </Button>
      </div>

      <p className="t-sm muted">
        <Link className="link" href="/settings#st-extension">
          {t("ext.pair.install")}
        </Link>
      </p>
    </div>
  )
}
