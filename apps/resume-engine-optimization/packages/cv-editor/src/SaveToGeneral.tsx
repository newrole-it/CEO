"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { FileUp } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { Modal, ModalHead, useToast } from "@newrole/ui/interactive"
import { Field } from "@newrole/ui/primitives"
import type { TailorContext } from "@newrole/cv-core/views"
import { useCvBackend } from "./backend"
import { useCvCopy } from "./locale"
import type { CvLanguage } from "./useCvDocument"

/** What a select picks when the CV saves as a general CV of its own */
const NEW = "new"

/**
 * "Zapisz jako ogólne" in the toolbar of a CV for an offer: once confirmed, what is on the sheet
 * becomes the newest version of the general CV it was tailored from (versions.toGeneral). When
 * that CV is gone, the person picks another general CV, or makes this one a general CV of its own.
 */
export function SaveToGeneral({
  id,
  general,
  choices,
  language,
  flush,
}: {
  id: string
  general: TailorContext["general"]
  choices: TailorContext["choices"]
  language: CvLanguage
  flush: () => Promise<boolean>
}) {
  const { t } = useCvCopy()
  const toast = useToast()
  const router = useRouter()
  const backend = useCvBackend()
  const titleId = useId()
  const pickId = useId()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [into, setInto] = useState(choices[0]?.id ?? NEW)
  const toGeneral = backend.versions.toGeneral
  if (!toGeneral) return null
  /** The general CV it goes into; null for a new one */
  const target = general ?? choices.find((choice) => choice.id === into) ?? null
  const title = target?.title ?? ""

  async function save() {
    if (!toGeneral) return
    setBusy(true)
    try {
      // the server copies what is stored, so what is on the sheet has to be stored first
      if (!(await flush())) {
        toast.show({ message: t("tl.tg.unsaved"), tone: "danger", duration: 8000 })
        return
      }
      const result = await toGeneral(id, general ? undefined : into)
      setOpen(false)
      toast.show({
        message: result.created
          ? t("tl.tg.created", { title: result.title })
          : result.number === null
          ? t("tl.tg.same", { title: result.title })
          : t("tl.tg.saved", { title: result.title, n: result.number }),
        action: {
          label: t("tl.tg.open"),
          onClick: () => router.push(backend.routes.document(result.cvId)),
        },
        duration: 8000,
      })
      // the next save goes to the CV this one is now linked to
      if (!general) router.refresh()
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
        title={general ? t("tl.tg.hint", { title }) : t("tl.tg.hintPick")}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {t("tl.tg.button")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <ModalHead id={titleId} title={t("tl.tg.title")} onClose={() => setOpen(false)} />
        <div className="modal__body stack-sm">
          {general ? null : (
            <>
              <p className="t-sm muted">{t("tl.tg.gone")}</p>
              <Field label={t("tl.tg.pick")} htmlFor={pickId}>
                <select
                  id={pickId}
                  className="select"
                  value={into}
                  onChange={(event) => setInto(event.target.value)}
                >
                  {choices.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.title}
                    </option>
                  ))}
                  <option value={NEW}>{t("tl.tg.new")}</option>
                </select>
              </Field>
            </>
          )}
          {target ? (
            <>
              <p className="t-sm">{t("tl.tg.body", { title })}</p>
              <p className="t-sm muted">{t("tl.tg.whole")}</p>
              {target.language === language ? null : (
                <p className="t-sm muted">{t(`tl.tg.lang.${language}`, { title })}</p>
              )}
              <p className="t-sm muted">{t("tl.tg.keep", { title })}</p>
            </>
          ) : (
            <p className="t-sm">{t("tl.tg.newBody")}</p>
          )}
        </div>
        <div className="modal__foot">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="primary" loading={busy} onClick={() => void save()}>
            {t(target ? "tl.tg.go" : "tl.tg.goNew")}
          </Button>
        </div>
      </Modal>
    </>
  )
}
