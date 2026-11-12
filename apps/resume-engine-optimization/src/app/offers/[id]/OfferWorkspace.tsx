"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { invoke } from "src/app/rpc"
import {
  ClipboardList,
  ExternalLink,
  FileText,
  Mail,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Gauge,
} from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { Modal, ModalHead, useToast } from "@newrole/ui/interactive"
import { Badge, Banner } from "@newrole/ui/primitives"
import { relativeTime } from "@newrole/ui/time"
import { statusLabel, TO_APPLY_PATH } from "src/shared/applications"
import type { OfferDetail } from "src/server/offers/service"
import createApplication from "src/app/applications/mutations/createApplication"
import deleteCvDocument from "src/app/cv/mutations/deleteCvDocument"
import generateCoverLetter from "src/app/cv/mutations/generateCoverLetter"
import refreshOfferText from "../mutations/refreshOfferText"
import removeOffer from "../mutations/removeOffer"
import updateOffer from "../mutations/updateOffer"
import { HiringConfidenceCard } from "../HiringConfidenceCard"

const WORKPLACE = {
  REMOTE: "oa.workplace.remote",
  HYBRID: "oa.workplace.hybrid",
  ONSITE: "oa.workplace.onsite",
} as const

/** A text this long is shown folded until the person opens it. */
const FOLD_CHARS = 1600

export function OfferWorkspace({ offer }: { offer: OfferDetail }) {
  const { t, locale } = useCopy()
  const id = useId()
  const router = useRouter()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(offer.text ?? "")
  const [note, setNote] = useState(offer.note ?? "")
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<
    null | "text" | "refresh" | "note" | "app" | "remove" | "letter" | "doc"
  >(null)
  const [confirm, setConfirm] = useState(false)
  /** The document written for the offer the person is asked about deleting */
  const [doomed, setDoomed] = useState<null | "cv" | "letter">(null)

  async function run(kind: NonNullable<typeof busy>, work: () => Promise<void>) {
    setBusy(kind)
    try {
      await work()
    } catch {
      toast.show({ message: t("ow.err"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  const saveText = () =>
    run("text", async () => {
      await invoke(updateOffer, { jobId: offer.jobId, text: text.trim() || null })
      setEditing(false)
      toast.show({ message: t("ow.saved") })
      router.refresh()
    })

  const refresh = () =>
    run("refresh", async () => {
      const { result } = await invoke(refreshOfferText, { jobId: offer.jobId })
      toast.show({
        message:
          result === "kept"
            ? t("ow.text.refreshed")
            : result === "board"
              ? t("ow.text.board")
              : t("ow.text.refreshFail"),
        tone: result === "failed" ? "danger" : undefined,
        ...(result === "board" ? { duration: 10_000 } : {}),
      })
      if (result === "kept") router.refresh()
    })

  const saveNote = () =>
    run("note", async () => {
      await invoke(updateOffer, { jobId: offer.jobId, note: note.trim() || null })
      toast.show({ message: t("ow.saved") })
      router.refresh()
    })

  const track = () =>
    run("app", async () => {
      await invoke(createApplication, {
        jobId: offer.jobId,
        url: offer.url,
        company: offer.company,
        title: offer.title,
        location: offer.location,
        salaryText: offer.salary,
        status: "APPLIED",
      })
      toast.show({ message: t("ow.app.added") })
      router.refresh()
    })

  const writeLetter = () =>
    run("letter", async () => {
      const letter = await invoke(generateCoverLetter, { jobId: offer.jobId })
      if (!letter) throw new Error("no letter")
      router.push(`/cv/${letter.id}`)
    })

  const removeDoc = () =>
    run("doc", async () => {
      const documentId = doomed === "cv" ? offer.cvId : offer.letterId
      if (!doomed || !documentId) return
      await invoke(deleteCvDocument, { id: documentId })
      toast.show({ message: t(doomed === "cv" ? "ow.docs.removedCv" : "ow.docs.removedLetter") })
      setDoomed(null)
      router.refresh()
    })

  const remove = () =>
    run("remove", async () => {
      await invoke(removeOffer, { jobId: offer.jobId })
      toast.show({ message: t("ow.removed") })
      router.push(TO_APPLY_PATH)
    })

  const workplace =
    offer.workplace in WORKPLACE ? t(WORKPLACE[offer.workplace as keyof typeof WORKPLACE]) : null
  const long = (offer.text?.length ?? 0) > FOLD_CHARS
  const when = relativeTime(offer.textReadAt, t) ?? ""

  return (
    <div className="stack-lg">
      <header className="offer-head">
        <h1 className="t-h1">{offer.title}</h1>
        <p className="offer-head__company">{offer.company}</p>
        <div className="offer-head__facts">
          {offer.location ? <span>{offer.location}</span> : null}
          {workplace ? <span>{workplace}</span> : null}
          {offer.salary ? <span>{offer.salary}</span> : null}
          {offer.closed ? <Badge tone="warning">{t("of.closed")}</Badge> : null}
          <a className="link" href={offer.url} target="_blank" rel="noreferrer noopener">
            {t("ow.source")} <ExternalLink aria-hidden size={14} />
          </a>
        </div>
        <div className="row offer-head__actions">
          {offer.cvId ? (
            <ButtonLink href={`/cv/${offer.cvId}`} variant="primary" icon={<FileText />}>
              {t("ow.docs.openCv")}
            </ButtonLink>
          ) : (
            <ButtonLink href={`/offers/${offer.jobId}/cv`} variant="primary" icon={<FileText />}>
              {t("ow.docs.tailor")}
            </ButtonLink>
          )}
          {offer.letterId ? (
            <ButtonLink href={`/cv/${offer.letterId}`} variant="outline" icon={<Mail />}>
              {t("ow.docs.openLetter")}
            </ButtonLink>
          ) : null}
          {offer.cvId ? (
            <ButtonLink href={`/offers/${offer.jobId}/match`} variant="outline" icon={<Gauge />}>
              {offer.match?.score != null
                ? t("mt.link.score", { n: offer.match.score })
                : t(offer.match ? "ow.docs.match" : "mt.link.check")}
            </ButtonLink>
          ) : null}
        </div>
      </header>

      <div className="offer-ws">
        <div className="offer-ws__main">
          <section className="card card--pad offer-section" aria-labelledby={`${id}-text`}>
            <div className="offer-section__head">
              <h2 id={`${id}-text`} className="t-h3">
                {t("ow.text.title")}
              </h2>
              {offer.text && !editing ? (
                <span className="t-caption muted">
                  {t(offer.textOrigin === "pasted" ? "ow.text.pasted" : "ow.text.full", { when })}
                  {" · "}
                  {t("ow.text.chars", { n: offer.text.length })}
                </span>
              ) : null}
            </div>
            {offer.withheld ? (
              <Banner tone="warning" icon={<ShieldAlert aria-hidden />}>
                <p>{t("ow.text.withheld")}</p>
              </Banner>
            ) : null}
            {editing ? (
              <>
                <textarea
                  className="textarea offer-add__text"
                  aria-label={t("ow.text.title")}
                  value={text}
                  rows={18}
                  maxLength={60_000}
                  placeholder={t("ow.text.ph")}
                  onChange={(event) => setText(event.target.value)}
                />
                <div className="row">
                  <Button
                    variant="primary"
                    loading={busy === "text"}
                    onClick={() => void saveText()}
                  >
                    {t("ow.text.save")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setText(offer.text ?? "")
                      setEditing(false)
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </>
            ) : offer.text ? (
              <>
                <div className={`offer-text${long && !open ? " offer-text--clamped" : ""}`}>
                  {offer.text}
                </div>
                {long ? (
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
                      {open ? t("ow.text.less") : t("ow.text.more")}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="muted">{t("ow.text.none")}</p>
                {offer.excerpt ? (
                  <>
                    <p className="t-sm muted">{t("ow.text.excerpt")}</p>
                    <div className="offer-text">{offer.excerpt}</div>
                  </>
                ) : null}
              </>
            )}
            {!editing ? (
              <div className="row">
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Pencil />}
                  onClick={() => {
                    setText(offer.text ?? "")
                    setEditing(true)
                  }}
                >
                  {offer.text ? t("ow.text.edit") : t("ow.text.paste")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw />}
                  loading={busy === "refresh"}
                  onClick={() => void refresh()}
                >
                  {t("ow.text.refresh")}
                </Button>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="offer-ws__side">
          {offer.hiring ? <HiringConfidenceCard hiring={offer.hiring} /> : null}
          <section className="card card--pad offer-section" aria-labelledby={`${id}-docs`}>
            <h2 id={`${id}-docs`} className="t-h3">
              {t("ow.docs.title")}
            </h2>
            {offer.cvId || offer.letterId ? (
              <div className="stack-sm">
                {offer.cvId ? (
                  <div className="offer-doc">
                    <span>{t("ow.docs.cv")}</span>
                    <ButtonLink
                      href={`/cv/${offer.cvId}`}
                      size="sm"
                      variant="outline"
                      icon={<FileText />}
                    >
                      {t("ow.docs.openCv")}
                    </ButtonLink>
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      iconOnly
                      icon={<Trash2 />}
                      aria-label={t("ow.docs.removeCv")}
                      title={t("ow.docs.removeCv")}
                      onClick={() => setDoomed("cv")}
                    />
                  </div>
                ) : null}
                {offer.letterId ? (
                  <div className="offer-doc">
                    <span>{t("ow.docs.letter")}</span>
                    <ButtonLink
                      href={`/cv/${offer.letterId}`}
                      size="sm"
                      variant="outline"
                      icon={<Mail />}
                    >
                      {t("ow.docs.openLetter")}
                    </ButtonLink>
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      iconOnly
                      icon={<Trash2 />}
                      aria-label={t("ow.docs.removeLetter")}
                      title={t("ow.docs.removeLetter")}
                      onClick={() => setDoomed("letter")}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="t-sm muted">{t("ow.docs.none")}</p>
            )}
            {!offer.cvId ? (
              <ButtonLink href={`/offers/${offer.jobId}/cv`} variant="primary" icon={<FileText />}>
                {t("ow.docs.tailor")}
              </ButtonLink>
            ) : !offer.letterId ? (
              <Button
                variant="outline"
                icon={<Mail />}
                loading={busy === "letter"}
                onClick={() => void writeLetter()}
              >
                {t("ow.docs.writeLetter")}
              </Button>
            ) : null}
          </section>

          <section className="card card--pad offer-section" aria-labelledby={`${id}-app`}>
            <h2 id={`${id}-app`} className="t-h3">
              {t("ow.app.title")}
            </h2>
            {offer.application ? (
              <>
                <div>
                  <Badge tone="primary">{statusLabel(offer.application.status, locale)}</Badge>
                </div>
                <ButtonLink
                  href={`/applications?id=${offer.application.id}`}
                  size="sm"
                  variant="outline"
                  icon={<ClipboardList />}
                >
                  {t("ow.app.open")}
                </ButtonLink>
              </>
            ) : (
              <>
                <p className="t-sm muted">{t("ow.app.none")}</p>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<ClipboardList />}
                  loading={busy === "app"}
                  onClick={() => void track()}
                >
                  {t("ow.app.add")}
                </Button>
              </>
            )}
          </section>

          <section className="card card--pad offer-section" aria-labelledby={`${id}-note`}>
            <h2 id={`${id}-note`} className="t-h3">
              {t("ow.note.title")}
            </h2>
            <textarea
              className="textarea"
              aria-labelledby={`${id}-note`}
              value={note}
              rows={4}
              maxLength={4000}
              placeholder={t("ow.note.ph")}
              onChange={(event) => setNote(event.target.value)}
            />
            <div>
              <Button
                size="sm"
                variant="outline"
                loading={busy === "note"}
                disabled={note.trim() === (offer.note ?? "").trim()}
                onClick={() => void saveNote()}
              >
                {t("ow.note.save")}
              </Button>
            </div>
          </section>

          <div>
            <Button
              variant="danger-ghost"
              size="sm"
              icon={<Trash2 />}
              onClick={() => setConfirm(true)}
            >
              {t("ow.remove")}
            </Button>
          </div>
        </aside>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} labelledBy={`${id}-remove`}>
        <ModalHead
          id={`${id}-remove`}
          title={t("ow.remove.title")}
          onClose={() => setConfirm(false)}
        />
        <div className="modal__body">
          <p className="muted">{t("ow.remove.body")}</p>
        </div>
        <div className="modal__foot">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" loading={busy === "remove"} onClick={() => void remove()}>
            {t("ow.remove.confirm")}
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(doomed)} onClose={() => setDoomed(null)} labelledBy={`${id}-doc`}>
        <ModalHead
          id={`${id}-doc`}
          title={t(doomed === "letter" ? "ow.docs.removeLetter.title" : "ow.docs.removeCv.title")}
          onClose={() => setDoomed(null)}
        />
        <div className="modal__body">
          <p className="muted">
            {t(doomed === "letter" ? "ow.docs.removeLetter.body" : "ow.docs.removeCv.body")}
          </p>
        </div>
        <div className="modal__foot">
          <Button variant="ghost" onClick={() => setDoomed(null)}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" loading={busy === "doc"} onClick={() => void removeDoc()}>
            {t("ow.docs.remove.confirm")}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
