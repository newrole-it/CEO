"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { invoke, useMutation } from "@blitzjs/rpc"
import { ArrowRight, CircleAlert, FileUp, Info, Trash2 } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Dropzone, Modal, ModalHead, isPdf, useToast } from "@newrole/ui/interactive"
import { Banner, EmptyState } from "@newrole/ui/primitives"
import clearFeedback from "src/app/feedback/mutations/clearFeedback"
import listMyFeedback from "src/app/feedback/queries/listMyFeedback"
import { TasteChip } from "src/app/jobs/components/Taste"
import type { PreferenceSummary } from "src/server/preferences/model"
import { FEEDBACK_ASPECTS } from "src/shared/feedback-aspects"
import { emptyProfileDraft, type ProfileDraft } from "@newrole/profile/schema"
import ensureGuest from "./mutations/ensureGuest"
import saveProfile from "./mutations/saveProfile"
import {
  ProfileReview,
  cleanDraft,
  fieldsFrom,
  salaryError,
  type DraftField,
} from "./ProfileReview"

export function ProfileEditor({
  initial,
  guest,
  summary,
}: {
  initial: ProfileDraft | null
  guest: boolean
  summary: PreferenceSummary | null
}) {
  const { t } = useCopy()
  const router = useRouter()
  const toast = useToast()
  const [save, { isPending }] = useMutation(saveProfile)
  const [ensureSession] = useMutation(ensureGuest)
  const [draft, setDraft] = useState<ProfileDraft>(initial ?? emptyProfileDraft())
  const [fromCv, setFromCv] = useState<Set<DraftField>>(new Set())
  const [key, setKey] = useState(0)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  async function reimport(file: File) {
    if (!isPdf(file)) return setImportError(t("err.notPdf"))
    if (file.size > 8_000_000) return setImportError(t("err.pdfSize"))
    setImporting(true)
    setImportError(null)
    try {
      const body = new FormData()
      body.set("file", file)
      await ensureSession(null)
      const response = await fetch("/api/profile/import", { method: "POST", body })
      const payload = (await response.json()) as { draft?: ProfileDraft; error?: string }
      if (!response.ok || !payload.draft) {
        setImportError(t("err.read"))
        return
      }
      setDraft({ ...payload.draft, industryMode: draft.industryMode })
      setFromCv(fieldsFrom(payload.draft))
      setKey((value) => value + 1)
      setDirty(true)
    } catch {
      setImportError(t("err.read"))
    } finally {
      setImporting(false)
    }
  }

  async function onSave() {
    if (salaryError(draft)) return
    try {
      await save(cleanDraft(draft))
      setDirty(false)
      toast.show({ message: t("pr.saved") })
      router.refresh()
    } catch {
      toast.show({ message: t("err.saveProfile"), tone: "danger" })
    }
  }

  async function clearAll() {
    setClearing(true)
    try {
      const rows = await invoke(listMyFeedback, { limit: 500 })
      for (const row of rows) await invoke(clearFeedback, { jobId: row.jobId })
      setConfirmClear(false)
      router.refresh()
    } catch {
      toast.show({ message: t("err.save"), tone: "danger" })
    } finally {
      setClearing(false)
    }
  }

  const items = summary
    ? [...summary.likes, ...summary.dislikes].filter((item) => !summary.muted.includes(item.key))
    : []

  return (
    <div className="stack-lg has-sticky-foot">
      {guest ? (
        <Banner tone="info" icon={<Info aria-hidden />}>
          <p>{t("pr.guest")}</p>
          <div>
            <ButtonLink href="/login?returnTo=/profile" variant="secondary" size="sm">
              {t("pr.guestCta")}
            </ButtonLink>
          </div>
        </Banner>
      ) : null}

      {!initial && !dirty ? (
        <EmptyState icon={<FileUp />} title={t("pr.empty")} body={t("empty.noProfile.b")}>
          <ButtonLink href="/start" variant="primary" iconRight={<ArrowRight />}>
            {t("empty.noProfile.cta")}
          </ButtonLink>
        </EmptyState>
      ) : (
        <section aria-label={t("pr.title")} className="stack">
          <Dropzone
            onFile={(file) => void reimport(file)}
            className="card card--pad row row--between"
            overClassName="tile--primary"
          >
            {(open) => (
              <>
                <span className="row muted t-sm">
                  <FileUp width={18} height={18} aria-hidden /> {t("hero.drop")}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<FileUp />}
                  loading={importing}
                  onClick={open}
                >
                  {t("pr.reimport")}
                </Button>
              </>
            )}
          </Dropzone>
          {importError ? (
            <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden />}>
              <p>{importError}</p>
            </Banner>
          ) : null}
          <div className="card review-card">
            <ProfileReview
              key={key}
              draft={draft}
              onChange={(next) => {
                setDraft(next)
                setDirty(true)
              }}
              fromCv={fromCv}
            />
            <div className="review-foot review-foot--sticky">
              <p />
              <Button
                variant="primary"
                loading={isPending}
                disabled={salaryError(draft) || !dirty}
                onClick={() => void onSave()}
              >
                {t("pr.save")}
              </Button>
            </div>
          </div>
        </section>
      )}

      <section id="taste" className="stack" aria-labelledby="taste-full">
        <div className="row row--between">
          <h2 id="taste-full" className="t-h2">
            {t("pr.taste")}
          </h2>
          {summary && (summary.liked || summary.disliked) ? (
            <span className="t-sm muted">
              {t("taste.basis", { likes: summary.liked, passes: summary.disliked })}
            </span>
          ) : null}
        </div>
        {!items.length ? (
          <p className="muted">{t("taste.empty")}</p>
        ) : (
          <div className="card card--pad taste-groups">
            {FEEDBACK_ASPECTS.map((aspect) => {
              const group = items.filter((item) => item.aspect === aspect)
              if (!group.length) return null
              return (
                <div key={aspect} className="taste-group">
                  <h3>{t(`aspect.${aspect}` as CopyKey)}</h3>
                  <div className="chips chips--sm">
                    {group.map((item) => (
                      <TasteChip key={item.key} item={item} onRemoved={() => router.refresh()} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="t-sm muted">{t("taste.howBody")}</p>
        {summary && (summary.liked || summary.disliked) ? (
          <div>
            <Button
              variant="danger-ghost"
              size="sm"
              icon={<Trash2 />}
              onClick={() => setConfirmClear(true)}
            >
              {t("taste.clearAll")}
            </Button>
          </div>
        ) : null}
        <Modal open={confirmClear} onClose={() => setConfirmClear(false)} labelledBy="clear-title">
          <ModalHead
            title={t("taste.clearAll")}
            id="clear-title"
            onClose={() => setConfirmClear(false)}
          />
          <div className="modal__body">
            <p className="muted">{t("taste.clearConfirm")}</p>
          </div>
          <div className="modal__foot">
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" loading={clearing} onClick={() => void clearAll()}>
              {t("taste.clearAll")}
            </Button>
          </div>
        </Modal>
      </section>
      <p className="t-sm">
        <Link className="link" href="/jobs">
          {t("od.back")}
        </Link>
      </p>
    </div>
  )
}
