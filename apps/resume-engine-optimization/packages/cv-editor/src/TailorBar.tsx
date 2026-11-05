"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Plus, Sparkles } from "lucide-react"
import { Button } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import type { TailorNotes } from "@newrole/cv-core/tailor"
import type { TailorContext } from "@newrole/cv-core/views"
import { useCvBackend } from "./backend"
import { useCvCopy } from "./locale"
import { tailorErrorKey } from "./tailor-errors"
import type { CvLanguage } from "./useCvDocument"

/** Above a tailored document: the switch between its CV and letter, and the offer they are for. */
export function TailorBar({
  id,
  tailor,
  notes,
  language,
  flush,
  onReview,
}: {
  id: string
  tailor: TailorContext
  notes: TailorNotes | null
  language: CvLanguage
  flush: () => Promise<boolean>
  onReview: () => void
}) {
  const { t } = useCvCopy()
  const toast = useToast()
  const router = useRouter()
  const backend = useCvBackend()
  const [adding, setAdding] = useState(false)
  const { job, cvId, letterId } = tailor

  async function addLetter() {
    if (!job.id) return
    setAdding(true)
    try {
      await flush()
      const letter = await backend.tailor.letter({ jobId: job.id, language })
      if (!letter) throw new Error("no result")
      router.push(backend.routes.document(letter.id))
    } catch (error) {
      toast.show({ message: t(tailorErrorKey(error)), tone: "danger" })
      setAdding(false)
    }
  }

  const toCheck = notes?.unverified.length ?? 0
  const offer = `${job.company} · ${job.title}`
  const jobPage = job.id ? backend.routes.job(job.id) : null
  return (
    <div className="cvt-bar">
      <nav className="tabs" aria-label={t("tl.bar.label")}>
        {cvId ? (
          <Link
            className="tab"
            href={backend.routes.document(cvId)}
            aria-current={cvId === id ? "page" : undefined}
          >
            {t("tl.bar.cv")}
          </Link>
        ) : null}
        {letterId ? (
          <Link
            className="tab"
            href={backend.routes.document(letterId)}
            aria-current={letterId === id ? "page" : undefined}
          >
            {t("tl.bar.letter")}
          </Link>
        ) : null}
      </nav>
      {!letterId && job.id ? (
        <Button
          size="sm"
          variant="soft"
          className="cvt-bar__add"
          icon={<Plus />}
          loading={adding}
          onClick={() => void addLetter()}
        >
          {t(adding ? "tl.bar.addingLetter" : "tl.bar.addLetter")}
        </Button>
      ) : null}
      <span className="cvt-bar__for" title={offer}>
        {t("tl.bar.for")}{" "}
        {jobPage ? (
          <Link className="link" href={jobPage}>
            {offer}
          </Link>
        ) : job.url ? (
          <a className="link" href={job.url} target="_blank" rel="noopener noreferrer">
            {offer}
          </a>
        ) : (
          offer
        )}
      </span>
      <Button size="sm" variant="ghost" icon={<Sparkles />} onClick={onReview}>
        {t("tl.panel.review")}
        {toCheck ? <span className="cvt-count">{toCheck}</span> : null}
      </Button>
    </div>
  )
}
