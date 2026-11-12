"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { safeReturnTo } from "src/shared/return-to"
import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation } from "src/app/rpc-hooks"
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileUp,
  Lock,
  SquareTerminal,
} from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Dropzone, isPdf, isZip, useToast } from "@newrole/ui/interactive"
import { Banner } from "@newrole/ui/primitives"
import { LinkedInMark } from "src/app/components/site/Brand"
import ensureGuest from "src/app/profile/mutations/ensureGuest"
import saveProfile from "src/app/profile/mutations/saveProfile"
import {
  ProfileReview,
  ReviewSkeleton,
  cleanDraft,
  fieldsFrom,
  salaryError,
  type DraftField,
} from "@newrole/profile-ui/ProfileReview"
import { emptyProfileDraft, type ProfileDraft } from "@newrole/profile/schema"
import { LinkedInImport } from "@newrole/profile-ui/LinkedInImport"
import { newroleBrowserImport } from "src/app/profile/profile-ui"
import { PasteTile } from "@newrole/profile-ui/PasteTile"
import { clearPendingFile, linkedInStartHref, takePendingFile } from "./pending"

export type Step = "source" | "linkedin" | "reading" | "review" | "linkedin-next"
type Source = { kind: "file"; file: File } | { kind: "text"; text: string }
type Stage = 0 | 1 | 2 | 3
type ReadError =
  | "err.pdfSize"
  | "err.notPdf"
  | "err.pdfUnreadable"
  | "err.tooShort"
  | "err.read"
  | "err.zipNotZip"
  | "err.zipNoProfile"
  | "err.zipTooLarge"

const MAX_BYTES = 8_000_000
const MAX_ZIP_BYTES = 50_000_000
const HARD_TIMEOUT = 90_000

function errorFor(status: number, message: string | undefined, code?: string): ReadError {
  const text = (message ?? "").toLowerCase()
  if (status === 400 && code === "no-profile") return "err.zipNoProfile"
  if (status === 400 && code === "too-large") return "err.zipTooLarge"
  if (status === 400 && (code === "not-zip" || code === "unsupported")) return "err.zipNotZip"
  if (status === 400 && text.includes("50 mb")) return "err.zipTooLarge"
  if (status === 400 && text.includes("8 mb")) return "err.pdfSize"
  if (status === 400 && text.includes("upload a pdf")) return "err.notPdf"
  if (status === 400 && text.includes("could not read")) return "err.pdfUnreadable"
  if (status === 400 && text.includes("paste more")) return "err.tooShort"
  return "err.read"
}

function setStepUrl(step: Step, hash = "") {
  const url = new URL(window.location.href)
  url.searchParams.set("step", step)
  url.searchParams.delete("via")
  url.hash = hash
  window.history.replaceState(window.history.state, "", url.toString())
}

export function Onboarding({
  initialStep,
  linkedIn,
  browserImport,
  firstName,
  photo,
  after,
}: {
  initialStep: Step
  linkedIn: boolean
  browserImport: boolean
  firstName: string | null
  photo: string | null
  /** Where a saved profile goes without a returnTo: /setup mid-checklist, else the feed */
  after: string
}) {
  const { t } = useCopy()
  const router = useRouter()
  const toast = useToast()
  const [step, setStep] = useState<Step>(initialStep)
  const [stage, setStage] = useState<Stage>(0)
  const [error, setError] = useState<ReadError | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [slowDismissed, setSlowDismissed] = useState(false)
  const [manual, setManual] = useState(false)
  const [late, setLate] = useState<ProfileDraft | null>(null)
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfileDraft())
  const [fromCv, setFromCv] = useState<Set<DraftField>>(new Set())
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [reviewKey, setReviewKey] = useState(0)
  const [save, { isPending: saving }] = useMutation(saveProfile)
  const [ensureSession] = useMutation(ensureGuest)
  const xhr = useRef<XMLHttpRequest | null>(null)
  const last = useRef<Source | null>(null)
  const manualRef = useRef(false)
  manualRef.current = manual
  const headingRef = useRef<HTMLHeadingElement>(null)

  const go = useCallback((next: Step, hash = "") => {
    setStep(next)
    setStepUrl(next, hash)
    window.scrollTo({ top: 0 })
    window.setTimeout(() => headingRef.current?.focus(), 30)
  }, [])

  const toReview = useCallback(
    (next: ProfileDraft | null) => {
      const value = next ?? emptyProfileDraft()
      setDraft(value)
      setFromCv(fieldsFrom(next))
      setReviewKey((key) => key + 1)
      go("review")
    },
    [go]
  )

  const read = useCallback(
    (source: Source) => {
      last.current = source
      setError(null)
      setManual(false)
      setLate(null)
      setSlowDismissed(false)
      if (source.kind === "file") {
        const zip = isZip(source.file)
        if (!zip && !isPdf(source.file)) {
          setError("err.notPdf")
          setPasteOpen(true)
          go("reading")
          return
        }
        if (source.file.size > (zip ? MAX_ZIP_BYTES : MAX_BYTES)) {
          setError(zip ? "err.zipTooLarge" : "err.pdfSize")
          setPasteOpen(true)
          go("reading")
          return
        }
      } else if (source.text.trim().length < 20) {
        setError("err.tooShort")
        go("reading")
        return
      }
      const body = new FormData()
      if (source.kind === "file") body.set("file", source.file)
      else body.set("text", source.text)
      const started = Date.now()
      setElapsed(0)
      setStage(1)
      go("reading")
      xhr.current?.abort()
      const request = new XMLHttpRequest()
      xhr.current = request
      request.open("POST", "/api/profile/import")
      request.timeout = HARD_TIMEOUT
      request.upload.onload = () => setStage((current) => (current < 2 ? 2 : current))
      request.onload = () => {
        if (xhr.current !== request) return
        xhr.current = null
        clearPendingFile()
        let payload: { draft?: ProfileDraft; error?: string; code?: string } = {}
        try {
          payload = JSON.parse(request.responseText) as typeof payload
        } catch {}
        if (request.status >= 400 || !payload.draft) {
          setError(errorFor(request.status, payload.error, payload.code))
          setPasteOpen(true)
          setStage(0)
          return
        }
        const result = payload.draft
        if (manualRef.current) {
          setLate(result)
          return
        }
        if (Date.now() - started < 600) {
          toReview(result)
          return
        }
        setStage(3)
        window.setTimeout(() => toReview(result), 300)
      }
      const fail = () => {
        if (xhr.current !== request) return
        xhr.current = null
        if (manualRef.current) return
        setError("err.read")
        setStage(0)
      }
      request.onerror = fail
      request.ontimeout = fail
      // The import route reads CVs only for a session; a first visit has none yet.
      ensureSession(null)
        .then(() => {
          if (xhr.current === request) request.send(body)
        })
        .catch(fail)
    },
    [go, toReview, ensureSession]
  )

  // A file handed over from the landing hero.
  useEffect(() => {
    if (initialStep !== "reading") return
    const file = takePendingFile()
    if (file) read({ kind: "file", file })
    else go("source")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (step === "source" && window.location.hash === "#paste") setPasteOpen(true)
  }, [step])

  // Elapsed counter while reading.
  useEffect(() => {
    if (step !== "reading" || error || stage === 0 || stage === 3) return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [step, error, stage])

  useEffect(() => () => xhr.current?.abort(), [])

  function cancel() {
    clearPendingFile()
    xhr.current?.abort()
    xhr.current = null
    setStage(0)
    setError(null)
    go("source")
  }

  async function finish() {
    if (salaryError(draft)) return
    try {
      await save(cleanDraft(draft))
      // /setup sends people here and expects them back at the next step of the checklist.
      const back = safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"))
      router.push(back ?? after)
      router.refresh()
    } catch {
      toast.show({ message: t("err.saveProfile"), tone: "danger" })
    }
  }

  const onFile = (file: File) => read({ kind: "file", file })

  /* ----------------------------------------------------------- source tiles */
  const tiles = (
    <div className="tiles">
      <Dropzone onFile={onFile} className="tile-drop">
        {(open) => (
          <button type="button" className="tile tile--primary" onClick={open}>
            <span className="tile__icon">
              <FileUp aria-hidden />
            </span>
            <span className="tile__text">
              <span className="tile__title">{t("onb.tile.pdf")}</span>
              <span className="tile__hint">{t("onb.tile.pdf.hint")}</span>
            </span>
            <ChevronRight className="tile__chev" aria-hidden />
          </button>
        )}
      </Dropzone>
      <button type="button" className="tile" onClick={() => go("linkedin")}>
        <span className="tile__icon">
          <LinkedInMark size={20} />
        </span>
        <span className="tile__text">
          <span className="tile__title">{t("lix.title")}</span>
          <span className="tile__hint">{t("onb.tile.li.hint")}</span>
        </span>
        <ChevronRight className="tile__chev" aria-hidden />
      </button>
      <PasteTile
        open={pasteOpen}
        setOpen={setPasteOpen}
        text={pasteText}
        setText={setPasteText}
        onRead={() => read({ kind: "text", text: pasteText })}
      />
    </div>
  )

  if (step === "source") {
    return (
      <div className="onb container container--focus">
        <div className="onb-head">
          <h1 className="t-h1" tabIndex={-1} ref={headingRef}>
            {t("onb.source.title")}
          </h1>
          <p>{t("onb.source.sub")}</p>
        </div>
        {tiles}
        <Link
          className="card card--hover rail-link"
          href="/connect#linkedin"
          style={{ marginTop: 16 }}
        >
          <SquareTerminal aria-hidden />
          <span>{t("onb.claudeHint")}</span>
        </Link>
      </div>
    )
  }

  const importOptions = (
    <LinkedInImport
      browser={browserImport ? newroleBrowserImport : null}
      signInHref={linkedIn ? linkedInStartHref() : "/start/linkedin"}
      onDraft={toReview}
      onFile={onFile}
    />
  )

  if (step === "linkedin") {
    return (
      <div className="onb container container--focus">
        <div className="onb-head">
          <h1 className="t-h1" tabIndex={-1} ref={headingRef}>
            {t("lix.title")}
          </h1>
          <p>{t("lix.sub")}</p>
        </div>
        {importOptions}
        <p className="hero-links" style={{ marginTop: 16 }}>
          <button type="button" className="link" onClick={() => go("source")}>
            {t("lix.back")}
          </button>
        </p>
      </div>
    )
  }

  if (step === "linkedin-next") {
    return (
      <div className="onb container container--focus">
        <div className="onb-head">
          <div className="li-hello">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" referrerPolicy="no-referrer" />
            ) : null}
            <h1 className="t-h1" tabIndex={-1} ref={headingRef}>
              {firstName ? t("li.hi", { name: firstName }) : t("li.hiAnon")}
            </h1>
          </div>
          <p>{t("li.honest")}</p>
        </div>
        {importOptions}
        <p className="hero-links" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="link"
            onClick={() => {
              setPasteOpen(true)
              go("source", "#paste")
            }}
          >
            {t("li.paste")}
          </button>
        </p>
      </div>
    )
  }

  if (step === "reading") {
    const slow = elapsed > 30 && !slowDismissed
    const note = elapsed < 8 ? t("onb.read.usual") : t("onb.read.counting", { s: elapsed })
    const announce =
      elapsed === 10 || elapsed === 20 ? note : elapsed < 2 ? t("onb.read.usual") : ""
    const stageState = (n: 1 | 2 | 3) => (stage > n ? "done" : stage === n ? "active" : "pending")
    return (
      <div className="onb container">
        <div className="reading">
          <div className="stack-lg">
            <div className="onb-head" style={{ marginBottom: 0 }}>
              <h1 className="t-h1" tabIndex={-1} ref={headingRef}>
                {t("onb.read.title")}
              </h1>
            </div>
            {error ? (
              <div className="stack">
                <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden />}>
                  <p>{t(error as CopyKey)}</p>
                </Banner>
                <div className="row">
                  {last.current?.kind === "file" && error === "err.read" ? (
                    <Button variant="primary" onClick={() => last.current && read(last.current)}>
                      {t("onb.retry")}
                    </Button>
                  ) : (
                    <Dropzone onFile={onFile} className="" overClassName="">
                      {(open) => (
                        <Button variant="primary" icon={<FileUp />} onClick={open}>
                          {t("onb.tile.pdf")}
                        </Button>
                      )}
                    </Dropzone>
                  )}
                  <Button variant="ghost" onClick={cancel}>
                    {t("onb.cancel")}
                  </Button>
                </div>
                <PasteTile
                  open={pasteOpen}
                  setOpen={setPasteOpen}
                  text={pasteText}
                  setText={setPasteText}
                  onRead={() => read({ kind: "text", text: pasteText })}
                />
              </div>
            ) : (
              <>
                <ol className="stages">
                  {([1, 2, 3] as const).map((n) => {
                    const state = stageState(n)
                    return (
                      <li key={n} className="stage" data-state={state}>
                        <span className="stage__icon" aria-hidden>
                          {state === "done" ? (
                            <Check />
                          ) : state === "active" ? (
                            <span className="stage__spin" />
                          ) : (
                            <span className="stage__dot" />
                          )}
                        </span>
                        <span>
                          {t(`onb.read.s${n}`)}
                          <span className="sr-only">
                            {state === "done" ? " ✓" : state === "active" ? " …" : ""}
                          </span>
                        </span>
                        {state === "active" && n === 2 && elapsed > 0 ? (
                          <span className="stage__detail">
                            {t("onb.read.elapsed", { s: elapsed })}
                          </span>
                        ) : (
                          <span />
                        )}
                      </li>
                    )
                  })}
                </ol>
                <p className="reading__note" aria-hidden>
                  {slow ? t("onb.read.slow") : note}
                </p>
                <p className="sr-only" aria-live="polite">
                  {announce}
                </p>
                {slow ? (
                  <div className="row">
                    <Button variant="outline" onClick={() => setSlowDismissed(true)}>
                      {t("onb.read.wait")}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setManual(true)
                        manualRef.current = true
                        toReview(null)
                      }}
                    >
                      {t("onb.read.manual")}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
            {!error ? (
              <div className="card review-card">
                <ReviewSkeleton />
              </div>
            ) : null}
            {!error ? (
              <div>
                <Button variant="ghost" onClick={cancel}>
                  {t("onb.cancel")}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  // review
  const invalid = salaryError(draft)
  return (
    <div className="onb container container--narrow has-sticky-foot">
      <div className="onb-head">
        <div className="row row--between" style={{ alignItems: "baseline" }}>
          <h1 className="t-h1" tabIndex={-1} ref={headingRef}>
            {t("onb.review.title")}
          </h1>
          <button type="button" className="link t-sm" onClick={() => go("source")}>
            {t("onb.review.other")}
          </button>
        </div>
        <p>{t("onb.review.sub")}</p>
      </div>
      {late ? (
        <Banner tone="info" role="status" className="review-late">
          <p>{t("onb.read.late")}</p>
          <div className="row">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setDraft(late)
                setFromCv(fieldsFrom(late))
                setReviewKey((key) => key + 1)
                setLate(null)
                setManual(false)
              }}
            >
              {t("onb.read.yes")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLate(null)}>
              {t("onb.read.no")}
            </Button>
          </div>
        </Banner>
      ) : null}
      <div className="card review-card">
        <ProfileReview key={reviewKey} draft={draft} onChange={setDraft} fromCv={fromCv} />
        <div className="review-foot review-foot--sticky">
          <p>
            <Lock aria-hidden /> {t("onb.deleted")}
          </p>
          <Button
            variant="primary"
            size="lg"
            iconRight={<ArrowRight />}
            loading={saving}
            disabled={invalid}
            onClick={() => void finish()}
          >
            {saving ? t("onb.saving") : t("onb.cta")}
          </Button>
        </div>
      </div>
    </div>
  )
}
