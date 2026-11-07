"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { invoke } from "@blitzjs/rpc"
import {
  Check,
  Circle,
  CircleAlert,
  LoaderCircle,
  MessageSquarePlus,
  Minus,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { Modal, useToast } from "@newrole/ui/interactive"
import { commentId, type MatchComment, type MatchCommentKind } from "@newrole/cv-core/match"
import { TAILOR_STEPS, type StepState, type StepUpdate } from "@newrole/cv-core/progress"
import { STATE_KEY, STEP_KEYS, stepLine } from "@newrole/cv-editor/steps"
import { tailorErrorKey } from "@newrole/cv-editor/tailor-errors"
import { useCopy } from "src/app/i18n/Locale"
import { pluralKind, type CopyKey } from "src/app/i18n/copy"
import getTailorProgress from "src/app/cv/queries/getTailorProgress"
import runMatchRound from "src/app/offers/mutations/runMatchRound"
import saveMatchComment from "src/app/offers/mutations/saveMatchComment"

/**
 * The person's comments on one round of the match, and the next round they start. Comments are
 * saved one by one on the round as they are written; the next round turns them into facts about
 * the person and works from them (src/server/cv/tailor.ts, nextMatchRound).
 */

export type RoundInfo = {
  cvId: string
  jobId: string
  number: number
  /** Only the newest round takes comments and starts the next one */
  editable: boolean
}

type Context = {
  round: RoundInfo
  comments: MatchComment[]
  /** The round before's comments, shown under the points they were on */
  previous: { number: number; comments: MatchComment[] } | null
  save: (input: {
    kind: MatchCommentKind
    point: string
    subject: string
    text: string
  }) => Promise<boolean>
  /** Comment boxes open with text that is not saved */
  unsaved: ReadonlySet<string>
  markUnsaved: (id: string, unsaved: boolean) => void
}

const CommentsContext = createContext<Context | null>(null)

const PLACEHOLDER: Record<MatchCommentKind, CopyKey> = {
  requirement: "mt.c.ph.requirement",
  keyword: "mt.c.ph.keyword",
  question: "mt.c.ph.question",
  unverified: "mt.c.ph.unverified",
}

/** How often the dialog asks for the run's steps while it waits. */
const POLL_MS = 1000

/** A run's id, unique enough to follow one run of one person. */
function newRunId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function RoundComments({
  round,
  initial,
  previous,
  children,
}: {
  round: RoundInfo
  initial: MatchComment[]
  previous: { number: number; comments: MatchComment[] } | null
  children: ReactNode
}) {
  const { t } = useCopy()
  const toast = useToast()
  const [comments, setComments] = useState(initial)
  const [unsaved, setUnsaved] = useState<ReadonlySet<string>>(() => new Set())

  const markUnsaved = useCallback((id: string, on: boolean) => {
    setUnsaved((current) => {
      if (current.has(id) === on) return current
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const save = useCallback<Context["save"]>(
    async ({ kind, point, subject, text }) => {
      try {
        const next = await invoke(saveMatchComment, {
          cvId: round.cvId,
          round: round.number,
          kind,
          key: point,
          subject,
          text,
        })
        if (next) setComments(next)
        return true
      } catch (error) {
        const closed = error instanceof Error && error.message === "conflict"
        toast.show({ message: t(closed ? "mt.c.err.closed" : "mt.c.err.save"), tone: "danger" })
        return false
      }
    },
    [round.cvId, round.number, t, toast]
  )

  const value = useMemo(
    () => ({ round, comments, previous, save, unsaved, markUnsaved }),
    [round, comments, previous, save, unsaved, markUnsaved]
  )
  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>
}

/** The comment on one point of the round: add, edit or remove it while the round is the newest. */
export function CommentBox({
  kind,
  point,
  subject,
}: {
  kind: MatchCommentKind
  /** The point within its kind: a requirement's id, the keyword, the bullet, the term */
  point: string
  /** The point as the round shows it */
  subject: string
}) {
  const { t } = useCopy()
  const context = useContext(CommentsContext)
  const id = commentId({ kind, key: point })
  const saved = context?.comments.find((comment) => commentId(comment) === id) ?? null
  const earlier = context?.previous?.comments.find((comment) => commentId(comment) === id) ?? null
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const fieldId = useId()
  const hintId = useId()
  const markUnsaved = context?.markUnsaved

  const pending = open && text.trim() !== (saved?.text ?? "")
  useEffect(() => {
    markUnsaved?.(id, pending)
  }, [markUnsaved, id, pending])
  useEffect(() => () => markUnsaved?.(id, false), [markUnsaved, id])
  useEffect(() => {
    if (open) field.current?.focus()
  }, [open])

  if (!context) return null
  const { round, save } = context

  async function submit(value: string) {
    setBusy(true)
    const done = await save({ kind, point, subject, text: value })
    setBusy(false)
    if (done) setOpen(false)
  }

  function edit(value: string) {
    setText(value)
    setOpen(true)
  }

  return (
    <div className="mt-comment">
      {earlier && context.previous ? (
        <p className="mt-comment__earlier t-sm">
          <span className="t-caption muted">
            {t("mt.c.previous", { n: context.previous.number })}
          </span>
          <span>{earlier.text}</span>
        </p>
      ) : null}
      {open ? (
        <form
          className="mt-comment__form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit(text)
          }}
        >
          <label className="sr-only" htmlFor={fieldId}>
            {t("mt.c.label")}
          </label>
          <textarea
            ref={field}
            id={fieldId}
            className="textarea"
            rows={3}
            maxLength={2000}
            value={text}
            placeholder={t(PLACEHOLDER[kind])}
            aria-describedby={hintId}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void submit(text)
              }
              if (event.key === "Escape") setOpen(false)
            }}
          />
          <p className="t-caption muted" id={hintId}>
            {t("mt.c.hint")}
          </p>
          <div className="mt-comment__actions">
            <Button
              type="submit"
              size="sm"
              variant="primary"
              loading={busy}
              disabled={!text.trim() && !saved}
            >
              {t("mt.c.save")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t("mt.c.cancel")}
            </Button>
          </div>
        </form>
      ) : saved ? (
        <div className="mt-comment__saved">
          <span className="t-caption muted">{t("mt.c.label")}</span>
          <p>{saved.text}</p>
          {round.editable ? (
            <div className="mt-comment__actions">
              <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => edit(saved.text)}>
                {t("mt.c.edit")}
              </Button>
              <Button
                size="sm"
                variant="danger-ghost"
                icon={<Trash2 />}
                loading={busy}
                onClick={() => void submit("")}
              >
                {t("mt.c.remove")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : round.editable ? (
        <Button size="sm" variant="ghost" icon={<MessageSquarePlus />} onClick={() => edit("")}>
          {t(kind === "question" ? "mt.c.answer" : "mt.c.add")}
        </Button>
      ) : null}
    </div>
  )
}

function StepIcon({ state }: { state: StepState | "waiting" }) {
  if (state === "running") return <LoaderCircle className="spin" aria-hidden />
  if (state === "done") return <Check aria-hidden />
  if (state === "failed") return <CircleAlert aria-hidden />
  if (state === "skipped") return <Minus aria-hidden />
  return <Circle aria-hidden />
}

/** The next round: how many comments it starts from, and the two ways to run it. */
export function RoundActions() {
  const { t, locale } = useCopy()
  const context = useContext(CommentsContext)
  const router = useRouter()
  const titleId = useId()
  const dialogTitleId = useId()
  const [runId, setRunId] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepUpdate[]>([])
  const [error, setError] = useState<string | null>(null)

  // the run's steps, read while its request runs; a failed read waits for the next one
  useEffect(() => {
    if (!runId) return
    let live = true
    const read = () =>
      invoke(getTailorProgress, { runId })
        .then((found) => live && found && setSteps(found.steps))
        .catch(() => undefined)
    void read()
    const timer = window.setInterval(read, POLL_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [runId])

  if (!context?.round.editable) return null
  const { round, comments, unsaved } = context

  async function start(rewrite: boolean) {
    const run = newRunId()
    setError(null)
    setSteps([])
    setRunId(run)
    try {
      await invoke(runMatchRound, { jobId: round.jobId, rewrite, locale, runId: run })
      router.replace(`/offers/${round.jobId}/match`)
      router.refresh()
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : ""
      setError(t(code === "no-content" ? "mt.next.err.noMatch" : tailorErrorKey(failure)))
      setRunId(null)
    }
  }

  const count = comments.length
  const blocked = unsaved.size > 0 || Boolean(runId)
  return (
    <section className="mt-next" aria-labelledby={titleId}>
      <div className="mt-next__text">
        <h2 className="t-label" id={titleId}>
          {t("mt.next.title")}
        </h2>
        <p className="mt-next__count">
          {count
            ? t(`mt.next.count.${pluralKind(count, locale)}` as CopyKey, { n: count })
            : t("mt.next.none")}
        </p>
        <p className="t-sm muted">{t("mt.next.hint")}</p>
        {unsaved.size ? (
          <p className="t-sm mt-next__warn" role="status">
            {t("mt.next.dirty")}
          </p>
        ) : null}
        {error ? (
          <p className="field__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="mt-next__actions">
        <Button
          variant="primary"
          icon={<Sparkles />}
          disabled={blocked}
          onClick={() => void start(true)}
        >
          {t("mt.next.rewrite")}
        </Button>
        <Button
          variant="outline"
          icon={<RefreshCw />}
          disabled={blocked}
          onClick={() => void start(false)}
        >
          {t("mt.next.check")}
        </Button>
      </div>

      <Modal open={Boolean(runId)} onClose={() => undefined} labelledBy={dialogTitleId}>
        <div className="modal__head">
          <h2 className="t-h3" id={dialogTitleId}>
            {t("mt.next.running", { n: round.number + 1 })}
          </h2>
        </div>
        <div className="modal__body stack-sm">
          <ol className="cvt-run" aria-live="polite">
            {TAILOR_STEPS.map((step) => {
              const update = steps.find((entry) => entry.step === step)
              const state = update?.state ?? "waiting"
              return (
                <li
                  key={step}
                  className="cvt-run__step"
                  data-state={state}
                  aria-current={state === "running" ? "step" : undefined}
                >
                  <StepIcon state={state} />
                  <div>
                    <strong>
                      {t(STEP_KEYS[step].label)}
                      <span className="sr-only">: {t(STATE_KEY[state])}</span>
                    </strong>
                    <span className="t-sm muted">{stepLine(t, update, step)}</span>
                  </div>
                </li>
              )
            })}
          </ol>
          <p className="t-sm muted">{t("mt.next.wait")}</p>
        </div>
      </Modal>
    </section>
  )
}
