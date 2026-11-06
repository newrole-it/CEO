"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { FileUp } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { Modal, ModalHead, useToast } from "@newrole/ui/interactive"
import type { TailorContext } from "@newrole/cv-core/views"
import { useCvBackend } from "./backend"
import { useCvCopy } from "./locale"
import type { CvLanguage } from "./useCvDocument"

/**
 * "Zapisz jako ogólne" in the toolbar of a CV for an offer: once confirmed, what is on the sheet
 * becomes the newest version of the general CV it was tailored from (versions.toGeneral).
 */
export function SaveToGeneral({
  id,
  general,
  language,
  flush,
}: {
  id: string
  general: NonNullable<TailorContext["general"]>
  language: CvLanguage
  flush: () => Promise<boolean>
}) {
  const { t } = useCvCopy()
  const toast = useToast()
  const router = useRouter()
  const backend = useCvBackend()
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const toGeneral = backend.versions.toGeneral
  if (!toGeneral) return null
  const title = general.title

  async function save() {
    if (!toGeneral) return
    setBusy(true)
    try {
      // the server copies what is stored, so what is on the sheet has to be stored first
      if (!(await flush())) {
        toast.show({ message: t("tl.tg.unsaved"), tone: "danger", duration: 8000 })
        return
      }
      const result = await toGeneral(id)
      setOpen(false)
      toast.show({
        message:
          result.number === null
            ? t("tl.tg.same", { title })
            : t("tl.tg.saved", { title, n: result.number }),
        action: {
          label: t("tl.tg.open"),
          onClick: () => router.push(backend.routes.document(result.cvId)),
        },
        duration: 8000,
      })
    } catch {
      toast.show({ message: t("tl.v.err"), tone: "danger" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant={open ? "soft" : "ghost"}
        icon={<FileUp />}
        title={t("tl.tg.hint", { title })}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {t("tl.tg.button")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <ModalHead id={titleId} title={t("tl.tg.title")} onClose={() => setOpen(false)} />
        <div className="modal__body stack-sm">
          <p className="t-sm">{t("tl.tg.body", { title })}</p>
          <p className="t-sm muted">{t("tl.tg.whole")}</p>
          {general.language === language ? null : (
            <p className="t-sm muted">{t(`tl.tg.lang.${language}`, { title })}</p>
          )}
          <p className="t-sm muted">{t("tl.tg.keep", { title })}</p>
        </div>
        <div className="modal__foot">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="primary" loading={busy} onClick={() => void save()}>
            {t("tl.tg.go")}
          </Button>
        </div>
      </Modal>
    </>
  )
}
