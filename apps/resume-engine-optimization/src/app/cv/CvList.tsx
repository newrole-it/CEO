"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { invoke } from "@blitzjs/rpc"
import { getAntiCSRFToken } from "@blitzjs/auth"
import {
  BriefcaseBusiness,
  ChevronDown,
  Copy,
  Download,
  FileCode2,
  FilePlus2,
  FileText,
  FileUp,
  LogIn,
  Mail,
  MoreHorizontal,
  Pencil,
  PenLine,
  Plus,
  Search,
  Star,
  Trash2,
  UserRound,
  Wand2,
} from "lucide-react"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Dropzone, isPdf, Modal, ModalHead, useMenu, useToast } from "@newrole/ui/interactive"
import { Badge, EmptyState } from "@newrole/ui/primitives"
import { useCopy } from "src/app/i18n/Locale"
import { relativeTime } from "@newrole/ui/time"
import { statusLabel, statusTone } from "src/shared/applications"
import { importCvHtml } from "@newrole/cv-core/import-html"
import { downloadPdf } from "@newrole/cv-editor/download"
import { AddLetter } from "@newrole/cv-editor/AddLetter"
import { cvPdfUrl, cvPrintUrl, cvVersionPdfUrl } from "./urls"
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
  updatedAt: Date | string
  target: { jobId: string | null; company: string; title: string } | null
  /** A general letter: the general CV it goes with */
  forCvId: string | null
  /** The PDF an editable CV was uploaded as, kept as its version 0 */
  original: { versionId: string; name: string } | null
}

/** A general CV and its letter, as "General" shows them. */
type Pair = { cv: CvRow; letter: CvRow | null }

/**
 * The general CVs in the list's order (the default first), each with its letter, and the general
 * letters whose CV is gone.
 */
function byCv(rows: CvRow[]): { pairs: Pair[]; loose: CvRow[] } {
  const cvs = rows.filter((row) => !row.target && row.docType === "CV")
  const letters = rows.filter((row) => !row.target && row.docType === "LETTER")
  const ids = new Set(cvs.map((cv) => cv.id))
  const newest = (a: CvRow, b: CvRow) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  const pairs = cvs.map((cv) => ({
    cv,
    letter: letters.filter((letter) => letter.forCvId === cv.id).sort(newest)[0] ?? null,
  }))
  const paired = new Set(pairs.flatMap((pair) => (pair.letter ? [pair.letter.id] : [])))
  // a letter without its CV, or a second one for a CV, still shows: nothing is out of reach
  return { pairs, loose: letters.filter((letter) => !paired.has(letter.id)) }
}

type OfferGroup = {
  key: string
  target: NonNullable<CvRow["target"]>
  rows: CvRow[]
  /** The newest change to any of its documents */
  updatedAt: number
}

/** Tailored documents grouped by offer, CV before letter, the offer worked on last first. */
function byOffer(rows: CvRow[]): OfferGroup[] {
  const groups = new Map<string, OfferGroup>()
  for (const row of rows) {
    if (!row.target) continue
    const key = row.target.jobId ?? row.id
    const group = groups.get(key) ?? { key, target: row.target, rows: [], updatedAt: 0 }
    group.rows.push(row)
    group.updatedAt = Math.max(group.updatedAt, new Date(row.updatedAt).getTime())
    groups.set(key, group)
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: group.rows.sort(
        (a, b) => Number(a.docType === "LETTER") - Number(b.docType === "LETTER")
      ),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Lower case without Polish accents, so "lodz" finds "Łódź". */
function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/** Above this many offers the tab gets a search field. */
const SEARCH_FROM = 4

/** What the offers of the tailored documents are at: their application and whether they closed. */
export type OfferState = { applicationId: string | null; status: string | null; closed: boolean }

/**
 * My CV in two tabs: the general CVs everything starts from, each with its letter, and the CVs
 * and letters written for one offer, grouped by offer. `after`: /setup mid-checklist; an uploaded
 * PDF needs no editing, so the step ends there.
 */
export function CvList({
  signedIn,
  initial,
  tab = "general",
  offers = {},
  after = null,
}: {
  signedIn: boolean
  initial: CvRow[]
  tab?: "general" | "offers"
  /** By offer id, for the documents written for it */
  offers?: Record<string, OfferState>
  after?: string | null
}) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const router = useRouter()
  const [rows, setRows] = useState<CvRow[]>(initial)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<CvRow | null>(null)
  /** Deleting a general CV deletes its letter too, unless the person unticks it */
  const [withLetter, setWithLetter] = useState(true)
  const [query, setQuery] = useState("")
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
    const paired = Boolean(letterOf(row))
    await act(async () => {
      const next = await invoke(duplicateCvDocument, { id: row.id })
      if (next) setRows(next)
      toast.show({ message: t(paired ? "cvt.toast.pairDuplicated" : "cv.toast.duplicated") })
    })
  }

  /** The general letter of a general CV; null for anything else */
  function letterOf(row: CvRow): CvRow | null {
    if (row.target || row.docType !== "CV") return null
    return byCv(rows).pairs.find((pair) => pair.cv.id === row.id)?.letter ?? null
  }

  function askDelete(row: CvRow) {
    setWithLetter(true)
    setConfirm(row)
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
    const letter = row.docType === "LETTER"
    const both = withLetter && Boolean(letterOf(row))
    await act(async () => {
      const next = await invoke(deleteCvDocument, { id: row.id, withLetter: both })
      if (next) setRows(next)
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

  async function addLetter(cv: CvRow, input: { from: "write" | "text" | "blank"; text?: string }) {
    return invoke(createGeneralLetter, { cvId: cv.id, ...input })
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

  return (
    <Dropzone onFile={(file) => void uploadPdf(file)} className="cvl" overClassName="is-over">
      {(openPdfPicker) => (
        <div className="stack">
          {tab === "general" ? (
            <>
              <div className="cvl-actions">
                <div className="rel">
                  <Button
                    id={NEW_CV_ANCHOR}
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
                        onClick={() => {
                          newMenu.setOpen(false)
                          setDescribing(true)
                        }}
                      >
                        <PenLine aria-hidden />
                        {t("cv.new.describe")}
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

              <p className="t-sm muted">{t("cvt.general.sub")}</p>
              {!rows.some((row) => !row.target && row.docType === "CV") ? (
                <EmptyState
                  icon={<FileText />}
                  title={t("cv.empty.title")}
                  body={t("cv.empty.body")}
                >
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
              ) : null}
              <GeneralTab
                {...byCv(rows)}
                making={making}
                onMakeEditable={(row) => void makeEditable(row)}
                onAddLetter={addLetter}
                onOpen={(id) => router.push(`/cv/${id}`)}
                onDownload={(row) => void download(row)}
                onDuplicate={(row) => void duplicate(row)}
                onDefault={(row) => void makeDefault(row)}
                onDelete={askDelete}
              />
              {rows.length > 0 ? <p className="t-caption muted">{t("cv.drop")}</p> : null}
            </>
          ) : rows.some((row) => row.target) ? (
            <OffersTab
              groups={byOffer(rows)}
              offers={offers}
              query={query}
              onQuery={setQuery}
              onDownload={(row) => void download(row)}
              onDuplicate={(row) => void duplicate(row)}
              onDefault={(row) => void makeDefault(row)}
              onDelete={askDelete}
            />
          ) : (
            <EmptyState
              icon={<BriefcaseBusiness />}
              title={t("cvt.offers.empty.title")}
              body={t("cvt.offers.empty.body")}
            >
              <ButtonLink href="/offers" variant="primary" icon={<BriefcaseBusiness />}>
                {t("cvt.offers.add")}
              </ButtonLink>
            </EmptyState>
          )}

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
          <DescribeCv open={describing} onClose={() => setDescribing(false)} />
        </div>
      )}
    </Dropzone>
  )
}

type RowActions = {
  onDownload: (row: CvRow) => void
  onDuplicate: (row: CvRow) => void
  onDefault: (row: CvRow) => void
  onDelete: (row: CvRow) => void
}

/**
 * "General": one card per general CV, the default first. The card names the CV; inside, the CV
 * and its letter as rows, and a row to add the letter when there is none. Letters whose CV was
 * deleted get a card of their own at the end.
 */
function GeneralTab({
  pairs,
  loose,
  making,
  onMakeEditable,
  onAddLetter,
  onOpen,
  ...actions
}: {
  pairs: Pair[]
  loose: CvRow[]
  /** The uploaded PDF being made editable */
  making: string | null
  onMakeEditable: (row: CvRow) => void
  onAddLetter: (
    cv: CvRow,
    input: { from: "write" | "text" | "blank"; text?: string }
  ) => Promise<{ id: string } | null | undefined>
  onOpen: (id: string) => void
} & RowActions) {
  const { t } = useCopy()
  if (!pairs.length && !loose.length) return null
  const rowActions = (row: CvRow) => ({
    onDownload: () => actions.onDownload(row),
    onDuplicate: () => actions.onDuplicate(row),
    onDefault: () => actions.onDefault(row),
    onDelete: () => actions.onDelete(row),
  })
  return (
    <div className="cvo-list">
      {pairs.map(({ cv, letter }) => (
        <section key={cv.id} className="card cvo-card" aria-label={cv.title}>
          <header className="cvo-card__head">
            <div className="cvo-card__offer">
              <h3 className="cvo-card__title">
                <Link href={`/cv/${cv.id}`}>{cv.title}</Link>
              </h3>
            </div>
            {cv.isDefault ? (
              <div className="cvo-card__state">
                <Badge tone="primary" icon={<Star fill="currentColor" />}>
                  {t("cv.default")}
                </Badge>
              </div>
            ) : null}
          </header>
          <ul className="cvl-list cvl-list--inner" role="list">
            <DocRow
              row={cv}
              label={t("tl.bar.cv")}
              making={making === cv.id}
              onMakeEditable={() => onMakeEditable(cv)}
              {...rowActions(cv)}
            />
            {letter ? (
              <DocRow row={letter} label={t("tl.bar.letter")} {...rowActions(letter)} />
            ) : (
              <li className="cvl-row cvl-row--missing">
                <span className="cvl-row__icon" aria-hidden>
                  <Mail />
                </span>
                <div className="cvl-row__main">
                  <span className="cvl-row__title">{t("tl.bar.letter")}</span>
                  <span className="cvl-row__meta">{t("cvt.letter.noneGeneral")}</span>
                </div>
                <div className="cvl-row__actions">
                  <AddLetter create={(input) => onAddLetter(cv, input)} onCreated={onOpen} />
                </div>
              </li>
            )}
          </ul>
        </section>
      ))}
      {loose.length ? (
        <section className="card cvo-card" aria-label={t("cvt.loose")}>
          <header className="cvo-card__head">
            <div className="cvo-card__offer">
              <h3 className="cvo-card__title">{t("cvt.loose")}</h3>
              <p className="t-sm muted">{t("cvt.loose.sub")}</p>
            </div>
          </header>
          <ul className="cvl-list cvl-list--inner" role="list">
            {loose.map((letter) => (
              <DocRow key={letter.id} row={letter} {...rowActions(letter)} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/**
 * "For offers": one card per offer, the one worked on last first. The card says which offer and
 * where its application is; inside, the CV and the letter as rows, and a row to write the letter
 * when there is none yet.
 */
function OffersTab({
  groups,
  offers,
  query,
  onQuery,
  ...actions
}: {
  groups: OfferGroup[]
  offers: Record<string, OfferState>
  query: string
  onQuery: (query: string) => void
} & RowActions) {
  const { t, locale } = useCopy()
  const words = fold(query).split(/\s+/).filter(Boolean)
  const shown = words.length
    ? groups.filter((group) => {
        const text = fold(`${group.target.company} ${group.target.title}`)
        return words.every((word) => text.includes(word))
      })
    : groups
  return (
    <>
      <p className="t-sm muted">{t("cvt.offers.sub")}</p>
      {groups.length >= SEARCH_FROM ? (
        <label className="cvo-search">
          <Search aria-hidden />
          <input
            className="input"
            type="search"
            value={query}
            placeholder={t("cvt.search")}
            aria-label={t("cvt.search")}
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>
      ) : null}
      {shown.length ? (
        <div className="cvo-list">
          {shown.map((group) => {
            const jobId = group.target.jobId
            const offer = jobId ? offers[jobId] : undefined
            const cv = group.rows.find((row) => row.docType === "CV")
            const letter = group.rows.find((row) => row.docType === "LETTER")
            const closed = offer?.closed || !jobId
            return (
              <section
                key={group.key}
                className="card cvo-card"
                aria-label={`${group.target.title} · ${group.target.company}`}
              >
                <header className="cvo-card__head">
                  <div className="cvo-card__offer">
                    <h3 className="cvo-card__title">
                      {jobId ? (
                        <Link href={`/offers/${jobId}`}>{group.target.title}</Link>
                      ) : (
                        group.target.title
                      )}
                    </h3>
                    <p className="t-sm muted">{group.target.company}</p>
                  </div>
                  <div className="cvo-card__state">
                    {closed ? <Badge tone="warning">{t("of.closed")}</Badge> : null}
                    {offer?.status && offer.applicationId ? (
                      <Link
                        className="status-pill cvo-card__status"
                        data-tone={statusTone(offer.status)}
                        href={`/applications?id=${offer.applicationId}`}
                        title={t("ow.app.open")}
                      >
                        {statusLabel(offer.status, locale)}
                      </Link>
                    ) : (
                      <span className="status-pill" data-tone="muted">
                        {t("cvt.noApp")}
                      </span>
                    )}
                  </div>
                </header>
                <ul className="cvl-list cvl-list--inner" role="list">
                  {group.rows.map((row) => (
                    <DocRow
                      key={row.id}
                      row={row}
                      label={t(row.docType === "LETTER" ? "tl.bar.letter" : "tl.bar.cv")}
                      onDownload={() => actions.onDownload(row)}
                      onDuplicate={() => actions.onDuplicate(row)}
                      onDefault={() => actions.onDefault(row)}
                      onDelete={() => actions.onDelete(row)}
                    />
                  ))}
                  {cv && !letter && jobId ? (
                    <li className="cvl-row cvl-row--missing">
                      <span className="cvl-row__icon" aria-hidden>
                        <Mail />
                      </span>
                      <div className="cvl-row__main">
                        <span className="cvl-row__title">{t("tl.bar.letter")}</span>
                        <span className="cvl-row__meta">{t("cvt.letter.none")}</span>
                      </div>
                      <div className="cvl-row__actions">
                        <ButtonLink
                          href={`/offers/${jobId}`}
                          size="sm"
                          variant="ghost"
                          icon={<Plus />}
                        >
                          {t("cvt.letter.write")}
                        </ButtonLink>
                      </div>
                    </li>
                  ) : null}
                </ul>
              </section>
            )
          })}
        </div>
      ) : (
        <p className="muted cvo-empty">{t("cvt.noMatch", { q: query.trim() })}</p>
      )}
    </>
  )
}

/**
 * One CV or letter as a row: what it is, its language and last change, then Edit, PDF and the
 * rest in a menu. Only what is not the usual shows as a badge: the default CV (on its card when
 * it has one) and an uploaded PDF.
 */
function DocRow({
  row,
  label,
  making = false,
  onMakeEditable,
  onDownload,
  onDuplicate,
  onDefault,
  onDelete,
}: {
  row: CvRow
  /** Shown instead of the title, where the offer above already names it */
  label?: string
  /** An uploaded PDF: "Utwórz wersję do edycji" in place of Edit, and whether it is running */
  making?: boolean
  onMakeEditable?: () => void
  onDownload: () => void
  onDuplicate: () => void
  onDefault: () => void
  onDelete: () => void
}) {
  const { t } = useCopy()
  const menu = useMenu()
  const uploaded = row.kind === "UPLOADED"
  const letter = row.docType === "LETTER"
  const name = label ?? row.title
  return (
    <li className="cvl-row">
      <span className={`cvl-row__icon${uploaded ? " cvl-row__icon--pdf" : ""}`} aria-hidden>
        {letter ? <Mail /> : <FileText />}
      </span>
      <div className="cvl-row__main">
        <span className="cvl-row__name">
          <Link className="cvl-row__title" href={`/cv/${row.id}`}>
            {name}
          </Link>
          {row.isDefault && !label ? (
            <Badge tone="primary" icon={<Star fill="currentColor" />}>
              {t("cv.default")}
            </Badge>
          ) : null}
          {uploaded ? <Badge tone="plain">{t("cv.kind.pdf")}</Badge> : null}
        </span>
        <span className="cvl-row__meta">
          {uploaded ? (
            // the language an upload is stored with is the interface's, not the CV's
            t("cv.up.row", { when: relativeTime(row.updatedAt, t) ?? "" })
          ) : (
            <>
              {t(row.language === "en" ? "cv.lang.en" : "cv.lang.pl")} ·{" "}
              {t("cv.updated", { when: relativeTime(row.updatedAt, t) ?? "" })}
            </>
          )}
          {row.original ? (
            <>
              {" · "}
              <a
                className="link link--quiet"
                href={cvVersionPdfUrl(row.id, row.original.versionId)}
                aria-label={t("cv.up.originalOf", { name: row.original.name })}
                download
              >
                {t("cv.up.original", { name: row.original.name })}
              </a>
            </>
          ) : null}
        </span>
      </div>
      <div className="cvl-row__actions">
        {uploaded && onMakeEditable ? (
          <Button
            size="sm"
            variant="outline"
            icon={<Wand2 />}
            loading={making}
            onClick={onMakeEditable}
          >
            {t(making ? "cv.up.making" : "cv.up.make")}
          </Button>
        ) : (
          <ButtonLink href={`/cv/${row.id}`} size="sm" variant="outline" icon={<Pencil />}>
            {t(uploaded ? "cv.act.open" : "cv.act.edit")}
          </ButtonLink>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={<Download />}
          aria-label={t("cvt.pdfOf", { title: name })}
          title={t("cv.act.download")}
          onClick={onDownload}
        >
          {t("cvt.pdf")}
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
              {row.isDefault || row.target || letter ? null : (
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
              {letter ? null : <div className="menu__sep" />}
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
