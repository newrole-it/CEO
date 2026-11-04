"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useRef, useState } from "react"
import {
  ExternalLink,
  FilePlus,
  FileText,
  FileUp,
  Link2,
  Mail,
  Trash2,
  UserRound,
} from "lucide-react"
import type { CvLocale } from "@newrole/cv-core/blank"
import { importCvHtml } from "@newrole/cv-core/import-html"
import { TailorStart } from "@newrole/cv-editor/TailorStart"
import { Button } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import { Field } from "@newrole/ui/primitives"
import { relativeTime } from "@newrole/ui/time"
import { api, ApiError } from "@/client/api"
import { cvAppBackend } from "@/client/backend"
import { useCopy } from "@/i18n/useCopy"

export type HomeDocument = {
  id: string
  title: string
  docType: "CV" | "LETTER"
  tailored: boolean
  updatedAt: string
}

type Offer = {
  id: string
  url: string | null
  company: string
  title: string
  location: string | null
  withheld: boolean
  language: CvLocale
}

/** The one page besides the editor: the offer, the person's CVs, and what was written. */
export function Home({
  documents,
  hasProfile,
}: {
  documents: HomeDocument[]
  hasProfile: boolean
}) {
  const { t } = useCopy()
  const [offer, setOffer] = useState<Offer | null>(null)
  const general = documents.filter((doc) => doc.docType === "CV" && !doc.tailored)
  return (
    <div className="cva-grid">
      <section className="card card--pad stack" aria-labelledby="offer-title">
        <h2 className="t-h2" id="offer-title">
          {t("app.offer.title")}
        </h2>
        {offer ? (
          <>
            <div className="cva-offer stack-sm">
              <p>
                <strong>{offer.title}</strong> · {offer.company}
                {offer.location ? <span className="muted"> · {offer.location}</span> : null}
              </p>
              <div className="cva-actions">
                {offer.url ? (
                  <a
                    className="link t-sm"
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink aria-hidden size={14} /> {new URL(offer.url).hostname}
                  </a>
                ) : null}
                <button type="button" className="link t-sm" onClick={() => setOffer(null)}>
                  {t("app.offer.change")}
                </button>
              </div>
              {offer.url ? <p className="t-caption muted">{t("app.offer.stored")}</p> : null}
            </div>
            {general.length ? (
              <TailorStart
                backend={cvAppBackend}
                job={{
                  id: offer.id,
                  company: offer.company,
                  title: offer.title,
                  language: offer.language,
                  withheld: offer.withheld,
                }}
                cvs={general.map((doc, index) => ({
                  id: doc.id,
                  title: doc.title,
                  isDefault: index === 0,
                }))}
                hasLetter={false}
              />
            ) : (
              <div className="banner">
                <p>
                  <strong>{t("tl.start.noCv")}</strong>
                </p>
                <p>{t("app.add.lead")}</p>
              </div>
            )}
          </>
        ) : (
          <OfferForm onOffer={setOffer} />
        )}
      </section>

      <div className="stack">
        <AddCv hasProfile={hasProfile} />
        <Documents documents={documents} />
      </div>
    </div>
  )
}

function OfferForm({ onOffer }: { onOffer: (offer: Offer) => void }) {
  const { t } = useCopy()
  const linkId = useId()
  const companyId = useId()
  const roleId = useId()
  const placeId = useId()
  const [mode, setMode] = useState<"link" | "hand">("link")
  const [url, setUrl] = useState("")
  const [company, setCompany] = useState("")
  const [role, setRole] = useState("")
  const [place, setPlace] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const body =
        mode === "link"
          ? { url: url.trim() }
          : { company, title: role, location: place.trim() || undefined }
      onOffer(await api<Offer>("POST", "/api/offers", body))
    } catch (failure) {
      const reason = failure instanceof ApiError ? failure.reason : ""
      if (failure instanceof ApiError && failure.message === "link-only") {
        setMode("hand")
        setError(t("app.offer.linkOnly", { reason }))
      } else {
        setError(t("app.offer.failed", { reason: reason || t("tl.err.failed") }))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <p>{t("app.tagline")}</p>
      {mode === "link" ? (
        <Field label={t("app.offer.link")} htmlFor={linkId} hint={t("app.offer.linkHint")}>
          <input
            id={linkId}
            className="input"
            type="url"
            required
            inputMode="url"
            placeholder="https://"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </Field>
      ) : (
        <>
          <Field label={t("app.offer.company")} htmlFor={companyId}>
            <input
              id={companyId}
              className="input"
              required
              maxLength={160}
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
          </Field>
          <Field label={t("app.offer.role")} htmlFor={roleId}>
            <input
              id={roleId}
              className="input"
              required
              maxLength={200}
              value={role}
              onChange={(event) => setRole(event.target.value)}
            />
          </Field>
          <Field label={t("app.offer.location")} htmlFor={placeId}>
            <input
              id={placeId}
              className="input"
              maxLength={200}
              value={place}
              onChange={(event) => setPlace(event.target.value)}
            />
          </Field>
        </>
      )}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="cva-actions">
        <Button type="submit" variant="primary" icon={<Link2 />} loading={busy}>
          {busy && mode === "link"
            ? t("app.offer.reading")
            : mode === "link"
            ? t("app.offer.read")
            : t("app.offer.add")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setError(null)
            setMode(mode === "link" ? "hand" : "link")
          }}
        >
          {mode === "link" ? t("app.offer.byHand") : t("app.offer.byLink")}
        </Button>
      </div>
    </form>
  )
}

function AddCv({ hasProfile }: { hasProfile: boolean }) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const router = useRouter()
  const pdfInput = useRef<HTMLInputElement>(null)
  const htmlInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<"pdf" | "html" | "blank" | "profile" | null>(null)

  async function run(
    kind: "pdf" | "html" | "blank" | "profile",
    work: () => Promise<{ id: string }>
  ) {
    setBusy(kind)
    try {
      const { id } = await work()
      router.push(`/cv/${id}`)
    } catch (failure) {
      const reason = failure instanceof ApiError ? failure.reason : t("cv.err.html")
      toast.show({ message: t("app.add.failed", { reason }), tone: "danger" })
      setBusy(null)
    }
  }

  return (
    <section className="card card--pad stack-sm" aria-labelledby="add-title">
      <h2 className="t-h2" id="add-title">
        {t("app.add.title")}
      </h2>
      <p className="t-sm muted">{t("app.add.lead")}</p>
      <div className="cva-actions">
        <Button
          variant="primary"
          size="sm"
          icon={<FileUp />}
          loading={busy === "pdf"}
          onClick={() => pdfInput.current?.click()}
        >
          {busy === "pdf" ? t("app.add.reading") : t("cv.new.pdf")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<FileText />}
          loading={busy === "html"}
          onClick={() => htmlInput.current?.click()}
        >
          {t("cv.new.html")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<FilePlus />}
          loading={busy === "blank"}
          onClick={() =>
            void run("blank", () =>
              api("POST", "/api/documents", { from: "blank", language: locale })
            )
          }
        >
          {t("cv.new.blank")}
        </Button>
        {hasProfile ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<UserRound />}
            loading={busy === "profile"}
            onClick={() =>
              void run("profile", () =>
                api("POST", "/api/documents", { from: "profile", language: locale })
              )
            }
          >
            {t("cv.new.profile")}
          </Button>
        ) : (
          <Link className="link t-sm" href="/profile">
            {t("app.nav.profile")}
          </Link>
        )}
      </div>
      <input
        ref={pdfInput}
        type="file"
        accept="application/pdf"
        className="dz-input"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) return
          const form = new FormData()
          form.set("file", file)
          void run("pdf", () => api("POST", "/api/documents/upload", form))
        }}
      />
      <input
        ref={htmlInput}
        type="file"
        accept="text/html,.html,.htm"
        className="dz-input"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) return
          void run("html", async () => {
            const doc = new DOMParser().parseFromString(await file.text(), "text/html")
            const { content, language, title } = importCvHtml(doc)
            return api("POST", "/api/documents", { from: "content", content, language, title })
          })
        }}
      />
    </section>
  )
}

function Documents({ documents }: { documents: HomeDocument[] }) {
  const { t } = useCopy()
  const toast = useToast()
  const router = useRouter()
  if (!documents.length) return null

  async function remove(doc: HomeDocument) {
    if (!window.confirm(t("app.docs.deleteConfirm", { title: doc.title }))) return
    try {
      await api("DELETE", `/api/documents/${encodeURIComponent(doc.id)}`)
      router.refresh()
    } catch {
      toast.show({ message: t("cv.err.action"), tone: "danger" })
    }
  }

  return (
    <section className="card card--pad stack-sm" aria-labelledby="docs-title">
      <h2 className="t-h2" id="docs-title">
        {t("app.docs.title")}
      </h2>
      <ul className="cva-docs">
        {documents.map((doc) => (
          <li key={doc.id} className="cva-doc">
            <div className="cva-doc__main">
              <Link className="cva-doc__title link" href={`/cv/${doc.id}`}>
                {doc.docType === "LETTER" ? <Mail aria-hidden size={14} /> : null} {doc.title}
              </Link>
              <span className="t-caption muted">
                {doc.docType === "LETTER"
                  ? t("app.docs.letter")
                  : doc.tailored
                  ? t("app.docs.tailored")
                  : t("app.docs.general")}
                {" · "}
                {t("cv.updated", { when: relativeTime(doc.updatedAt, t) ?? "" })}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon={<Trash2 />}
              aria-label={`${t("cv.act.delete")}: ${doc.title}`}
              title={t("cv.act.delete")}
              onClick={() => void remove(doc)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
