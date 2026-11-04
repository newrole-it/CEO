"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { FilePlus, FileSearch, FileUp, Save } from "lucide-react"
import type { ApplicantInfo } from "@newrole/profile/applicant"
import type { ProfileAuditView } from "@newrole/profile/linkedin-audit"
import type { ProfileDraft } from "@newrole/profile/schema"
import { ApplicantForm } from "@newrole/profile-ui/ApplicantForm"
import { LinkedInImport } from "@newrole/profile-ui/LinkedInImport"
import { PasteTile } from "@newrole/profile-ui/PasteTile"
import {
  cleanDraft,
  fieldsFrom,
  ProfileReview,
  type DraftField,
} from "@newrole/profile-ui/ProfileReview"
import { Button } from "@newrole/ui/Button"
import { Dropzone, useToast } from "@newrole/ui/interactive"
import { Badge, Banner } from "@newrole/ui/primitives"
import { api, ApiError } from "@/client/api"
import { cvBrowserImport, importProfile, saveApplicant } from "@/client/profile"
import { useCopy } from "@/i18n/useCopy"

/**
 * /profile: import a CV or LinkedIn, review what was read, save it; then a CV from it, the form
 * details and the profile audit. The screens are @newrole/profile-ui's, as in newrole.it.
 */
export function ProfileScreen({
  initial,
  hasDocument,
  details,
  audit: initialAudit,
  browserImport,
}: {
  initial: ProfileDraft | null
  hasDocument: boolean
  details: { saved: ApplicantInfo; effective: ApplicantInfo }
  audit: ProfileAuditView | null
  browserImport: boolean
}) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const router = useRouter()
  const [draft, setDraft] = useState<ProfileDraft | null>(initial)
  const [fromCv, setFromCv] = useState<Set<DraftField>>(() => new Set())
  const [importing, setImporting] = useState(!initial)
  const [reading, setReading] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [saving, setSaving] = useState(false)
  const [making, setMaking] = useState(false)
  const [imported, setImported] = useState(hasDocument)

  const fail = (error: unknown) => {
    const reason = error instanceof ApiError && error.reason ? error.reason : t("tl.err.failed")
    toast.show({ message: t("app.profile.failed", { reason }), tone: "danger" })
  }

  function review(next: ProfileDraft) {
    setDraft(next)
    setFromCv(fieldsFrom(next))
    setImporting(false)
    setImported(true)
  }

  async function read(input: { file?: File; text?: string }) {
    setReading(true)
    try {
      review(await importProfile(input))
      setPasteOpen(false)
      setPasteText("")
    } catch (error) {
      fail(error)
    } finally {
      setReading(false)
    }
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      await api("PUT", "/api/profile", cleanDraft(draft))
      setFromCv(new Set())
      toast.show({ message: t("app.profile.saved") })
      router.refresh()
    } catch (error) {
      fail(error)
    } finally {
      setSaving(false)
    }
  }

  async function makeCv() {
    setMaking(true)
    try {
      if (draft) await api("PUT", "/api/profile", cleanDraft(draft))
      const { id } = await api<{ id: string }>("POST", "/api/documents", {
        from: "profile",
        language: locale,
      })
      router.push(`/cv/${id}`)
    } catch (error) {
      fail(error)
      setMaking(false)
    }
  }

  return (
    <div className="stack-lg">
      {importing || !draft ? (
        <section className="card card--pad stack" aria-labelledby="import-title">
          <div className="row row--between">
            <h2 className="t-h2" id="import-title">
              {t("app.profile.import")}
            </h2>
            {draft ? (
              <Button variant="ghost" size="sm" onClick={() => setImporting(false)}>
                {t("common.cancel")}
              </Button>
            ) : null}
          </div>
          {reading ? (
            <p className="t-sm muted" role="status" aria-live="polite">
              <span className="stage__spin" aria-hidden /> {t("app.profile.reading")}
            </p>
          ) : null}
          <Dropzone onFile={(file) => void read({ file })} className="dropzone dropzone--compact">
            {(open) => (
              <div className="stack-sm">
                <div>
                  <Button variant="primary" icon={<FileUp />} onClick={open} disabled={reading}>
                    {t("app.profile.pdf")}
                  </Button>
                </div>
                <p className="t-sm muted">{t("app.profile.pdfHint")}</p>
              </div>
            )}
          </Dropzone>
          <PasteTile
            open={pasteOpen}
            setOpen={setPasteOpen}
            text={pasteText}
            setText={setPasteText}
            onRead={() => void read({ text: pasteText })}
          />
          <LinkedInImport
            browser={browserImport ? cvBrowserImport : null}
            onDraft={review}
            onFile={(file) => void read({ file })}
          />
        </section>
      ) : (
        <section className="card card--pad stack" aria-labelledby="review-title">
          <div className="row row--between">
            <h2 className="t-h2" id="review-title">
              {fromCv.size ? t("app.profile.review") : t("app.profile.title")}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setImporting(true)}>
              {t("app.profile.importAgain")}
            </Button>
          </div>
          {fromCv.size ? <p className="t-sm muted">{t("app.profile.reviewLead")}</p> : null}
          <ProfileReview draft={draft} onChange={setDraft} fromCv={fromCv} />
          <div className="cva-actions">
            <Button variant="primary" icon={<Save />} loading={saving} onClick={() => void save()}>
              {t("app.profile.save")}
            </Button>
            <Button
              variant="ghost"
              icon={<FilePlus />}
              loading={making}
              onClick={() => void makeCv()}
            >
              {t("app.profile.fromProfile")}
            </Button>
          </div>
        </section>
      )}

      <section className="stack" aria-labelledby="details-title">
        <div>
          <h2 className="t-h2" id="details-title">
            {t("app.profile.details")}
          </h2>
          <p className="t-sm muted">{t("app.profile.detailsLead")}</p>
        </div>
        <ApplicantForm saved={details.saved} effective={details.effective} onSave={saveApplicant} />
      </section>

      <ProfileAudit initial={initialAudit} available={imported} />
    </div>
  )
}

function ProfileAudit({
  initial,
  available,
}: {
  initial: ProfileAuditView | null
  available: boolean
}) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const [audit, setAudit] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      setAudit(await api<ProfileAuditView>("POST", "/api/profile/audit", { locale }))
    } catch (failure) {
      const reason =
        failure instanceof ApiError && failure.reason ? failure.reason : t("tl.err.failed")
      toast.show({ message: t("app.profile.failed", { reason }), tone: "danger" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card card--pad stack" aria-labelledby="audit-title">
      <div className="row row--between">
        <h2 className="t-h2" id="audit-title">
          {t("app.profile.audit")}
        </h2>
        {audit ? (
          <Badge tone="primary">{t("app.profile.score", { score: audit.score })}</Badge>
        ) : null}
      </div>
      <p className="t-sm muted">{t("app.profile.auditLead")}</p>
      {audit ? (
        <div className="stack">
          {audit.progress ? <p className="t-sm">{audit.progress}</p> : null}
          <p>{audit.summary}</p>
          <ul className="cva-notes">
            {audit.notes.slice(0, 12).map((note) => (
              <li key={note.id} className="cva-note">
                <span className="t-caption muted">
                  {note.label} · {note.section}
                </span>
                {note.quote ? <q className="cva-note__quote">{note.quote}</q> : null}
                <span>{note.why}</span>
                {note.rewrite ? (
                  <span className="t-sm">
                    <strong>{t("app.profile.rewrite")}:</strong> {note.rewrite}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {available ? (
        <div>
          <Button variant="outline" icon={<FileSearch />} loading={busy} onClick={() => void run()}>
            {audit ? t("app.profile.auditAgain") : t("app.profile.auditRun")}
          </Button>
        </div>
      ) : (
        <Banner tone="info">{t("app.profile.auditNeedsImport")}</Banner>
      )}
    </section>
  )
}
