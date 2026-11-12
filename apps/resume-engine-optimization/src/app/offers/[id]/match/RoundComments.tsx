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
import { invoke } from "src/app/rpc"
import { FilePlus2, MessageSquarePlus, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import { commentId, type MatchComment, type MatchCommentKind } from "@newrole/cv-core/match"
import { useCopy } from "src/app/i18n/Locale"
import { pluralKind, type CopyKey } from "src/app/i18n/copy"
import saveMatchComment from "src/app/offers/mutations/saveMatchComment"
import { RunDialog, useMatchRun } from "./MatchRun"

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
  /** The title of the general CV a new CV for the offer is written from; null when it is gone */
  general: string | null
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

/** The next round: how many comments it starts from, and the two ways to run it. */
export function RoundActions() {
  const { t, locale } = useCopy()
  const context = useContext(CommentsContext)
  const titleId = useId()
  const run = useMatchRun(context?.round.jobId ?? "")

  if (!context?.round.editable) return null
  const { round, comments, unsaved } = context

  const count = comments.length
  const blocked = unsaved.size > 0 || run.running
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
        <p className="t-sm muted">
          {round.general
            ? t("mt.next.fresh.hint", { title: round.general })
            : t("mt.next.fresh.hintGone")}
        </p>
        {unsaved.size ? (
          <p className="t-sm mt-next__warn" role="status">
            {t("mt.next.dirty")}
          </p>
        ) : null}
        {run.error ? (
          <p className="field__error" role="alert">
            {run.error}
          </p>
        ) : null}
      </div>
      <div className="mt-next__actions">
        <Button
          variant="primary"
          icon={<Sparkles />}
          disabled={blocked}
          onClick={() => void run.start("rewrite")}
        >
          {t("mt.next.rewrite")}
        </Button>
        <Button
          variant="outline"
          icon={<FilePlus2 />}
          disabled={blocked}
          onClick={() => void run.start("fresh")}
        >
          {t("mt.next.fresh")}
        </Button>
        <Button
          variant="outline"
          icon={<RefreshCw />}
          disabled={blocked}
          onClick={() => void run.start("check")}
        >
          {t("mt.next.check")}
        </Button>
      </div>
      <RunDialog open={run.running} number={round.number + 1} steps={run.steps} />
    </section>
  )
}
