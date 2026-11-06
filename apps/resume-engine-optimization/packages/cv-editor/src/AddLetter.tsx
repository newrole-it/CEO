"use client"

import { useId, useState } from "react"
import { ChevronDown, ClipboardPaste, FileText, Plus, Sparkles } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { Modal, ModalHead, useMenu, useToast } from "@newrole/ui/interactive"
import type { CvCopyKey } from "./copy"
import { useCvCopy } from "./locale"

export type LetterSource = "write" | "text" | "blank"

/** The message for a letter that was not created; the error's message is its code (rethrowCv). */
function letterErrorKey(error: unknown): CvCopyKey {
  const code = error instanceof Error ? error.message : ""
  if (code === "llm-unavailable") return "tl.gl.err.noModel"
  if (code === "no-content") return "tl.gl.err.noContent"
  if (code === "llm-failed") return "tl.err.failed"
  return "cv.err.action"
}

/**
 * "Dodaj list" for a general CV that has none: the model writes it from the CV, the person pastes
 * their own, or it starts blank. `create` makes the letter; `onCreated` opens it.
 */
export function AddLetter({
  create,
  onCreated,
  variant = "ghost",
  align = "right",
}: {
  create: (input: {
    from: LetterSource
    text?: string
  }) => Promise<{ id: string } | null | undefined>
  onCreated: (id: string) => void
  variant?: "ghost" | "soft"
  /** The menu's edge that lines up with the button */
  align?: "left" | "right"
}) {
  const { t } = useCvCopy()
  const toast = useToast()
  const menu = useMenu()
  const textId = useId()
  const titleId = useId()
  const [busy, setBusy] = useState<LetterSource | null>(null)
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState("")

  async function run(from: LetterSource) {
    menu.setOpen(false)
    if (from === "text" && !text.trim()) {
      toast.show({ message: t("tl.gl.err.empty"), tone: "danger" })
      return
    }
    setBusy(from)
    try {
      const letter = await create({ from, text: from === "text" ? text : undefined })
      if (!letter) throw new Error("no result")
      setPasting(false)
      onCreated(letter.id)
    } catch (error) {
      toast.show({ message: t(letterErrorKey(error)), tone: "danger", duration: 8000 })
      setBusy(null)
    }
  }

  const items: { from: LetterSource; icon: React.ReactNode; label: CvCopyKey; hint: CvCopyKey }[] =
    [
      {
        from: "write",
        icon: <Sparkles aria-hidden />,
        label: "tl.gl.write",
        hint: "tl.gl.writeHint",
      },
      {
        from: "text",
        icon: <ClipboardPaste aria-hidden />,
        label: "tl.gl.paste",
        hint: "tl.gl.pasteHint",
      },
      {
        from: "blank",
        icon: <FileText aria-hidden />,
        label: "tl.gl.blank",
        hint: "tl.gl.blankHint",
      },
    ]
  return (
    <div className="cvt-addletter">
      <Button
        size="sm"
        variant={variant}
        icon={<Plus />}
        iconRight={busy ? undefined : <ChevronDown />}
        loading={Boolean(busy) && !pasting}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onClick={() => menu.setOpen((open) => !open)}
      >
        {t(busy === "write" ? "tl.gl.adding" : "tl.gl.add")}
      </Button>
      {menu.open ? (
        <div
          className={`menu cvt-addletter__menu${
            align === "left" ? " cvt-addletter__menu--left" : ""
          }`}
          role="menu"
          ref={menu.ref}
        >
          {items.map((item) => (
            <button
              key={item.from}
              type="button"
              className="menu__item cvt-addletter__item"
              role="menuitem"
              onClick={() => {
                if (item.from !== "text") return void run(item.from)
                menu.setOpen(false)
                setPasting(true)
              }}
            >
              {item.icon}
              <span>
                {t(item.label)}
                <span className="cvt-addletter__hint">{t(item.hint)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <Modal open={pasting} onClose={() => setPasting(false)} labelledBy={titleId}>
        <ModalHead id={titleId} title={t("tl.gl.pasteTitle")} onClose={() => setPasting(false)} />
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void run("text")
          }}
        >
          <div className="modal__body stack-sm">
            <p className="t-sm muted">{t("tl.gl.pasteBody")}</p>
            <label className="t-sm" htmlFor={textId}>
              {t("tl.gl.pasteLabel")}
            </label>
            <textarea
              id={textId}
              className="textarea cvt-addletter__text"
              value={text}
              maxLength={20_000}
              rows={14}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <div className="modal__foot">
            <Button type="button" variant="ghost" onClick={() => setPasting(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={busy === "text"}>
              {t("tl.gl.pasteGo")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
