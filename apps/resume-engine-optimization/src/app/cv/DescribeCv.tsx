"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { invoke } from "@blitzjs/rpc"
import { Button } from "@newrole/ui/Button"
import { Modal, ModalHead, useToast } from "@newrole/ui/interactive"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import createCvFromDescription from "./mutations/createCvFromDescription"

const MIN_CHARS = 20

/** The message for a CV that was not written; the error's message is its code (rethrowCv). */
function errorKey(error: unknown): CopyKey {
  const code = error instanceof Error ? error.message : ""
  if (code === "limited") return "cv.desc.err.limited"
  if (code === "no-content") return "cv.desc.err.short"
  return "cv.desc.err.failed"
}

/**
 * "Opisz swoje doświadczenie": for a person without a CV. They describe their work in their own
 * words, the model writes a new CV from it, and the editor opens with the look panel. The text
 * stays while the dialog is closed, so closing it loses nothing.
 */
export function DescribeCv({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useCopy()
  const toast = useToast()
  const router = useRouter()
  const titleId = useId()
  const textId = useId()
  const tipsId = useId()
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const ready = text.trim().length >= MIN_CHARS

  async function write() {
    if (!ready || busy) return
    setBusy(true)
    try {
      const cv = await invoke(createCvFromDescription, { text })
      if (!cv) throw new Error("no result")
      if (cv.reader === "text") toast.show({ message: t("cv.desc.textOnly"), duration: 10_000 })
      router.push(`/cv/${cv.id}?look=1`)
    } catch (error) {
      toast.show({ message: t(errorKey(error)), tone: "danger", duration: 8000 })
      setBusy(false)
    }
  }

  // the model is writing: the dialog stays until the editor opens
  const close = () => {
    if (!busy) onClose()
  }

  return (
    <Modal open={open} onClose={close} labelledBy={titleId} className="modal--wide">
      <ModalHead id={titleId} title={t("cv.desc.title")} onClose={close} />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void write()
        }}
      >
        <div className="modal__body stack-sm">
          <p className="t-sm">{t("cv.desc.lead")}</p>
          <label className="t-sm" htmlFor={textId}>
            {t("cv.desc.label")}
          </label>
          <textarea
            id={textId}
            className="textarea cvl-describe__text"
            value={text}
            placeholder={t("cv.desc.ph")}
            maxLength={20_000}
            rows={12}
            aria-describedby={tipsId}
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
          />
          <p className="t-sm muted" id={tipsId}>
            {t("cv.desc.tips")}
          </p>
          <p className="t-caption muted">{t("cv.desc.facts")}</p>
        </div>
        <div className="modal__foot">
          {busy ? (
            <span className="t-sm muted cvl-describe__status" role="status">
              {t("cv.desc.writing")}
            </span>
          ) : ready ? null : (
            <span className="field__hint cvl-describe__status">{t("cv.desc.short")}</span>
          )}
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
            {t("cv.desc.go")}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
