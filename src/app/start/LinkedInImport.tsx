"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useMutation } from "@blitzjs/rpc"
import {
  Check,
  CircleAlert,
  ExternalLink,
  FileArchive,
  FileText,
  Lock,
  RotateCcw,
  SquareTerminal,
} from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button, ButtonLink } from "src/app/components/ds/Button"
import { Dropzone } from "src/app/components/ds/interactive"
import { Badge, Banner } from "src/app/components/ds/primitives"
import ensureGuest from "src/app/profile/mutations/ensureGuest"
import type { ProfileDraft } from "src/server/profile/schema"
import { BROWSER_IMPORT_HEADER, LINKEDIN_BROWSER_STAGES } from "src/shared/linkedin-import"

type Stage = (typeof LINKEDIN_BROWSER_STAGES)[number]
type Failure = "not-connected" | "signed-out" | "no-claude" | "failed"
type State =
  | { kind: "idle" }
  | { kind: "running"; stage: Stage }
  | { kind: "error"; status: Failure }

const POLL_MS = 1500
const CLIENT_TIMEOUT_MS = 5 * 60 * 1000
const EXPORT_URL = "https://www.linkedin.com/mypreferences/d/download-my-data"

function failureOf(status: unknown): Failure {
  return status === "not-connected" || status === "signed-out" || status === "no-claude"
    ? status
    : "failed"
}

export function LinkedInImport({
  browserImport,
  signInHref,
  onDraft,
  onFile,
}: {
  browserImport: boolean
  signInHref: string
  onDraft: (draft: ProfileDraft) => void
  onFile: (file: File) => void
}) {
  const { t } = useCopy()
  const [state, setState] = useState<State>({ kind: "idle" })
  const [ensureSession] = useMutation(ensureGuest)
  const timer = useRef<number | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  async function start() {
    setState({ kind: "running", stage: "connecting" })
    let jobId: string
    try {
      // The import runs for a session only, and a first visit has none yet.
      await ensureSession(null)
      const response = await fetch("/api/profile/linkedin-browser", {
        method: "POST",
        headers: { [BROWSER_IMPORT_HEADER]: "1" },
      })
      const body = (await response.json()) as { jobId?: string }
      if (!response.ok || !body.jobId) throw new Error("start failed")
      jobId = body.jobId
    } catch {
      setState({ kind: "error", status: "failed" })
      return
    }
    const startedAt = Date.now()
    const poll = async () => {
      if (!alive.current) return
      try {
        const response = await fetch(`/api/profile/linkedin-browser?id=${encodeURIComponent(jobId)}`)
        const job = (await response.json()) as {
          state?: string
          stage?: Stage
          status?: string
          draft?: ProfileDraft
        }
        if (!alive.current) return
        if (job.state === "done" && job.draft) {
          setState({ kind: "running", stage: "analyzing" })
          onDraft(job.draft)
          return
        }
        if (job.state === "error" || !response.ok) {
          setState({ kind: "error", status: failureOf(job.status) })
          return
        }
        if (job.stage) setState({ kind: "running", stage: job.stage })
      } catch {
        // a dropped poll is retried below
      }
      if (Date.now() - startedAt > CLIENT_TIMEOUT_MS) {
        setState({ kind: "error", status: "failed" })
        return
      }
      timer.current = window.setTimeout(poll, POLL_MS)
    }
    timer.current = window.setTimeout(poll, POLL_MS)
  }

  const running = state.kind === "running"
  const at = running ? LINKEDIN_BROWSER_STAGES.indexOf(state.stage) : -1

  return (
    <div className="lix">
      {/* (a) Claude in the person's own Chrome */}
      <section className="card card--pad lix-opt lix-opt--primary" aria-labelledby="lix-claude">
        <div className="lix-opt__head">
          <span className="tile__icon">
            <SquareTerminal aria-hidden />
          </span>
          <h2 className="t-h3" id="lix-claude">
            {t("lix.claude.title")}
          </h2>
          <Badge tone="primary">{t("lix.claude.badge")}</Badge>
        </div>
        <p className="lix-opt__body">{t("lix.claude.body")}</p>

        {running ? (
          <div className="stack" aria-live="polite">
            <ol className="stages">
              {LINKEDIN_BROWSER_STAGES.map((stage, index) => {
                const status = index < at ? "done" : index === at ? "active" : "pending"
                return (
                  <li key={stage} className="stage" data-state={status}>
                    <span className="stage__icon" aria-hidden>
                      {status === "done" ? (
                        <Check />
                      ) : status === "active" ? (
                        <span className="stage__spin" />
                      ) : (
                        <span className="stage__dot" />
                      )}
                    </span>
                    <span>{t(`lix.stage.${stage}` as CopyKey)}</span>
                    <span />
                  </li>
                )
              })}
            </ol>
            <p className="t-sm muted">{t("lix.running.note")}</p>
          </div>
        ) : state.kind === "error" ? (
          <div className="stack">
            <Banner tone={state.status === "failed" ? "danger" : "warning"} role="alert" icon={<CircleAlert aria-hidden />}>
              {state.status === "not-connected" ? (
                <>
                  <p>
                    <strong>{t("lix.err.notConnected")}</strong>
                  </p>
                  <ol className="lix-fix">
                    <li>
                      {t("lix.err.notConnected.1")}{" "}
                      <a className="link" href="https://claude.ai/chrome" target="_blank" rel="noreferrer">
                        claude.ai/chrome
                      </a>
                    </li>
                    <li>{t("lix.err.notConnected.2")}</li>
                    <li>{t("lix.err.notConnected.3")}</li>
                  </ol>
                </>
              ) : (
                <p>
                  {t(
                    state.status === "signed-out"
                      ? "lix.err.signedOut"
                      : state.status === "no-claude"
                      ? "lix.err.noClaude"
                      : "lix.err.failed"
                  )}
                </p>
              )}
            </Banner>
            <div>
              <Button variant="primary" icon={<RotateCcw />} onClick={() => void start()}>
                {t("lix.retry")}
              </Button>
            </div>
          </div>
        ) : browserImport ? (
          <div>
            <Button variant="primary" size="lg" icon={<SquareTerminal />} onClick={() => void start()}>
              {t("lix.claude.cta")}
            </Button>
          </div>
        ) : (
          <p className="t-sm muted">{t("lix.claude.unavailable")}</p>
        )}
      </section>

      {/* (b) LinkedIn's own data export */}
      <section className="card card--pad lix-opt" aria-labelledby="lix-zip">
        <div className="lix-opt__head">
          <span className="tile__icon">
            <FileArchive aria-hidden />
          </span>
          <h2 className="t-h3" id="lix-zip">
            {t("lix.zip.title")}
          </h2>
        </div>
        <p className="lix-opt__body">{t("lix.zip.body")}</p>
        <ol className="steps-list">
          {(["lix.zip.1", "lix.zip.2", "lix.zip.3"] as const).map((key, index) => (
            <li className="step-row" key={key}>
              <span className="step-row__n">{index + 1}</span>
              <div className="step-row__body">
                <span>{t(key)}</span>
                {index === 0 ? (
                  <div>
                    <ButtonLink href={EXPORT_URL} external variant="outline" size="sm" iconRight={<ExternalLink />}>
                      {t("lix.zip.open")}
                    </ButtonLink>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <Dropzone onFile={onFile} className="dropzone dropzone--compact" accept=".zip,application/zip">
          {(open) => (
            <Button variant="outline" icon={<FileArchive />} onClick={open} disabled={running}>
              {t("lix.zip.choose")}
            </Button>
          )}
        </Dropzone>
        <p className="t-sm muted">
          <Lock aria-hidden className="lix-lock" /> {t("lix.zip.privacy")}
        </p>
      </section>

      {/* (c) Save to PDF */}
      <section className="card card--pad lix-opt" aria-labelledby="lix-pdf">
        <div className="lix-opt__head">
          <span className="tile__icon">
            <FileText aria-hidden />
          </span>
          <h2 className="t-h3" id="lix-pdf">
            {t("lix.pdf.title")}
          </h2>
        </div>
        <p className="lix-opt__body">{t("lix.pdf.body")}</p>
        <div className="row">
          <ButtonLink
            href="https://www.linkedin.com/in/me/"
            external
            variant="ghost"
            size="sm"
            iconRight={<ExternalLink />}
          >
            {t("li.step1.btn").replace(" ↗", "")}
          </ButtonLink>
          <Dropzone onFile={onFile} className="" overClassName="">
            {(open) => (
              <Button variant="outline" icon={<FileText />} onClick={open} disabled={running}>
                {t("lix.pdf.choose")}
              </Button>
            )}
          </Dropzone>
        </div>
      </section>

      <p className="t-sm muted lix-foot">
        <Lock aria-hidden className="lix-lock" /> {t("lix.ownOnly")}{" "}
        <Link className="link" href={signInHref}>
          {t("lix.signin")}
        </Link>
      </p>
    </div>
  )
}
