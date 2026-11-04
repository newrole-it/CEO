"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { invoke } from "@blitzjs/rpc"
import { getAntiCSRFToken } from "@blitzjs/auth"
import {
  ChevronDown,
  Copy,
  Download,
  FileCode2,
  FilePlus2,
  FileText,
  FileUp,
  LogIn,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  UserRound,
} from "lucide-react"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Dropzone, isPdf, Modal, ModalHead, useToast } from "@newrole/ui/interactive"
import { Badge, EmptyState } from "@newrole/ui/primitives"
import { useCopy } from "src/app/i18n/Locale"
import { relativeTime } from "src/app/jobs/format"
import { importCvHtml } from "@newrole/cv-core/import-html"
import { downloadCvPdf, printViewUrl } from "./download"
import createCvDocument from "./mutations/createCvDocument"
import deleteCvDocument from "./mutations/deleteCvDocument"
import duplicateCvDocument from "./mutations/duplicateCvDocument"
import setDefaultCvDocument from "./mutations/setDefaultCvDocument"

const MAX_PDF_BYTES = 5_000_000
const MAX_HTML_BYTES = 6_000_000

export type CvRow = {
  id: string
  title: string
  language: "pl" | "en"
  kind: "EDITABLE" | "UPLOADED"
  docType: "CV" | "LETTER"
  isDefault: boolean
  hasPdf: boolean
  hasContent: boolean
  updatedAt: Date | string
  target: { jobId: string | null; company: string; title: string } | null
}

/** Tailored documents with an offer's CV and letter side by side, newest offer first. */
function byOffer(rows: CvRow[]): CvRow[] {
  const order = new Map<string, number>()
  const key = (row: CvRow) => row.target?.jobId ?? row.id
  for (const row of rows) if (!order.has(key(row))) order.set(key(row), order.size)
  return [...rows].sort(
    (a, b) =>
      (order.get(key(a)) ?? 0) - (order.get(key(b)) ?? 0) ||
      Number(a.docType === "LETTER") - Number(b.docType === "LETTER")
  )
}

/** The dropdown behaviour used across the app: outside click and Esc close it, arrows move. */
function useMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const node = ref.current
    node?.querySelector<HTMLElement>("a, button")?.focus()
    function onDown(event: MouseEvent) {
      if (!node?.parentElement?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const items = [...(node?.querySelectorAll<HTMLElement>("a, button") ?? [])]
        const at = items.indexOf(document.activeElement as HTMLElement)
        items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus()
      }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  return { open, setOpen, ref }
}

/** `after`: /setup mid-checklist. An uploaded PDF needs no editing, so the step ends there. */
export function CvList({
  signedIn,
  initial,
  after = null,
}: {
  signedIn: boolean
  initial: CvRow[]
  after?: string | null
}) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const router = useRouter()
  const [rows, setRows] = useState<CvRow[]>(initial)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<CvRow | null>(null)
  const newMenu = useMenu()
  const htmlInput = useRef<HTMLInputElement>(null)

  if (!signedIn) {
    return (
      <EmptyState icon={<FileText />} title={t("cv.signin.title")} body={t("cv.signin.body")}>
        <ButtonLink href="/login?returnTo=/cv" variant="primary" icon={<LogIn />}>
          {t("cv.signin.cta")}
        </ButtonLink>
      </EmptyState>
    )
  }

  async function create(from: "blank" | "profile") {
    newMenu.setOpen(false)
    setBusy(true)
    try {
      const cv = await invoke(createCvDocument, { from, language: locale })
      if (cv) router.push(`/cv/${cv.id}`)
    } catch {
      toast.show({ message: t("cv.err.create"), tone: "danger" })
      setBusy(false)
    }
  }

  async function importHtml(file: File) {
    newMenu.setOpen(false)
    if (file.size > MAX_HTML_BYTES) {
      toast.show({ message: t("cv.err.html"), tone: "danger" })
      return
    }
    setBusy(true)
    try {
      const doc = new DOMParser().parseFromString(await file.text(), "text/html")
      const { content, language, title } = importCvHtml(doc)
      const cv = await invoke(createCvDocument, { from: "content", content, language, title })
      if (cv) router.push(`/cv/${cv.id}`)
    } catch {
      toast.show({ message: t("cv.err.html"), tone: "danger" })
      setBusy(false)
    }
  }

  async function uploadPdf(file: File) {
    newMenu.setOpen(false)
    if (!isPdf(file)) {
      toast.show({ message: t("cv.err.notPdf"), tone: "danger" })
      return
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.show({ message: t("cv.err.tooLarge"), tone: "danger" })
      return
    }
    setBusy(true)
    try {
      const body = new FormData()
      body.append("file", file)
      body.append("language", locale)
      const token = getAntiCSRFToken()
      const response = await fetch("/api/cv/upload", {
        method: "POST",
        body,
        headers: token ? { "anti-csrf": token } : undefined,
      })
      const data = (await response.json().catch(() => ({}))) as { cv?: CvRow; code?: string }
      if (!response.ok || !data.cv) {
        const key =
          data.code === "not-pdf"
            ? "cv.err.notPdf"
            : data.code === "too-large"
            ? "cv.err.tooLarge"
            : "cv.err.upload"
        toast.show({ message: t(key), tone: "danger" })
        return
      }
      router.push(after ?? `/cv/${data.cv.id}`)
    } catch {
      toast.show({ message: t("cv.err.upload"), tone: "danger" })
    } finally {
      setBusy(false)
    }
  }

  async function act(run: () => Promise<void>) {
    setBusy(true)
    try {
      await run()
    } catch {
      toast.show({ message: t("cv.err.action"), tone: "danger" })
    } finally {
      setBusy(false)
    }
  }

  async function duplicate(row: CvRow) {
    await act(async () => {
      const copy = await invoke(duplicateCvDocument, { id: row.id })
      if (copy) setRows((current) => [...current, copy])
      toast.show({ message: t("cv.toast.duplicated") })
    })
  }

  async function makeDefault(row: CvRow) {
    await act(async () => {
      await invoke(setDefaultCvDocument, { id: row.id })
      setRows((current) => current.map((item) => ({ ...item, isDefault: item.id === row.id })))
      toast.show({ message: t("cv.toast.default") })
    })
  }

  async function remove(row: CvRow) {
    setConfirm(null)
    await act(async () => {
      const next = await invoke(deleteCvDocument, { id: row.id })
      if (next) setRows(next)
      toast.show({ message: t("cv.toast.deleted") })
    })
  }

  async function download(row: CvRow) {
    const result = await downloadCvPdf(row.id)
    if (result === "print") {
      toast.show({
        message: t("cv.pdf.noChrome"),
        action: {
          label: t("cv.pdf.openPrint"),
          onClick: () => window.open(printViewUrl(row.id), "_blank", "noopener"),
        },
        duration: 10_000,
      })
    } else if (result === "failed") {
      toast.show({ message: t("cv.err.pdf"), tone: "danger" })
    }
  }

  return (
    <Dropzone onFile={(file) => void uploadPdf(file)} className="cvl" overClassName="is-over">
      {(openPdfPicker) => (
        <div className="stack">
          <div className="cvl-actions">
            <div className="rel">
              <Button
                variant="primary"
                icon={<FilePlus2 />}
                iconRight={<ChevronDown />}
                loading={busy}
                aria-haspopup="menu"
                aria-expanded={newMenu.open}
                onClick={() => newMenu.setOpen((open) => !open)}
              >
                {t("cv.new")}
              </Button>
              {newMenu.open ? (
                <div className="menu cvl-menu-left" role="menu" ref={newMenu.ref}>
                  <button
                    type="button"
                    className="menu__item"
                    role="menuitem"
                    onClick={() => void create("profile")}
                  >
                    <UserRound aria-hidden />
                    {t("cv.new.profile")}
                  </button>
                  <button
                    type="button"
                    className="menu__item"
                    role="menuitem"
                    onClick={() => void create("blank")}
                  >
                    <FileText aria-hidden />
                    {t("cv.new.blank")}
                  </button>
                  <button
                    type="button"
                    className="menu__item"
                    role="menuitem"
                    onClick={() => {
                      newMenu.setOpen(false)
                      htmlInput.current?.click()
                    }}
                  >
                    <FileCode2 aria-hidden />
                    {t("cv.new.html")}
                  </button>
                  <button
                    type="button"
                    className="menu__item"
                    role="menuitem"
                    onClick={() => {
                      newMenu.setOpen(false)
                      openPdfPicker()
                    }}
                  >
                    <FileUp aria-hidden />
                    {t("cv.new.pdf")}
                  </button>
                </div>
              ) : null}
            </div>
            <input
              ref={htmlInput}
              type="file"
              className="dz-input"
              accept=".html,.htm,text/html"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file) void importHtml(file)
              }}
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={<FileText />} title={t("cv.empty.title")} body={t("cv.empty.body")}>
              <Button
                variant="primary"
                icon={<UserRound />}
                onClick={() => void create("profile")}
                loading={busy}
              >
                {t("cv.new.profile")}
              </Button>
              <Button variant="outline" icon={<FileUp />} onClick={() => openPdfPicker()}>
                {t("cv.new.pdf")}
              </Button>
              <Button
                variant="outline"
                icon={<FileCode2 />}
                onClick={() => htmlInput.current?.click()}
              >
                {t("cv.new.html")}
              </Button>
            </EmptyState>
          ) : (
            <ul className="cvl-grid" role="list">
              {rows
                .filter((row) => !row.target)
                .map((row) => (
                  <CvCard
                    key={row.id}
                    row={row}
                    onDownload={() => void download(row)}
                    onDuplicate={() => void duplicate(row)}
                    onDefault={() => void makeDefault(row)}
                    onDelete={() => setConfirm(row)}
                  />
                ))}
            </ul>
          )}
          {rows.length > 0 ? <p className="t-caption muted">{t("cv.drop")}</p> : null}
          {rows.some((row) => row.target) ? (
            <>
              <h2 className="cvt-list-title">{t("tl.list.title")}</h2>
              <ul className="cvl-grid" role="list">
                {byOffer(rows.filter((row) => row.target)).map((row) => (
                  <CvCard
                    key={row.id}
                    row={row}
                    onDownload={() => void download(row)}
                    onDuplicate={() => void duplicate(row)}
                    onDefault={() => void makeDefault(row)}
                    onDelete={() => setConfirm(row)}
                  />
                ))}
              </ul>
            </>
          ) : null}

          <Modal
            open={Boolean(confirm)}
            onClose={() => setConfirm(null)}
            labelledBy="cv-delete-title"
          >
            <ModalHead
              id="cv-delete-title"
              title={t("cv.delete.title")}
              onClose={() => setConfirm(null)}
            />
            <div className="modal__body">
              <p>{confirm ? t("cv.delete.body", { title: confirm.title }) : null}</p>
            </div>
            <div className="modal__foot">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" onClick={() => confirm && void remove(confirm)}>
                {t("cv.delete.confirm")}
              </Button>
            </div>
          </Modal>
        </div>
      )}
    </Dropzone>
  )
}

function CvCard({
  row,
  onDownload,
  onDuplicate,
  onDefault,
  onDelete,
}: {
  row: CvRow
  onDownload: () => void
  onDuplicate: () => void
  onDefault: () => void
  onDelete: () => void
}) {
  const { t } = useCopy()
  const menu = useMenu()
  const uploaded = row.kind === "UPLOADED"
  const letter = row.docType === "LETTER"
  return (
    <li className="card card--pad cvl-card">
      <div className="cvl-card__top">
        <span className={`cvl-card__icon${uploaded ? " cvl-card__icon--pdf" : ""}`} aria-hidden>
          <FileText />
        </span>
        <div className="cvl-card__main">
          <Link className="cvl-card__title" href={`/cv/${row.id}`}>
            {row.title}
          </Link>
          <div className="cvl-card__meta">
            {row.isDefault ? (
              <Badge tone="primary" icon={<Star fill="currentColor" />}>
                {t("cv.default")}
              </Badge>
            ) : null}
            {letter ? (
              <Badge tone="primary">{t("tl.list.letter")}</Badge>
            ) : (
              <Badge tone={uploaded ? "plain" : "success"}>
                {t(uploaded ? "cv.kind.pdf" : "cv.kind.editable")}
              </Badge>
            )}
            <Badge tone="plain">{t(row.language === "en" ? "cv.lang.en" : "cv.lang.pl")}</Badge>
          </div>
          <span className="t-caption muted">
            {t("cv.updated", { when: relativeTime(row.updatedAt, t) ?? "" })}
          </span>
        </div>
      </div>
      <div className="cvl-card__actions">
        <ButtonLink href={`/cv/${row.id}`} size="sm" variant="outline" icon={<Pencil />}>
          {t(uploaded ? "cv.act.open" : "cv.act.edit")}
        </ButtonLink>
        <Button size="sm" variant="outline" icon={<Download />} onClick={onDownload}>
          {t("cv.act.download")}
        </Button>
        <div className="rel">
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<MoreHorizontal />}
            aria-label={t("cv.act.more", { title: row.title })}
            aria-haspopup="menu"
            aria-expanded={menu.open}
            onClick={() => menu.setOpen((open) => !open)}
          />
          {menu.open ? (
            <div className="menu" role="menu" ref={menu.ref}>
              {letter ? null : (
                <button
                  type="button"
                  className="menu__item"
                  role="menuitem"
                  onClick={() => {
                    menu.setOpen(false)
                    onDuplicate()
                  }}
                >
                  <Copy aria-hidden />
                  {t("cv.act.duplicate")}
                </button>
              )}
              {row.isDefault || row.target ? null : (
                <button
                  type="button"
                  className="menu__item"
                  role="menuitem"
                  onClick={() => {
                    menu.setOpen(false)
                    onDefault()
                  }}
                >
                  <Star aria-hidden />
                  {t("cv.act.setDefault")}
                </button>
              )}
              <div className="menu__sep" />
              <button
                type="button"
                className="menu__item menu__item--danger"
                role="menuitem"
                onClick={() => {
                  menu.setOpen(false)
                  onDelete()
                }}
              >
                <Trash2 aria-hidden />
                {t("cv.act.delete")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}
