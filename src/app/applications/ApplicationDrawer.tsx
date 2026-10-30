"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { invoke } from "@blitzjs/rpc"
import { ExternalLink, Trash2, X } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import type { CopyKey } from "src/app/i18n/copy"
import { Button, ButtonLink } from "src/app/components/ds/Button"
import { Modal, useToast } from "src/app/components/ds/interactive"
import { Banner, Field, Skeleton } from "src/app/components/ds/primitives"
import {
  STAGE_RECORDING_STATUSES,
  statusLabel,
  statusTone,
  type ApplicationStatus,
} from "src/shared/applications"
import type {
  ApplicationDetail,
  ApplicationEventView,
  ApplicationView,
} from "src/server/applications/types"
import getApplication from "./queries/getApplication"
import deleteApplication from "./mutations/deleteApplication"
import updateApplication from "./mutations/updateApplication"
import {
  dateInput,
  daysLabel,
  fromDateInput,
  isOverdue,
  longDate,
  sourceKey,
  toRow,
  type AppRow,
} from "./rows"
import { StatusSelect } from "./StatusSelect"

type Props = {
  id: string | null
  row: AppRow | null
  revision: number
  onClose: () => void
  onSaved: (view: ApplicationView) => void
  onStatus: (row: AppRow, status: ApplicationStatus, stageNote?: string | null) => Promise<void>
  onDeleted: (id: string) => void
}

/** Right-hand drawer for one application (`?id=` in the URL); full screen on phones. */
export function ApplicationDrawer(props: Props) {
  const { t } = useCopy()
  return (
    <Modal
      open={Boolean(props.id)}
      onClose={props.onClose}
      kind="drawer"
      labelledBy="app-drawer-title"
      label={t("app.d.label")}
      className="app-drawer"
    >
      {props.id ? <DrawerBody key={props.id} {...props} id={props.id} /> : null}
    </Modal>
  )
}

type SaveState = "idle" | "saving" | "saved" | "error"

function DrawerBody({
  id,
  row,
  revision,
  onClose,
  onSaved,
  onStatus,
  onDeleted,
}: Props & { id: string }) {
  const { t, locale } = useCopy()
  const toast = useToast()
  const [detail, setDetail] = useState<ApplicationDetail | null>(null)
  const [load, setLoad] = useState<"loading" | "ready" | "error" | "missing">("loading")
  const [form, setForm] = useState({ stage: "", nextStep: "", nextAt: "", contact: "", notes: "" })
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const filled = useRef(false)
  const savedNotes = useRef<string | null>(null)
  const notesTimer = useRef<number | null>(null)
  const pendingNotes = useRef<string | null>(null)

  const fetchDetail = useCallback(
    async (silent: boolean) => {
      if (!silent) setLoad("loading")
      try {
        const next = await invoke(getApplication, { id })
        setDetail(next)
        setLoad("ready")
        if (!filled.current) {
          filled.current = true
          savedNotes.current = next.notes ?? ""
          setForm({
            stage: next.stageNote ?? "",
            nextStep: next.nextStep ?? "",
            nextAt: dateInput(next.nextStepAt ? new Date(next.nextStepAt).toISOString() : null),
            contact: next.contact ?? "",
            notes: next.notes ?? "",
          })
        }
      } catch (error) {
        if (silent) return
        setLoad((error as { name?: string })?.name === "NotFoundError" ? "missing" : "error")
      }
    },
    [id]
  )

  useEffect(() => {
    void fetchDetail(revision > 0 && filled.current)
  }, [fetchDetail, revision])

  const save = useCallback(
    async (patch: {
      stageNote?: string | null
      nextStep?: string | null
      nextStepAt?: Date | null
      contact?: string | null
      notes?: string | null
    }) => {
      setSaveState("saving")
      try {
        const view = await invoke(updateApplication, { id, ...patch })
        onSaved(view)
        setSaveState("saved")
        void fetchDetail(true)
      } catch {
        setSaveState("error")
        toast.show({ message: t("app.err.save"), tone: "danger" })
      }
    },
    [fetchDetail, id, onSaved, t, toast]
  )

  // Notes: autosave 0.8 s after the last keystroke, and flush when the drawer closes.
  useEffect(() => {
    if (!filled.current || form.notes === savedNotes.current) return
    pendingNotes.current = form.notes
    if (notesTimer.current) window.clearTimeout(notesTimer.current)
    notesTimer.current = window.setTimeout(() => {
      notesTimer.current = null
      const value = pendingNotes.current
      pendingNotes.current = null
      if (value == null) return
      savedNotes.current = value
      void save({ notes: value || null })
    }, 800)
  }, [form.notes, save])

  useEffect(
    () => () => {
      if (notesTimer.current) window.clearTimeout(notesTimer.current)
      const value = pendingNotes.current
      if (value != null)
        void invoke(updateApplication, { id, notes: value || null }).then(onSaved, () => {})
    },
    // Flush once, on unmount, with the latest callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const current: AppRow | null = row ?? (detail ? toRow(detail) : null)

  function saveIfChanged(key: "stage" | "contact", stored: string | null | undefined) {
    const value = form[key].trim()
    if (value === (stored ?? "")) return
    void save(key === "stage" ? { stageNote: value || null } : { contact: value || null })
  }

  function saveNext(nextAt = form.nextAt) {
    if (!detail) return
    const step = form.nextStep.trim()
    const at = nextAt ? fromDateInput(nextAt) : null
    const storedAt = dateInput(detail.nextStepAt ? new Date(detail.nextStepAt).toISOString() : null)
    if (step === (detail.nextStep ?? "") && nextAt === storedAt) return
    void save({ nextStep: step || null, nextStepAt: at })
  }

  async function changeStatus(status: ApplicationStatus) {
    if (!current) return
    setForm((value) => ({ ...value, stage: "" }))
    await onStatus(current, status, null)
  }

  async function remove() {
    setDeleting(true)
    try {
      await invoke(deleteApplication, { id })
      pendingNotes.current = null
      onDeleted(id)
    } catch {
      setDeleting(false)
      toast.show({ message: t("app.err.save"), tone: "danger" })
    }
  }

  const head = current ?? detail
  return (
    <>
      <div className="app-drawer__head">
        <div className="stack-sm" style={{ minWidth: 0 }}>
          <h2 className="t-h3" id="app-drawer-title">
            {head ? head.company : t("app.d.label")}
          </h2>
          {head ? <p className="muted t-sm">{head.title}</p> : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("common.close")}
          onClick={onClose}
          icon={<X />}
        />
      </div>

      <div className="app-drawer__body">
        {load === "loading" && !detail ? (
          <div className="stack" aria-busy="true">
            <Skeleton h={40} />
            <Skeleton h={40} />
            <Skeleton h={120} />
            <Skeleton h={80} />
          </div>
        ) : load === "missing" ? (
          <Banner tone="warning" role="alert">
            {t("app.d.notFound")}
          </Banner>
        ) : load === "error" && !detail ? (
          <Banner tone="danger" role="alert">
            <p>{t("app.err.load")}</p>
            <Button size="sm" variant="outline" onClick={() => void fetchDetail(false)}>
              {t("common.retry")}
            </Button>
          </Banner>
        ) : detail && current ? (
          <>
            <section className="app-drawer__sec" aria-labelledby="app-d-status">
              <div className="app-drawer__grid">
                <Field
                  label={<span id="app-d-status">{t("app.d.status")}</span>}
                  htmlFor="app-d-status-select"
                >
                  <StatusSelect
                    id="app-d-status-select"
                    size="lg"
                    value={current.status}
                    onChange={(status) => void changeStatus(status)}
                  />
                </Field>
                <Field label={t("app.d.inStage")}>
                  <span
                    className="t-sm"
                    style={{ lineHeight: "40px" }}
                    title={longDate(current.statusChangedAt, locale)}
                  >
                    {daysLabel(current.statusChangedAt, t)}
                  </span>
                </Field>
              </div>
              {current.closedAtStage &&
              (STAGE_RECORDING_STATUSES as readonly string[]).includes(current.status) ? (
                <p className="t-sm muted">
                  {t(`app.closedAfter.${current.status}` as CopyKey, {
                    stage: statusLabel(current.closedAtStage, locale),
                  })}
                </p>
              ) : null}
              <Field label={t("app.d.stage")} htmlFor="app-d-stage">
                <input
                  id="app-d-stage"
                  className="input"
                  value={form.stage}
                  maxLength={160}
                  placeholder={t("app.d.stagePh")}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, stage: event.target.value }))
                  }
                  onBlur={() => saveIfChanged("stage", detail.stageNote)}
                  onKeyDown={(event) =>
                    event.key === "Enter" && saveIfChanged("stage", detail.stageNote)
                  }
                />
              </Field>
            </section>

            <section className="app-drawer__sec" aria-labelledby="app-d-next">
              <h3 id="app-d-next">{t("app.d.next")}</h3>
              <div className="app-drawer__grid">
                <Field
                  label={<span className="sr-only">{t("app.d.next")}</span>}
                  htmlFor="app-d-next-text"
                >
                  <input
                    id="app-d-next-text"
                    className="input"
                    value={form.nextStep}
                    maxLength={300}
                    placeholder={t("app.d.nextPh")}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, nextStep: event.target.value }))
                    }
                    onBlur={() => saveNext()}
                    onKeyDown={(event) => event.key === "Enter" && saveNext()}
                  />
                </Field>
                <Field
                  label={<span className="sr-only">{t("app.d.nextAt")}</span>}
                  htmlFor="app-d-next-at"
                >
                  <input
                    id="app-d-next-at"
                    type="date"
                    className="input"
                    aria-label={t("app.d.nextAt")}
                    aria-invalid={isOverdue(current) || undefined}
                    style={isOverdue(current) ? { borderColor: "var(--danger)" } : undefined}
                    value={form.nextAt}
                    onChange={(event) => {
                      const nextAt = event.target.value
                      setForm((value) => ({ ...value, nextAt }))
                      saveNext(nextAt)
                    }}
                  />
                </Field>
              </div>
              {isOverdue(current) ? (
                <p className="t-sm" style={{ color: "var(--danger)" }}>
                  {t("app.overdue")}
                </p>
              ) : null}
            </section>

            <section className="app-drawer__sec">
              <Field label={t("app.d.contact")} htmlFor="app-d-contact">
                <input
                  id="app-d-contact"
                  className="input"
                  value={form.contact}
                  maxLength={500}
                  placeholder={t("app.d.contactPh")}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, contact: event.target.value }))
                  }
                  onBlur={() => saveIfChanged("contact", detail.contact)}
                />
              </Field>
              <Field label={t("app.d.notes")} htmlFor="app-d-notes">
                <textarea
                  id="app-d-notes"
                  className="textarea"
                  rows={6}
                  value={form.notes}
                  maxLength={20_000}
                  placeholder={t("app.d.notesPh")}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, notes: event.target.value }))
                  }
                />
              </Field>
              <p
                className={`save-state${saveState === "error" ? " is-error" : ""}`}
                aria-live="polite"
              >
                {saveState === "saving"
                  ? t("app.d.saving")
                  : saveState === "saved"
                  ? t("app.d.saved")
                  : saveState === "error"
                  ? t("app.err.save")
                  : ""}
              </p>
            </section>

            <section className="app-drawer__sec" aria-labelledby="app-d-details">
              <h3 id="app-d-details">{t("app.d.details")}</h3>
              <dl className="app-facts">
                <dt>{t("app.d.applied")}</dt>
                <dd>{longDate(current.appliedAt, locale)}</dd>
                {current.location ? (
                  <>
                    <dt>{t("app.d.location")}</dt>
                    <dd>{current.location}</dd>
                  </>
                ) : null}
                {current.salaryText ? (
                  <>
                    <dt>{t("app.d.salary")}</dt>
                    <dd>{current.salaryText}</dd>
                  </>
                ) : null}
                <dt>{t("app.d.source")}</dt>
                <dd>{t(sourceKey(current.source))}</dd>
                <dt>{t("app.d.cv")}</dt>
                <dd>
                  {detail.cv ? (
                    <Link className="link" href={`/cv/${detail.cv.id}`}>
                      {detail.cv.title}
                    </Link>
                  ) : (
                    <span className="muted">{t("app.d.cvNone")}</span>
                  )}
                </dd>
              </dl>
              {current.url ? (
                <div>
                  <ButtonLink
                    href={current.url}
                    external
                    variant="outline"
                    size="sm"
                    iconRight={<ExternalLink />}
                  >
                    {t("app.openOffer")}
                  </ButtonLink>
                </div>
              ) : null}
            </section>

            <section className="app-drawer__sec" aria-labelledby="app-d-timeline">
              <h3 id="app-d-timeline">{t("app.d.timeline")}</h3>
              <ol className="timeline">
                {[...detail.events].reverse().map((event) => (
                  <TimelineItem key={event.id} event={event} />
                ))}
              </ol>
            </section>

            <section className="app-drawer__sec" aria-labelledby="app-d-answers">
              <h3 id="app-d-answers">{t("app.d.answers")}</h3>
              {detail.answers.length ? (
                <ul className="answer-list">
                  {detail.answers.map((answer) => (
                    <li key={answer.id} className="card card--soft">
                      <strong>{answer.question}</strong>
                      <p>{answer.answer}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-sm muted">{t("app.d.answersEmpty")}</p>
              )}
            </section>

            <div className="app-drawer__foot">
              {confirming ? (
                <div
                  className="stack-sm"
                  role="group"
                  aria-labelledby="app-d-delete-title"
                  style={{ width: "100%" }}
                >
                  <p className="t-sm" id="app-d-delete-title">
                    <strong>{t("app.d.deleteTitle")}</strong> {t("app.d.deleteBody")}
                  </p>
                  <div className="row">
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Trash2 />}
                      loading={deleting}
                      autoFocus
                      onClick={() => void remove()}
                    >
                      {t("app.d.delete")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="danger-ghost"
                  size="sm"
                  icon={<Trash2 />}
                  onClick={() => setConfirming(true)}
                >
                  {t("app.d.delete")}
                </Button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}

function TimelineItem({ event }: { event: ApplicationEventView }) {
  const { t, locale } = useCopy()
  const label = (status: string | null) => (status ? statusLabel(status, locale) : "—")
  let title: string
  let note = event.note
  switch (event.type) {
    case "created":
      title = t("app.ev.created", { status: label(event.toStatus) })
      break
    case "status":
      title = t("app.ev.status", { from: label(event.fromStatus), to: label(event.toStatus) })
      break
    case "note":
      title = t("app.ev.note")
      break
    case "next-step":
      title = event.note ? t("app.ev.next") : t("app.ev.nextCleared")
      break
    case "answers":
      title = t("app.ev.answers")
      break
    default: {
      const fields = (event.note ?? "")
        .split(",")
        .map((field) => field.trim())
        .filter(Boolean)
        .map((field) => {
          const key = `app.field.${field}` as CopyKey
          const text = t(key)
          return text === undefined ? field : text
        })
      title = t("app.ev.edit", { fields: fields.join(", ") })
      note = null
    }
  }
  const tone =
    event.type === "status" || event.type === "created"
      ? statusTone(event.toStatus ?? "")
      : undefined
  return (
    <li className="timeline__item" data-tone={tone}>
      <span>{title}</span>
      {note ? <span className="timeline__note">{note}</span> : null}
      <span className="timeline__meta">
        <time dateTime={new Date(event.at).toISOString()}>{longDate(event.at, locale, true)}</time>
        {" · "}
        {t(`app.ev.via.${event.channel}` as CopyKey)}
      </span>
    </li>
  )
}
