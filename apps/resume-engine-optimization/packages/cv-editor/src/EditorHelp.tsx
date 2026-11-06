"use client"

import Link from "next/link"
import { Fragment, useEffect, useState, type ReactNode } from "react"
import {
  FileCheck,
  ImagePlus,
  Keyboard,
  Link2,
  ListTree,
  MousePointerClick,
  Move,
  PanelTop,
  Sparkles,
} from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { Modal, ModalHead } from "@newrole/ui/interactive"
import { Kbd } from "@newrole/ui/primitives"
import type { CvCopyKey } from "./copy"
import { useCvBackend } from "./backend"
import { useCvCopy } from "./locale"

/** Set once "How to edit" was closed, so it opens by itself only on the first visit. */
const SEEN_KEY = "nr-cv-help-seen"

function seen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1"
  } catch {
    return false
  }
}

/** Open on the first visit to the editor in this browser; after that, from the toolbar. */
export function useEditorHelp() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!seen()) setOpen(true)
  }, [])
  function close() {
    try {
      window.localStorage.setItem(SEEN_KEY, "1")
    } catch {
      // Without storage the help opens again on the next visit. That is all.
    }
    setOpen(false)
  }
  return { open, show: () => setOpen(true), close }
}

/** ⌘ on Apple keyboards, Ctrl elsewhere: the editor's shortcuts take either (CvEditor.tsx). */
function useModifier(): string {
  const [mod, setMod] = useState("Ctrl")
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setMod("⌘")
  }, [])
  return mod
}

type Tip = {
  id: string
  icon: ReactNode
  cv: boolean
  letter: boolean
  tailored?: boolean
  /** Only where the app offers "Popraw z AI" (CvEditorBackend.improve) */
  ai?: boolean
}

const TIPS: Tip[] = [
  { id: "type", icon: <MousePointerClick />, cv: true, letter: true },
  { id: "photo", icon: <ImagePlus />, cv: true, letter: false },
  { id: "blocks", icon: <Move />, cv: true, letter: false },
  { id: "ai", icon: <Sparkles />, cv: true, letter: false, ai: true },
  { id: "links", icon: <Link2 />, cv: true, letter: false },
  { id: "outline", icon: <ListTree />, cv: true, letter: false },
  { id: "keys", icon: <Keyboard />, cv: true, letter: true },
  { id: "bar", icon: <PanelTop />, cv: true, letter: false },
  { id: "tailor", icon: <FileCheck />, cv: true, letter: true, tailored: true },
]

/** "{paste}" and friends become keyboard keys inside the sentence. */
function withKeys(text: string, keys: Record<string, string>): ReactNode {
  return text.split(/(\{\w+\})/).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1]
    if (name && keys[name]) return <Kbd key={index}>{keys[name]}</Kbd>
    return <Fragment key={index}>{part}</Fragment>
  })
}

/**
 * "How to edit": the editor's features that are not obvious from the sheet, such as pasting a
 * photo, the buttons that appear on hover and the shortcuts. `guide` links to the page with every
 * feature (CvEditorBackend.routes.guide).
 */
export function EditorHelp({
  open,
  onClose,
  isLetter,
  tailored,
  guide,
}: {
  open: boolean
  onClose: () => void
  isLetter: boolean
  tailored: boolean
  guide?: string
}) {
  const { t } = useCvCopy()
  const backend = useCvBackend()
  const mod = useModifier()
  const keys = {
    paste: `${mod}V`,
    link: `${mod}K`,
    bold: `${mod}B`,
    italic: `${mod}I`,
    undo: `${mod}Z`,
    redo: `${mod}⇧Z`,
  }
  const tips = TIPS.filter(
    (tip) =>
      (isLetter ? tip.letter : tip.cv) &&
      (!tip.tailored || tailored) &&
      (!tip.ai || Boolean(backend.improve))
  )
  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="cve-help-title"
      className="modal--wide cve-help"
    >
      <ModalHead
        title={t(isLetter ? "cv.help.titleLetter" : "cv.help.title")}
        id="cve-help-title"
        onClose={onClose}
      />
      <div className="modal__body">
        <p className="muted t-sm">{t("cv.help.sub")}</p>
        <ul className="cve-help__list">
          {tips.map((tip) => (
            <li key={tip.id} className="cve-help__tip">
              <span className="cve-help__icon" aria-hidden>
                {tip.icon}
              </span>
              <div>
                <h3 className="cve-help__title">{t(`cv.help.${tip.id}.t` as CvCopyKey)}</h3>
                <p className="t-sm">{withKeys(t(`cv.help.${tip.id}.b` as CvCopyKey), keys)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="modal__foot">
        {guide ? (
          <Link className="link t-sm cve-help__all" href={guide} target="_blank">
            {t("cv.help.all")}
          </Link>
        ) : null}
        <Button variant="primary" onClick={onClose}>
          {t("cv.help.ok")}
        </Button>
      </div>
    </Modal>
  )
}
