"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useMutation } from "src/app/rpc-hooks"
import { ArrowRight, CircleAlert, FileUp, Info } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Dropzone, isPdf, useToast } from "@newrole/ui/interactive"
import { Banner, EmptyState } from "@newrole/ui/primitives"
import { emptyProfileDraft, type ProfileDraft } from "@newrole/profile/schema"
import ensureGuest from "./mutations/ensureGuest"
import saveProfile from "./mutations/saveProfile"
import {
  ProfileReview,
  cleanDraft,
  fieldsFrom,
  salaryError,
  type DraftField,
} from "@newrole/profile-ui/ProfileReview"

export function ProfileEditor({
  initial,
  guest,
}: {
  initial: ProfileDraft | null
  guest: boolean
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

      <p className="t-sm">
        <Link className="link" href="/cv">
          {t("pr.toCv")}
        </Link>
      </p>
    </div>
  )
}
