"use client"

import { useId, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { invoke } from "src/app/rpc"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BriefcaseBusiness,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FileCode2,
  FilePlus2,
  FileText,
  FileUp,
  LogIn,
  Mail,
  MoreHorizontal,
  Pencil,
  PenLine,
  Search,
  Star,
  Trash2,
  UserRound,
  Wand2,
} from "lucide-react"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Dropzone, isPdf, Modal, ModalHead, useMenu, useToast } from "@newrole/ui/interactive"
import { Badge, EmptyState, Segmented } from "@newrole/ui/primitives"
import { intlLocale } from "@newrole/ui/i18n"
import { useCopy } from "src/app/i18n/Locale"
import { pluralKind, type CopyKey } from "src/app/i18n/copy"
import { relativeTime } from "@newrole/ui/time"
import { statusLabel, statusTone, TO_APPLY_PATH } from "src/shared/applications"
import { importCvHtml } from "@newrole/cv-core/import-html"
import { downloadPdf } from "@newrole/cv-editor/download"
import { AddLetter } from "@newrole/cv-editor/AddLetter"
import { cvPdfUrl, cvPrintUrl, cvVersionPdfUrl } from "./urls"
import { OUTCOMES, OUTCOME_TONE, summarize, type OutcomeSummary } from "./outcome"
import createCvDocument from "./mutations/createCvDocument"
import createEditableCvDocument from "./mutations/createEditableCvDocument"
import createGeneralLetter from "./mutations/createGeneralLetter"
import { DescribeCv } from "./DescribeCv"
import { NEW_CV_ANCHOR } from "src/app/components/onboarding/FirstSteps"
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
  createdAt: Date | string
  updatedAt: Date | string
  target: { jobId: string | null; company: string; title: string } | null
  /** A general letter: the general CV it goes with */
  forCvId: string | null
  /** A CV for an offer: the general CV it was made from */
  basedOnId: string | null
  /** The PDF an editable CV was uploaded as, kept as its version 0 */
  original: { versionId: string; name: string } | null
}

/** An application as the row of the CV it was sent with lists it (src/server/cv/sent.ts). */
export type SentApplication = {
  id: string
  company: string
  title: string
  status: string
  closedAtStage: string | null
  appliedAt: Date | string
}

/** An application in a general CV's row: `via` is the CV for its offer it was sent with, if any. */
type RowApplication = SentApplication & { via: CvRow | null }

type Filter = "all" | "general" | "offers"
type SortKey = "created" | "updated" | "apps"
type Sort = { key: SortKey; dir: "asc" | "desc" }

/** Above this many CVs the table gets a search field. */
const SEARCH_FROM = 6

const time = (value: Date | string) => new Date(value).getTime()

/** Lower case without Polish accents, so "lodz" finds "Łódź". */
function fold(text: string): string {
  return text.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function matches(row: CvRow, words: string[]): boolean {
  if (!words.length) return true
  const text = fold(`${row.title} ${row.target?.company ?? ""} ${row.target?.title ?? ""}`)
  return words.every((word) => text.includes(word))
}

/**
 * My CV as one table: every CV with when it was made and changed, and the applications sent
 * with it and where they ended up; a row opens to list them. The letters have a table of their
 * own below. `after`: /setup mid-checklist; an uploaded PDF needs no editing, so the step ends there.
 */
export function CvList({
  signedIn,
  initial,
  sent: initialSent = {},
  closedJobs = [],
  filter: initialFilter = "all",
  after = null,
}: {
  signedIn: boolean
  initial: CvRow[]
  /** By CV id, the applications sent with it */
  sent?: Record<string, SentApplication[]>
  /** The offers that closed, by job id */
  closedJobs?: string[]
  filter?: Filter
  after?: string | null
}) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const router = useRouter()
  const [rows, setRows] = useState<CvRow[]>(initial)
  const [sent, setSent] = useState(initialSent)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<CvRow | null>(null)
  /** Deleting a general CV deletes its letter too, unless the person unticks it */
  const [withLetter, setWithLetter] = useState(true)
  const [preview, setPreview] = useState<CvRow | null>(null)
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [sort, setSort] = useState<Sort>({ key: "updated", dir: "desc" })
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState<Set<string>>(new Set())
  /** The uploaded PDF being made editable */
  const [making, setMaking] = useState<string | null>(null)
  const newMenu = useMenu()
  const htmlInput = useRef<HTMLInputElement>(null)
  /** "Opisz swoje doświadczenie" is open */
  const [describing, setDescribing] = useState(false)

  if (!signedIn) {
    return (
      <EmptyState icon={<FileText />} title={t("cv.signin.title")} body={t("cv.signin.body")}>
        <ButtonLink href="/login?returnTo=/cv" variant="primary" icon={<LogIn />}>
          {t("cv.signin.cta")}
        </ButtonLink>
      </EmptyState>
    )
  }

  const cvs = rows.filter((row) => row.docType === "CV")
  const letters = rows
    .filter((row) => row.docType === "LETTER")
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
  const byId = new Map(rows.map((row) => [row.id, row]))
  const closed = new Set(closedJobs)
  const general = cvs.filter((cv) => !cv.target)
  const forOffers = cvs.filter((cv) => cv.target)
  const words = fold(query).split(/\s+/).filter(Boolean)
  const appsOf = (id: string) => sent[id] ?? []
  /**
   * A general CV counts what was sent with it and with every CV for an offer made from it; a CV
   * for an offer counts only its own application.
   */
  const appsFor = (row: CvRow): RowApplication[] =>
    row.target
      ? appsOf(row.id).map((app) => ({ ...app, via: null }))
      : [
          ...appsOf(row.id).map((app) => ({ ...app, via: null })),
          ...cvs
            .filter((other) => other.basedOnId === row.id)
            .flatMap((other) => appsOf(other.id).map((app) => ({ ...app, via: other }))),
        ].sort((a, b) => time(b.appliedAt) - time(a.appliedAt))
  const value = (row: CvRow) =>
    sort.key === "created"
      ? time(row.createdAt)
      : sort.key === "updated"
        ? time(row.updatedAt)
        : appsFor(row).length * 1e15 + time(row.updatedAt)
  const shown = (filter === "general" ? general : filter === "offers" ? forOffers : cvs)
    .filter((row) => matches(row, words))
    .sort((a, b) => (sort.dir === "asc" ? value(a) - value(b) : value(b) - value(a)))

  /** The newest general letter of a general CV; null for anything else */
  function letterOf(row: CvRow): CvRow | null {
    if (row.target || row.docType !== "CV") return null
    return letters.find((letter) => letter.forCvId === row.id) ?? null
  }

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function sortBy(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    )
  }

  async function create(from: "blank" | "profile") {
    newMenu.setOpen(false)
    setBusy(true)
    try {
      const cv = await invoke(createCvDocument, { from, language: locale })
      // a new CV opens with the look panel: the template and the colour come first
      if (cv) router.push(`/cv/${cv.id}?look=1`)
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
      const response = await fetch("/api/cv/upload", {
        method: "POST",
        body,
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
    const paired = Boolean(letterOf(row))
    await act(async () => {
      const next = await invoke(duplicateCvDocument, { id: row.id })
      if (next) setRows(next)
      toast.show({ message: t(paired ? "cvt.toast.pairDuplicated" : "cv.toast.duplicated") })
    })
  }

  function askDelete(row: CvRow) {
    setWithLetter(true)
    setConfirm(row)
  }

  async function makeDefault(row: CvRow) {
    await act(async () => {
      await invoke(setDefaultCvDocument, { id: row.id })
      setRows((current) =>
        current.map((item) => ({ ...item, isDefault: item.docType === "CV" && item.id === row.id }))
      )
      toast.show({ message: t("cv.toast.default") })
    })
  }

  async function remove(row: CvRow) {
    setConfirm(null)
    const letter = row.docType === "LETTER"
    const both = withLetter && Boolean(letterOf(row))
    await act(async () => {
      const next = await invoke(deleteCvDocument, { id: row.id, withLetter: both })
      if (next) setRows(next)
      // the applications stay; they are no longer linked to the deleted CV
      setSent((current) => {
        const next = { ...current }
        delete next[row.id]
        return next
      })
      toast.show({
        message: t(
          letter ? "cvt.toast.letterDeleted" : both ? "cvt.toast.pairDeleted" : "cv.toast.deleted"
        ),
      })
    })
  }

  /** "Utwórz wersję do edycji": the same CV becomes editable; the editor opens on it. */
  async function makeEditable(row: CvRow) {
    setMaking(row.id)
    try {
      const result = await invoke(createEditableCvDocument, { id: row.id })
      if (!result) throw new Error("no result")
      if (result.reader === "text") toast.show({ message: t("cv.up.textOnly"), duration: 10_000 })
      router.push(`/cv/${result.id}?look=1`)
    } catch {
      toast.show({ message: t("cv.up.err"), tone: "danger" })
      setMaking(null)
    }
  }

  async function download(row: CvRow) {
    const result = await downloadPdf(cvPdfUrl(row.id))
    if (result === "print") {
      toast.show({
        message: t("cv.pdf.noChrome"),
        action: {
          label: t("cv.pdf.openPrint"),
          onClick: () => window.open(cvPrintUrl(row.id, { auto: true }), "_blank", "noopener"),
        },
        duration: 10_000,
      })
    } else if (result === "failed") {
      toast.show({ message: t("cv.err.pdf"), tone: "danger" })
    }
  }

  const actions: RowActions = {
    onPreview: setPreview,
    onDownload: (row) => void download(row),
    onDuplicate: (row) => void duplicate(row),
    onDefault: (row) => void makeDefault(row),
    onDelete: askDelete,
  }
  const confirmApps = confirm ? appsOf(confirm.id).length : 0
  const confirmDerived = confirm ? cvs.filter((cv) => cv.basedOnId === confirm.id).length : 0

  return (
    <Dropzone onFile={(file) => void uploadPdf(file)} className="cvl" overClassName="is-over">
      {(openPdfPicker) => (
        <div className="stack cvp">
          <div className="cvp-toolbar">
            {cvs.length ? (
              <Segmented
                value={filter}
                label={t("cvl.filter")}
                onChange={setFilter}
                options={[
                  { value: "all", label: t("cvl.filter.all", { n: cvs.length }) },
                  { value: "general", label: t("cvl.filter.general", { n: general.length }) },
                  { value: "offers", label: t("cvl.filter.offers", { n: forOffers.length }) },
                ]}
              />
            ) : null}
            {cvs.length >= SEARCH_FROM ? (
              <label className="cvo-search cvp-search">
                <Search aria-hidden />
                <input
                  className="input"
                  type="search"
                  value={query}
                  placeholder={t("cvl.search")}
                  aria-label={t("cvl.search")}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            ) : null}
            <div className="rel cvp-toolbar__new">
              <Button
                id={NEW_CV_ANCHOR}
                variant="primary"
                icon={<FilePlus2 />}
                iconRight={<ChevronDown />}
                loading={busy}
                aria-haspopup="menu"
                aria-expanded={newMenu.open}
                onClick={() => newMenu.setOpen((isOpen) => !isOpen)}
              >
                {t("cv.new")}
              </Button>
              {newMenu.open ? (
                <div className="menu" role="menu" ref={newMenu.ref}>
                  <MenuItem icon={<UserRound />} onClick={() => void create("profile")}>
                    {t("cv.new.profile")}
                  </MenuItem>
                  <MenuItem
                    icon={<PenLine />}
                    onClick={() => {
                      newMenu.setOpen(false)
                      setDescribing(true)
                    }}
                  >
                    {t("cv.new.describe")}
                  </MenuItem>
                  <MenuItem icon={<FileText />} onClick={() => void create("blank")}>
                    {t("cv.new.blank")}
                  </MenuItem>
                  <MenuItem
                    icon={<FileCode2 />}
                    onClick={() => {
                      newMenu.setOpen(false)
                      htmlInput.current?.click()
                    }}
                  >
                    {t("cv.new.html")}
                  </MenuItem>
                  <MenuItem
                    icon={<FileUp />}
                    onClick={() => {
                      newMenu.setOpen(false)
                      openPdfPicker()
                    }}
                  >
                    {t("cv.new.pdf")}
                  </MenuItem>
                </div>
              ) : null}
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
          </div>

          {!cvs.length ? (
            <EmptyState icon={<FileText />} title={t("cv.empty.title")} body={t("cv.empty.body")}>
              <Button
                variant="primary"
                icon={<UserRound />}
                onClick={() => void create("profile")}
                loading={busy}
              >
                {t("cv.new.profile")}
              </Button>
              <Button variant="outline" icon={<PenLine />} onClick={() => setDescribing(true)}>
                {t("cv.new.describe")}
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
          ) : shown.length ? (
            <div className="cvp-wrap">
              <table className="table cvp-table">
                <caption className="sr-only">{t("cvl.cvs")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("cvl.col.cv")}</th>
                    <SortHead
                      label={t("cvl.col.created")}
                      sortKey="created"
                      sort={sort}
                      onSort={sortBy}
                    />
                    <SortHead
                      label={t("cvl.col.updated")}
                      sortKey="updated"
                      sort={sort}
                      onSort={sortBy}
                    />
                    <SortHead
                      label={t("cvl.col.apps")}
                      sortKey="apps"
                      sort={sort}
                      onSort={sortBy}
                    />
                    <th scope="col" className="cvp-actions-col">
                      <span className="sr-only">{t("cvl.col.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((cv) => (
                    <CvTableRow
                      key={cv.id}
                      row={cv}
                      apps={appsFor(cv)}
                      open={open.has(cv.id)}
                      onToggle={() => toggle(cv.id)}
                      base={cv.basedOnId ? (byId.get(cv.basedOnId) ?? null) : null}
                      closed={Boolean(cv.target?.jobId && closed.has(cv.target.jobId))}
                      letter={letterOf(cv)}
                      derived={cvs.filter((other) => other.basedOnId === cv.id).length}
                      making={making === cv.id}
                      onMakeEditable={() => void makeEditable(cv)}
                      onAddLetter={(input) =>
                        invoke(createGeneralLetter, { cvId: cv.id, ...input })
                      }
                      onOpen={(id) => router.push(`/cv/${id}`)}
                      onShowDerived={() => {
                        setQuery("")
                        setFilter("offers")
                      }}
                      {...actions}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : words.length ? (
            <p className="muted cvo-empty">{t("cvl.noMatch", { q: query.trim() })}</p>
          ) : filter === "offers" ? (
            <EmptyState
              icon={<BriefcaseBusiness />}
              title={t("cvt.offers.empty.title")}
              body={t("cvt.offers.empty.body")}
            >
              <ButtonLink href={TO_APPLY_PATH} variant="primary" icon={<BriefcaseBusiness />}>
                {t("cvt.offers.add")}
              </ButtonLink>
            </EmptyState>
          ) : (
            <p className="muted cvo-empty">{t("cvl.noneGeneral")}</p>
          )}
          {rows.length ? <p className="t-caption muted">{t("cv.drop")}</p> : null}

          {letters.length ? (
            <section className="cvp-letters" aria-labelledby="cvp-letters-title">
              <header className="cvp-section-head">
                <h2 id="cvp-letters-title" className="t-h3">
                  {t("cvl.letters")}
                </h2>
                <p className="t-sm muted">{t("cvl.letters.sub")}</p>
              </header>
              <div className="cvp-wrap">
                <table className="table cvp-table cvp-table--letters">
                  <caption className="sr-only">{t("cvl.letters")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("cvl.col.letter")}</th>
                      <th scope="col">{t("cvl.col.for")}</th>
                      <th scope="col">{t("cvl.col.created")}</th>
                      <th scope="col">{t("cvl.col.updated")}</th>
                      <th scope="col" className="cvp-actions-col">
                        <span className="sr-only">{t("cvl.col.actions")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {letters.map((letter) => {
                      const cv = letter.forCvId ? byId.get(letter.forCvId) : undefined
                      return (
                        <tr key={letter.id}>
                          <td className="cvp-cell-doc">
                            <DocName row={letter} />
                          </td>
                          <td data-label={t("cvl.col.for")}>
                            {letter.target ? (
                              <OfferLink target={letter.target} />
                            ) : cv ? (
                              t("cvl.letters.forCv", { title: cv.title })
                            ) : (
                              <span className="subtle">{t("cvl.letters.loose")}</span>
                            )}
                          </td>
                          <td data-label={t("cvl.col.created")}>
                            <DateCell value={letter.createdAt} />
                          </td>
                          <td data-label={t("cvl.col.updated")}>
                            <DateCell value={letter.updatedAt} relative />
                          </td>
                          <td className="cvp-actions-col">
                            <RowButtons row={letter} {...actions} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <Modal
            open={Boolean(confirm)}
            onClose={() => setConfirm(null)}
            labelledBy="cv-delete-title"
          >
            <ModalHead
              id="cv-delete-title"
              title={t(
                confirm?.docType === "LETTER" ? "cvt.delete.letterTitle" : "cv.delete.title"
              )}
              onClose={() => setConfirm(null)}
            />
            <div className="modal__body stack-sm">
              <p>
                {confirm
                  ? t(confirm.docType === "LETTER" ? "cvt.delete.letterBody" : "cv.delete.body", {
                      title: confirm.title,
                    })
                  : null}
              </p>
              {confirmApps ? (
                <p className="t-sm">
                  {t(`cvl.delete.apps.${pluralKind(confirmApps, locale)}`, { n: confirmApps })}
                </p>
              ) : null}
              {confirmDerived ? <p className="t-sm muted">{t("cvl.delete.derived")}</p> : null}
              {confirm && letterOf(confirm) ? (
                <label className="cvt-check">
                  <input
                    type="checkbox"
                    checked={withLetter}
                    onChange={(event) => setWithLetter(event.target.checked)}
                  />
                  <span>
                    {t("cvt.delete.withLetter")}
                    <small>{t("cvt.delete.withLetterHint")}</small>
                  </span>
                </label>
              ) : null}
            </div>
            <div className="modal__foot">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" onClick={() => confirm && void remove(confirm)}>
                {t(
                  confirm?.docType === "LETTER"
                    ? "cvt.delete.letterConfirm"
                    : confirm && letterOf(confirm) && withLetter
                      ? "cvt.delete.pairConfirm"
                      : "cv.delete.confirm"
                )}
              </Button>
            </div>
          </Modal>

          <Modal
            open={Boolean(preview)}
            onClose={() => setPreview(null)}
            labelledBy="cv-preview-title"
            className="modal--preview"
          >
            <ModalHead
              id="cv-preview-title"
              title={preview ? t("cvl.previewOf", { title: preview.title }) : ""}
              onClose={() => setPreview(null)}
            />
            {preview ? (
              <>
                <div className="cvp-preview">
                  <iframe
                    src={cvPrintUrl(preview.id)}
                    title={t(
                      preview.docType === "LETTER"
                        ? "cvl.preview.letterFrame"
                        : "cvl.preview.frame",
                      { title: preview.title }
                    )}
                  />
                </div>
                <div className="modal__foot">
                  <Button
                    variant="ghost"
                    icon={<Download />}
                    onClick={() => void download(preview)}
                  >
                    {t("cv.act.download")}
                  </Button>
                  <ButtonLink href={`/cv/${preview.id}`} variant="primary" icon={<Pencil />}>
                    {t(preview.kind === "UPLOADED" ? "cv.act.open" : "cv.act.edit")}
                  </ButtonLink>
                </div>
              </>
            ) : null}
          </Modal>
          <DescribeCv open={describing} onClose={() => setDescribing(false)} />
        </div>
      )}
    </Dropzone>
  )
}

type RowActions = {
  onPreview: (row: CvRow) => void
  onDownload: (row: CvRow) => void
  onDuplicate: (row: CvRow) => void
  onDefault: (row: CvRow) => void
  onDelete: (row: CvRow) => void
}

function MenuItem({
  icon,
  onClick,
  children,
}: {
  icon: ReactNode
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="menu__item" role="menuitem" onClick={onClick}>
      <span className="cvp-menu-icon" aria-hidden>
        {icon}
      </span>
      {children}
    </button>
  )
}

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string
  sortKey: SortKey
  sort: Sort
  onSort: (key: SortKey) => void
}) {
  const active = sort.key === sortKey
  return (
    <th
      scope="col"
      className="cvp-sort-col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="cvp-sort" onClick={() => onSort(sortKey)}>
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp aria-hidden />
          ) : (
            <ArrowDown aria-hidden />
          )
        ) : (
          <ArrowUpDown aria-hidden />
        )}
      </button>
    </th>
  )
}

function DateCell({ value, relative = false }: { value: Date | string; relative?: boolean }) {
  const { t, locale } = useCopy()
  const date = new Date(value)
  const short = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
  const long = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date)
  return (
    <span className="cvp-date">
      <time dateTime={date.toISOString()} title={long}>
        {short}
      </time>
      {relative ? <span className="cvp-sub">{relativeTime(value, t)}</span> : null}
    </span>
  )
}

function OfferLink({ target }: { target: NonNullable<CvRow["target"]> }) {
  const { t } = useCopy()
  const text = t("cvl.offer", { title: target.title, company: target.company })
  return target.jobId ? (
    <Link className="link link--quiet" href={`/offers/${target.jobId}`}>
      {text}
    </Link>
  ) : (
    <span>{text}</span>
  )
}

/** The document's icon, its title linked to the editor, and the badges that are not the usual. */
function DocName({
  row,
  titleId,
  children,
}: {
  row: CvRow
  titleId?: string
  children?: ReactNode
}) {
  const { t } = useCopy()
  const uploaded = row.kind === "UPLOADED"
  return (
    <div className="cvp-doc">
      <span className={`cvl-row__icon${uploaded ? " cvl-row__icon--pdf" : ""}`} aria-hidden>
        {row.docType === "LETTER" ? <Mail /> : <FileText />}
      </span>
      <div className="cvp-doc__main">
        <span className="cvp-doc__name">
          <Link id={titleId} className="cvp-doc__title" href={`/cv/${row.id}`}>
            {row.title}
          </Link>
          {row.isDefault ? (
            <Badge tone="primary" icon={<Star fill="currentColor" />}>
              {t("cv.default")}
            </Badge>
          ) : null}
          {uploaded ? <Badge tone="plain">{t("cv.kind.pdf")}</Badge> : null}
        </span>
        {children}
      </div>
    </div>
  )
}

/** Podgląd, Edytuj, Usuń in sight; the rest in a menu. */
function RowButtons({
  row,
  making = false,
  onMakeEditable,
  onPreview,
  onDownload,
  onDuplicate,
  onDefault,
  onDelete,
}: {
  row: CvRow
  /** An uploaded PDF: "Utwórz wersję do edycji", and whether it is running */
  making?: boolean
  onMakeEditable?: () => void
} & RowActions) {
  const { t } = useCopy()
  const menu = useMenu()
  const uploaded = row.kind === "UPLOADED"
  const letter = row.docType === "LETTER"
  const canDefault = !row.isDefault && !row.target && !letter
  return (
    <div className="cvp-buttons">
      <Button size="sm" variant="outline" icon={<Eye />} onClick={() => onPreview(row)}>
        {t("cvl.preview")}
      </Button>
      <ButtonLink
        href={`/cv/${row.id}`}
        size="sm"
        variant="ghost"
        iconOnly
        icon={<Pencil />}
        aria-label={t("cvl.editOf", { title: row.title })}
        title={t(uploaded ? "cv.act.open" : "cv.act.edit")}
      />
      <Button
        size="sm"
        variant="danger-ghost"
        iconOnly
        icon={<Trash2 />}
        aria-label={t("cvl.deleteOf", { title: row.title })}
        title={t("cv.act.delete")}
        onClick={() => onDelete(row)}
      />
      <div className="rel">
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon={<MoreHorizontal />}
          aria-label={t("cv.act.more", { title: row.title })}
          aria-haspopup="menu"
          aria-expanded={menu.open}
          onClick={() => menu.setOpen((isOpen) => !isOpen)}
        />
        {menu.open ? (
          <div className="menu" role="menu" ref={menu.ref}>
            {uploaded && onMakeEditable ? (
              <MenuItem
                icon={<Wand2 />}
                onClick={() => {
                  menu.setOpen(false)
                  onMakeEditable()
                }}
              >
                {t(making ? "cv.up.making" : "cv.up.make")}
              </MenuItem>
            ) : null}
            <MenuItem
              icon={<Download />}
              onClick={() => {
                menu.setOpen(false)
                onDownload(row)
              }}
            >
              {t("cv.act.download")}
            </MenuItem>
            {letter ? null : (
              <MenuItem
                icon={<Copy />}
                onClick={() => {
                  menu.setOpen(false)
                  onDuplicate(row)
                }}
              >
                {t("cv.act.duplicate")}
              </MenuItem>
            )}
            {canDefault ? (
              <MenuItem
                icon={<Star />}
                onClick={() => {
                  menu.setOpen(false)
                  onDefault(row)
                }}
              >
                {t("cv.act.setDefault")}
              </MenuItem>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** The stacked bar of outcomes and, under it, each one that is not zero. */
function Outcomes({ summary }: { summary: OutcomeSummary }) {
  const { t } = useCopy()
  const present = OUTCOMES.filter((key) => summary.counts[key] > 0)
  return (
    <>
      <span className="cvp-bar" aria-hidden>
        {present.map((key) => (
          <span
            key={key}
            className="cvp-bar__part"
            data-tone={OUTCOME_TONE[key]}
            style={{ flexGrow: summary.counts[key] }}
          />
        ))}
      </span>
      <ul className="cvp-legend" role="list">
        {present.map((key) => (
          <li key={key} data-tone={OUTCOME_TONE[key]}>
            {t("cvl.out.item", {
              label: t(`cvl.out.${key}` as CopyKey),
              n: summary.counts[key],
            })}
          </li>
        ))}
      </ul>
    </>
  )
}

/** One CV: its row, and under it the applications sent with it, its letter and its original. */
function CvTableRow({
  row,
  apps,
  open,
  onToggle,
  base,
  closed,
  letter,
  derived,
  making,
  onMakeEditable,
  onAddLetter,
  onOpen,
  onShowDerived,
  ...actions
}: {
  row: CvRow
  apps: RowApplication[]
  open: boolean
  onToggle: () => void
  /** A CV for an offer: the general CV it was made from, if it is still there */
  base: CvRow | null
  /** Its offer closed */
  closed: boolean
  letter: CvRow | null
  /** How many CVs for offers were made from this one */
  derived: number
  making: boolean
  onMakeEditable: () => void
  onAddLetter: (input: {
    from: "write" | "text" | "blank"
    text?: string
  }) => Promise<{ id: string } | null | undefined>
  onOpen: (id: string) => void
  onShowDerived: () => void
} & RowActions) {
  const { t, locale } = useCopy()
  const titleId = useId()
  const detailId = useId()
  const summary = summarize(apps)
  const uploaded = row.kind === "UPLOADED"
  const date = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" })
  return (
    <>
      <tr className={open ? "cvp-row is-open" : "cvp-row"}>
        <td className="cvp-cell-doc">
          <DocName row={row} titleId={titleId}>
            <span className="cvp-meta">
              <span>{t(row.target ? "cvl.type.offer" : "cvl.type.general")}</span>
              {row.target ? <OfferLink target={row.target} /> : null}
              {closed ? (
                <span>
                  <Badge tone="warning">{t("of.closed")}</Badge>
                </span>
              ) : null}
              {/* the language an upload is stored with is the interface's, not the CV's */}
              {uploaded ? null : (
                <span>{t(row.language === "en" ? "cv.lang.en" : "cv.lang.pl")}</span>
              )}
            </span>
            {base ? (
              <span className="cvp-sub">{t("cvl.fromCv", { title: base.title })}</span>
            ) : null}
          </DocName>
        </td>
        <td data-label={t("cvl.col.created")}>
          <DateCell value={row.createdAt} />
        </td>
        <td data-label={t("cvl.col.updated")}>
          <DateCell value={row.updatedAt} relative />
        </td>
        <td data-label={t("cvl.col.apps")} className="cvp-cell-apps">
          {row.target ? (
            // a CV for one offer goes with one application: its status says more than a count
            apps.length ? (
              <ul className="cvp-own" role="list">
                {apps.map((app) => (
                  <li key={app.id}>
                    <Link
                      className="status-pill cvp-own__status"
                      data-tone={statusTone(app.status)}
                      href={`/applications?id=${app.id}`}
                      title={t("ow.app.open")}
                    >
                      {statusLabel(app.status, locale)}
                    </Link>
                    <span className="cvp-sub">
                      {t("cvl.detail.appliedAt", { date: date.format(new Date(app.appliedAt)) })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="status-pill" data-tone="muted">
                {t("cvt.noApp")}
              </span>
            )
          ) : (
            <>
              <button
                type="button"
                className="cvp-toggle"
                aria-expanded={open}
                aria-controls={detailId}
                aria-describedby={titleId}
                onClick={onToggle}
              >
                <span className={summary.total ? "cvp-toggle__count" : "cvp-toggle__count subtle"}>
                  {summary.total
                    ? t(`cvl.apps.count.${pluralKind(summary.total, locale)}`, {
                        n: summary.total,
                      })
                    : t("cvl.apps.none")}
                </span>
                <ChevronDown aria-hidden />
              </button>
              {summary.total ? (
                <>
                  <Outcomes summary={summary} />
                  <span className="cvp-sub">
                    {t("cvl.replied", { n: summary.replied, total: summary.total })}
                  </span>
                </>
              ) : null}
            </>
          )}
        </td>
        <td className="cvp-actions-col">
          <RowButtons
            row={row}
            making={making}
            onMakeEditable={uploaded ? onMakeEditable : undefined}
            {...actions}
          />
        </td>
      </tr>
      {row.target ? null : (
        <tr className="cvp-detail" id={detailId} hidden={!open}>
          <td colSpan={5}>
            <div className="cvp-detail__grid">
              <section className="cvp-detail__block" aria-labelledby={`${detailId}-sent`}>
                <h3 id={`${detailId}-sent`} className="cvp-detail__title">
                  {t("cvl.detail.sent")}
                </h3>
                {apps.length ? (
                  <ul className="cvp-sent" role="list">
                    {apps.map((app) => (
                      <li key={app.id}>
                        <Link className="cvp-sent__offer" href={`/applications?id=${app.id}`}>
                          {t("cvl.offer", { title: app.title, company: app.company })}
                        </Link>
                        <span className="cvp-meta cvp-sent__meta">
                          <span>
                            {t("cvl.detail.appliedAt", {
                              date: date.format(new Date(app.appliedAt)),
                            })}
                          </span>
                          {app.via ? (
                            <Link className="link link--quiet" href={`/cv/${app.via.id}`}>
                              {t("cvl.detail.via")}
                            </Link>
                          ) : null}
                        </span>
                        <span className="status-pill" data-tone={statusTone(app.status)}>
                          {statusLabel(app.status, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="t-sm muted">{t("cvl.detail.none")}</p>
                )}
                {derived ? (
                  <p className="t-sm muted">
                    {t(`cvl.detail.derived.${pluralKind(derived, locale)}`, { n: derived })}{" "}
                    <button type="button" className="link" onClick={onShowDerived}>
                      {t("cvl.detail.showDerived")}
                    </button>
                  </p>
                ) : null}
              </section>
              {row.target ? null : (
                <section className="cvp-detail__block" aria-labelledby={`${detailId}-letter`}>
                  <h3 id={`${detailId}-letter`} className="cvp-detail__title">
                    {t("cvl.detail.letter")}
                  </h3>
                  {letter ? (
                    <div className="cvp-letter">
                      <Link className="link" href={`/cv/${letter.id}`}>
                        {letter.title}
                      </Link>
                      <span className="cvp-sub">
                        {t("cv.updated", { when: relativeTime(letter.updatedAt, t) ?? "" })}
                      </span>
                    </div>
                  ) : (
                    <div className="cvp-letter">
                      <p className="t-sm muted">{t("cvt.letter.noneGeneral")}</p>
                      <AddLetter
                        create={onAddLetter}
                        onCreated={onOpen}
                        variant="soft"
                        align="left"
                      />
                    </div>
                  )}
                  {row.original ? (
                    <a
                      className="link link--quiet t-sm"
                      href={cvVersionPdfUrl(row.id, row.original.versionId)}
                      aria-label={t("cv.up.originalOf", { name: row.original.name })}
                      download
                    >
                      {t("cv.up.original", { name: row.original.name })}
                    </a>
                  ) : null}
                </section>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
