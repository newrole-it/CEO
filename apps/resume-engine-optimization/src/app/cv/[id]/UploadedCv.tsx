"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { invoke } from "@blitzjs/rpc"
import { ArrowLeft, Download, Wand2 } from "lucide-react"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import { useCopy } from "src/app/i18n/Locale"
import createEditableCvDocument from "../mutations/createEditableCvDocument"

/** An uploaded PDF, shown as stored, with the way to make the same CV editable. */
export function UploadedCv({
  id,
  title,
  forAudit = false,
}: {
  id: string
  title: string
  /** Arrived from the "CV audit" link: the audit needs the editable version */
  forAudit?: boolean
}) {
  const { t } = useCopy()
  const toast = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function makeEditable() {
    setBusy(true)
    try {
      const result = await invoke(createEditableCvDocument, { id })
      if (!result) throw new Error("no result")
      if (result.reader === "text") toast.show({ message: t("cv.up.textOnly"), duration: 10_000 })
      // the same CV, now editable: this address renders the editor once refreshed
      router.replace(`/cv/${result.id}${forAudit ? "?audit=1" : "?look=1"}`)
      router.refresh()
    } catch {
      toast.show({ message: t("cv.up.err"), tone: "danger" })
      setBusy(false)
    }
  }

  return (
    <div className="cve">
      <div className="cve-toolbar">
        <Link
          className="cve-toolbar__back"
          href="/cv"
          aria-label={t("cv.ed.back")}
          title={t("cv.ed.back")}
        >
          <ArrowLeft aria-hidden />
        </Link>
        <h1 className="t-h3 cve-toolbar__name">{title}</h1>
        <span className="cve-toolbar__spacer" />
        <ButtonLink href={`/api/cv/${id}/pdf`} size="sm" variant="ghost" icon={<Download />}>
          {t("cv.act.download")}
        </ButtonLink>
        <Button
          size="sm"
          variant="primary"
          icon={<Wand2 />}
          loading={busy}
          onClick={() => void makeEditable()}
        >
          {busy ? t("cv.up.making") : t("cv.up.make")}
        </Button>
      </div>
      <div className="cve-upload">
        <p className="muted">{t(forAudit ? "cv.up.leadAudit" : "cv.up.lead")}</p>
        <iframe
          className="cve-upload__frame"
          src={`/api/cv/${id}/pdf?inline=1`}
          title={t("cv.up.frame", { title })}
        />
      </div>
    </div>
  )
}
