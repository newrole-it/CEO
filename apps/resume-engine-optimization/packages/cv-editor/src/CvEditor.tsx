"use client"

import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Bold,
  CircleQuestionMark,
  CircleAlert,
  Download,
  FileSearch,
  History,
  Italic,
  Link2,
  Printer,
  Redo2,
  RotateCcw,
  Undo2,
} from "lucide-react"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import type { CvAudit } from "@newrole/cv-core/audit"
import { newSection } from "@newrole/cv-core/blank"
import { insertSection, removeSection, updateHeader } from "@newrole/cv-core/edit"
import { atomKey, cvFlow, footerText } from "@newrole/cv-core/flow"
import { normalizeHref } from "@newrole/cv-core/sanitize"
import type { CvContent, CvSection } from "@newrole/cv-core/schema"
import { CV_CSS, MM, PAGE_MM } from "@newrole/cv-core/styles"
import { readOnlyExcerpt } from "@newrole/cv-core/tailor"
import type { TailorContext } from "@newrole/cv-core/views"
import { AtomContent, type EditorOps } from "./atoms"
import { CvEditorBackendProvider, useCvBackend, type CvEditorBackend } from "./backend"
import { downloadPdf } from "./download"
import { AuditBar, AuditRail } from "./AuditPanel"
import { DocumentPanel, type PanelTab } from "./DocumentPanel"
import { placeCaret } from "./Editable"
import { EditorHelp, useEditorHelp } from "./EditorHelp"
import { LinksPopover } from "./LinksPopover"
import { useCvCopy } from "./locale"
import { Outline } from "./Outline"
import { photoToDataUrl } from "./photo"
import { TailorBar } from "./TailorBar"
import { sheetsHeight, sheetTop, usePagination } from "./usePagination"
import { useCvAudit } from "./useCvAudit"
import { useCvDocument, type CvLanguage, type SaveState } from "./useCvDocument"

type LinkBox = {
  top: number
  left: number
  url: string
  error: boolean
  hasAnchor: boolean
}

const PAGE_WIDTH = PAGE_MM.width * MM
const CANVAS_PADDING = 16

function richHost(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement
  return element?.closest<HTMLElement>('[data-field][data-rich="1"]') ?? null
}

function fieldHost(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement
  return element?.closest<HTMLElement>("[data-field]") ?? null
}

type EditorProps = {
  id: string
  initial: { title: string; language: CvLanguage; content: CvContent }
  /** The CV's updatedAt when the page loaded (ISO), so a save from a stale tab is refused */
  loadedAt: string
  initialAudit: CvAudit | null
  /** Arrived from the "CV audit" link: the audit is what the person came for */
  startAudit: boolean
  /** A cover letter: one section, so no outline and no audit */
  isLetter?: boolean
  /** Set when this document was written for an offer */
  tailor?: TailorContext | null
}

/**
 * The CV editor: a sticky toolbar, the outline and the sheets, edited in place. `backend` is how
 * it saves, prints and tailors (backend.tsx); pass the same object on every render.
 */
export function CvEditor({ backend, ...props }: EditorProps & { backend: CvEditorBackend }) {
  return (
    <CvEditorBackendProvider backend={backend}>
      <Editor {...props} />
    </CvEditorBackendProvider>
  )
}

function Editor({
  id,
  initial,
  loadedAt,
  initialAudit,
  startAudit,
  isLetter = false,
  tailor = null,
}: EditorProps) {
  const { t } = useCvCopy()
  const backend = useCvBackend()
  const toast = useToast()
  const doc = useCvDocument(id, initial, new Date(loadedAt))
  const { content, edit, undo, redo } = doc

  const [keep, setKeep] = useState<ReadonlySet<string>>(() => new Set())
  const atoms = useMemo(() => cvFlow(content, { editing: true, keep }), [content, keep])

  const flowRef = useRef<HTMLDivElement>(null)
  const { pageCount, ready, schedule } = usePagination(flowRef, atoms)
  const audit = useCvAudit({
    id,
    content,
    initial: initialAudit,
    startOpen: startAudit,
    flowRef,
    flush: doc.flush,
    edit,
    undo,
  })

  // versions and tailoring share the place of the audit rail, so only one of them is open
  const [panel, setPanel] = useState<PanelTab | null>(null)
  const [tailorNotes, setTailorNotes] = useState(tailor?.notes ?? null)
  function togglePanel(tab: PanelTab) {
    if (audit.open) audit.toggle()
    setPanel((current) => (current === tab ? null : tab))
  }
  // what the model changed is the first thing to read, where the sheet still fits next to it
  useEffect(() => {
    const notes = tailor?.notes
    const worthReading =
      notes &&
      (notes.changes.length ||
        notes.gaps.length ||
        notes.unverified.length ||
        !notes.usedJobText ||
        readOnlyExcerpt(notes))
    if (!startAudit && worthReading && window.matchMedia("(min-width: 1400px)").matches)
      setPanel("review")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // fit-to-width scale for phones and narrow windows; the sheets stay editable
  const canvasRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const update = () => {
      const available = canvas.clientWidth - CANVAS_PADDING * 2
      setScale(available > 0 ? Math.min(1, available / PAGE_WIDTH) : 1)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  // focus a field once it exists (after adding a bullet, splitting one, and so on)
  const pendingFocus = useRef<{ field: string; where: "start" | "end" } | null>(null)
  const focusField = useCallback((field: string, where: "start" | "end" = "end") => {
    pendingFocus.current = { field, where }
    setFocusTick((tick) => tick + 1)
  }, [])
  const [focusTick, setFocusTick] = useState(0)
  useLayoutEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    const element = flowRef.current?.querySelector<HTMLElement>(
      `[data-field="${CSS.escape(pending.field)}"]`
    )
    if (!element) return
    pendingFocus.current = null
    element.focus()
    placeCaret(element, pending.where)
  }, [atoms, focusTick])

  const keepField = useCallback((key: string, on: boolean) => {
    setKeep((current) => {
      if (current.has(key) === on) return current
      const next = new Set(current)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  const help = useEditorHelp()
  const photoInput = useRef<HTMLInputElement>(null)
  const [linksOpen, setLinksOpen] = useState<{ top: number; left: number } | null>(null)
  const [outlineOpen, setOutlineOpen] = useState(true)
  useEffect(() => {
    if (window.matchMedia("(max-width: 900px)").matches) setOutlineOpen(false)
  }, [])

  const ops: EditorOps = {
    t,
    locale: doc.language,
    content,
    edit,
    focusField,
    keepField,
    addSection: (type, afterId) => {
      const section = newSection(type, t(`cv.sec.${type}`), doc.language)
      edit((current) => insertSection(current, section, afterId))
      focusField(atomKey(section.id, "title"))
    },
    removeSection: (section: CvSection) => {
      edit((current) => removeSection(current, section.id))
      toast.show({
        message: t("cv.out.sectionDeleted", {
          title: section.title.trim() || t("cv.out.untitled"),
        }),
        action: { label: t("cv.ed.undo"), onClick: undo },
      })
    },
    pickPhoto: () => photoInput.current?.click(),
    removePhoto: () => edit((current) => updateHeader(current, { photo: null })),
    openLinks: (anchor) => {
      const rect = anchor.getBoundingClientRect()
      setLinksOpen({ top: rect.bottom + 8, left: Math.max(8, rect.right - 360) })
    },
  }

  const onPhoto = useCallback(
    async (file: File) => {
      try {
        const photo = await photoToDataUrl(file)
        edit((current) => updateHeader(current, { photo }))
      } catch {
        toast.show({ message: t("cv.photo.err"), tone: "danger" })
      }
    },
    [edit, t, toast]
  )

  // a pasted image (a screenshot, "Copy image") becomes the photo; with text on the clipboard
  // too, the text wins, as the fields take plain text only
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const data = event.clipboardData
      if (!data || data.getData("text/plain").trim()) return
      const file = Array.from(data.files).find((entry) => entry.type.startsWith("image/"))
      if (!file) return
      event.preventDefault()
      event.stopPropagation()
      void onPhoto(file)
    }
    document.addEventListener("paste", onPaste, true)
    return () => document.removeEventListener("paste", onPaste, true)
  }, [onPhoto])

  // ---------------------------------------------------------------- link popover
  const [linkBox, setLinkBox] = useState<LinkBox | null>(null)
  const linkRange = useRef<Range | null>(null)

  const openLinkBox = useCallback(() => {
    const selection = window.getSelection()
    if (!selection?.rangeCount) return
    const range = selection.getRangeAt(0)
    const host = richHost(range.commonAncestorContainer)
    if (!host) return
    const node = range.commonAncestorContainer
    const anchor = (node instanceof Element ? node : node.parentElement)?.closest("a")
    linkRange.current = range.cloneRange()
    const rect = range.getClientRects()[0] ?? host.getBoundingClientRect()
    setLinkBox({
      top: rect.bottom + 8,
      left: Math.min(rect.left, window.innerWidth - 336),
      url: anchor?.getAttribute("href") ?? "",
      error: false,
      hasAnchor: Boolean(anchor),
    })
  }, [])

  function restoreLinkRange(): { host: HTMLElement; anchor: HTMLAnchorElement | null } | null {
    const range = linkRange.current
    const selection = window.getSelection()
    if (!range || !selection) return null
    const host = richHost(range.commonAncestorContainer)
    if (!host) return null
    host.focus()
    selection.removeAllRanges()
    selection.addRange(range)
    const node = range.commonAncestorContainer
    const anchor = (node instanceof Element ? node : node.parentElement)?.closest("a") ?? null
    if (anchor && range.collapsed) {
      const whole = document.createRange()
      whole.selectNodeContents(anchor)
      selection.removeAllRanges()
      selection.addRange(whole)
    }
    return { host, anchor }
  }

  function applyLink() {
    if (!linkBox) return
    const href = normalizeHref(linkBox.url)
    if (!href) {
      setLinkBox({ ...linkBox, error: true })
      return
    }
    const restored = restoreLinkRange()
    if (!restored) return setLinkBox(null)
    const selection = window.getSelection()
    if (selection?.isCollapsed) {
      document.execCommand("insertText", false, linkBox.url.trim())
      const after = selection.getRangeAt(0)
      const inserted = document.createRange()
      inserted.setStart(
        after.endContainer,
        Math.max(0, after.endOffset - linkBox.url.trim().length)
      )
      inserted.setEnd(after.endContainer, after.endOffset)
      selection.removeAllRanges()
      selection.addRange(inserted)
    }
    document.execCommand("createLink", false, href)
    selection?.collapseToEnd()
    setLinkBox(null)
  }

  function removeLink() {
    if (restoreLinkRange()) {
      document.execCommand("unlink")
      window.getSelection()?.collapseToEnd()
    }
    setLinkBox(null)
  }

  // ---------------------------------------------------------------- keyboard
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      const key = event.key.toLowerCase()
      const inField = Boolean(fieldHost(event.target as Node))
      if (key === "z" && (inField || event.target === document.body)) {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (key === "y" && inField) {
        event.preventDefault()
        redo()
      } else if (inField && (key === "b" || key === "i" || key === "u" || key === "k")) {
        // bold and italic only in rich fields; underline is not part of the format
        event.preventDefault()
        if (!richHost(event.target as Node)) return
        if (key === "b") document.execCommand("bold")
        else if (key === "i") document.execCommand("italic")
        else if (key === "k") openLinkBox()
      }
    }
    // the browser's own undo (Edit menu) must not fight our snapshots
    function onBeforeInput(event: InputEvent) {
      if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
        event.preventDefault()
        if (event.inputType === "historyUndo") undo()
        else redo()
      }
    }
    document.addEventListener("keydown", onKey, true)
    root.addEventListener("beforeinput", onBeforeInput)
    return () => {
      document.removeEventListener("keydown", onKey, true)
      root.removeEventListener("beforeinput", onBeforeInput)
    }
  }, [undo, redo, openLinkBox])

  // ---------------------------------------------------------------- download
  const [downloading, setDownloading] = useState(false)
  async function download() {
    setDownloading(true)
    try {
      await doc.flush()
      const result = await downloadPdf(backend.pdfUrl(id))
      if (result === "print") {
        toast.show({ message: t("cv.pdf.noChrome"), duration: 8000 })
        window.open(backend.printUrl(id, { auto: true }), "_blank", "noopener")
      } else if (result === "failed") {
        toast.show({ message: t("cv.err.pdf"), tone: "danger" })
      }
    } finally {
      setDownloading(false)
    }
  }

  const stageHeight = sheetsHeight(pageCount)
  const sheets = Array.from({ length: pageCount }, (_, index) => index)

  return (
    <div className="cve" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: CV_CSS }} />
      <div className="cve-toolbar" role="toolbar" aria-label={t("cv.ed.tools")}>
        <Link
          className="cve-toolbar__back"
          href={backend.routes.list}
          aria-label={t("cv.ed.back")}
          title={t("cv.ed.back")}
        >
          <ArrowLeft aria-hidden />
        </Link>
        <input
          className="input cve-toolbar__title"
          value={doc.title}
          maxLength={160}
          aria-label={t("cv.ed.titleLabel")}
          onChange={(event) => doc.setTitle(event.target.value)}
        />
        <select
          className="select select--sm cve-toolbar__lang"
          value={doc.language}
          aria-label={t("cv.ed.language")}
          onChange={(event) => doc.setLanguage(event.target.value === "en" ? "en" : "pl")}
        >
          <option value="pl">{t("cv.lang.pl")}</option>
          <option value="en">{t("cv.lang.en")}</option>
        </select>
        <SaveStatus
          state={doc.saveState}
          error={doc.saveError}
          limit={doc.saveLimit}
          onRetry={() => void doc.flush()}
        />
        <span className="cve-toolbar__sep" aria-hidden />
        <span className="cve-toolbar__group" onMouseDown={(event) => event.preventDefault()}>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<Undo2 />}
            aria-label={t("cv.ed.undo")}
            title={t("cv.ed.undo")}
            disabled={!doc.canUndo}
            onClick={undo}
          />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<Redo2 />}
            aria-label={t("cv.ed.redo")}
            title={t("cv.ed.redo")}
            disabled={!doc.canRedo}
            onClick={redo}
          />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<Bold />}
            aria-label={t("cv.ed.bold")}
            title={t("cv.ed.bold")}
            onClick={() => document.execCommand("bold")}
          />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<Italic />}
            aria-label={t("cv.ed.italic")}
            title={t("cv.ed.italic")}
            onClick={() => document.execCommand("italic")}
          />
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<Link2 />}
            aria-label={t("cv.ed.link")}
            title={t("cv.ed.link")}
            onClick={openLinkBox}
          />
        </span>
        <span className="cve-toolbar__spacer" />
        <span className="cve-toolbar__pages t-sm muted" aria-live="polite">
          {t("cv.ed.pages", { n: pageCount })}
        </span>
        {isLetter || !backend.audit ? null : (
          <Button
            size="sm"
            variant={audit.open ? "soft" : "ghost"}
            icon={<FileSearch />}
            aria-pressed={audit.open}
            onClick={() => {
              setPanel(null)
              audit.toggle()
            }}
          >
            {t("cv.au.button")}
            {audit.allOpen.length ? (
              <span className="cva-count">{audit.allOpen.length}</span>
            ) : null}
          </Button>
        )}
        <Button
          size="sm"
          variant={panel === "versions" ? "soft" : "ghost"}
          icon={<History />}
          aria-pressed={panel === "versions"}
          onClick={() => togglePanel("versions")}
        >
          {t("tl.v.button")}
        </Button>
        <Button
          size="sm"
          variant={help.open ? "soft" : "ghost"}
          iconOnly
          icon={<CircleQuestionMark />}
          aria-label={t("cv.help.button")}
          title={t("cv.help.button")}
          aria-haspopup="dialog"
          onClick={help.show}
        />
        <ButtonLink
          href={backend.printUrl(id)}
          external
          size="sm"
          variant="ghost"
          icon={<Printer />}
        >
          {t("cv.ed.print")}
        </ButtonLink>
        <Button
          size="sm"
          variant="primary"
          icon={<Download />}
          loading={downloading}
          onClick={() => void download()}
        >
          {t("cv.ed.download")}
        </Button>
      </div>

      {tailor ? (
        <TailorBar
          id={id}
          tailor={tailor}
          notes={tailorNotes}
          language={doc.language}
          flush={doc.flush}
          onReview={() => togglePanel("review")}
        />
      ) : null}
      {audit.open ? <AuditBar state={audit} /> : null}

      <div
        className={`cve-body${audit.open ? " cve-body--audit" : ""}${
          panel ? " cve-body--panel" : ""
        }${isLetter ? " cve-body--letter" : ""}`}
      >
        {isLetter ? null : (
          <details
            className="cve-outline"
            open={outlineOpen}
            onToggle={(event) => setOutlineOpen(event.currentTarget.open)}
          >
            <summary className="cve-outline__head">{t("cv.out.title")}</summary>
            <Outline ops={ops} />
          </details>
        )}

        <div
          className="cve-canvas"
          ref={canvasRef}
          role="region"
          aria-label={t("cv.ed.canvas")}
          onInput={schedule}
          onClick={audit.onCanvasClick}
        >
          <div
            className="cve-stage"
            style={{ width: PAGE_WIDTH * scale, height: stageHeight * scale }}
          >
            <div
              className="cv-doc cve-doc"
              style={
                {
                  "--cv-accent": content.theme.accent,
                  transform: scale === 1 ? undefined : `scale(${scale})`,
                  height: stageHeight,
                } as React.CSSProperties
              }
            >
              {sheets.map((index) => (
                <div key={index} className="cv-page cve-sheet" style={{ top: sheetTop(index) }}>
                  <div className="cv-footer">{footerText(content, index + 1, pageCount)}</div>
                </div>
              ))}
              <div className={`cv-flow cve-flow${ready ? " is-ready" : ""}`} ref={flowRef}>
                {atoms.map((atom) => (
                  <div
                    key={atom.key}
                    className={`cv-atom cv-atom--${atom.kind}`}
                    data-key={atom.key}
                    data-keep={atom.keepWithNext ? "1" : undefined}
                    data-lead={atom.lead}
                    style={{ paddingTop: `${atom.lead}mm` }}
                  >
                    <AtomContent ops={ops} atom={atom} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {audit.open ? <AuditRail state={audit} /> : null}
        {panel ? (
          <DocumentPanel
            id={id}
            doc={doc}
            isLetter={isLetter}
            tab={panel}
            onTab={setPanel}
            onClose={() => setPanel(null)}
            tailor={tailor}
            notes={tailorNotes}
            onNotes={setTailorNotes}
          />
        ) : null}
      </div>

      <input
        ref={photoInput}
        type="file"
        className="dz-input"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void onPhoto(file)
        }}
      />

      {linkBox ? (
        <form
          className="cve-pop"
          style={{ top: linkBox.top, left: linkBox.left }}
          onSubmit={(event) => {
            event.preventDefault()
            applyLink()
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation()
              setLinkBox(null)
            }
          }}
        >
          <input
            autoFocus
            className="input"
            value={linkBox.url}
            placeholder="https://"
            aria-label={t("cv.link.url")}
            aria-invalid={linkBox.error}
            onChange={(event) => setLinkBox({ ...linkBox, url: event.target.value, error: false })}
            onBlur={(event) => {
              if (!event.currentTarget.form?.contains(event.relatedTarget as Node)) setLinkBox(null)
            }}
          />
          {linkBox.error ? <p className="field__error">{t("cv.link.invalid")}</p> : null}
          <div className="cve-pop__row">
            {linkBox.hasAnchor ? (
              <Button
                size="sm"
                variant="ghost"
                onMouseDown={(event) => event.preventDefault()}
                onClick={removeLink}
              >
                {t("cv.link.remove")}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              type="submit"
              onMouseDown={(event) => event.preventDefault()}
            >
              {t("cv.link.apply")}
            </Button>
          </div>
        </form>
      ) : null}

      <EditorHelp
        open={help.open}
        onClose={help.close}
        isLetter={isLetter}
        tailored={Boolean(tailor)}
        guide={backend.routes.guide}
      />

      {linksOpen ? (
        <LinksPopover ops={ops} at={linksOpen} onClose={() => setLinksOpen(null)} />
      ) : null}
    </div>
  )
}

function SaveStatus({
  state,
  error,
  limit,
  onRetry,
}: {
  state: SaveState
  error: string | null
  limit: number | null
  onRetry: () => void
}) {
  const { t } = useCvCopy()
  if (state === "conflict") {
    return (
      <span className="cve-save cve-save--error" role="alert">
        <CircleAlert aria-hidden />
        <span>{t("cv.ed.conflict")}</span>
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw />}
          onClick={() => window.location.reload()}
        >
          {t("cv.ed.reload")}
        </Button>
      </span>
    )
  }
  if (state === "error") {
    return (
      <span className="cve-save cve-save--error" role="alert">
        <CircleAlert aria-hidden />
        <span title={error ?? undefined}>
          {limit
            ? t("cv.ed.tooLong", { max: limit })
            : error
            ? t("cv.ed.invalid", { reason: error })
            : t("cv.ed.unsaved")}
        </span>
        <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={onRetry}>
          {t("common.retry")}
        </Button>
      </span>
    )
  }
  return (
    <span className="cve-save t-sm muted" role="status" aria-live="polite">
      {t(state === "saving" ? "cv.ed.saving" : "cv.ed.saved")}
    </span>
  )
}
