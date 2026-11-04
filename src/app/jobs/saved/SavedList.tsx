"use client"

import Link from "next/link"
import { useState } from "react"
import {
  CheckCheck,
  CircleCheck,
  Download,
  ExternalLink,
  FileText,
  Heart,
  Mail,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button, ButtonLink } from "@newrole/ui/Button"
import { useToast } from "@newrole/ui/interactive"
import { Badge, Banner, CompanyInitial, EmptyState, LinkTabs } from "@newrole/ui/primitives"
import { downloadPdf } from "@newrole/cv-editor/download"
import { cvPdfUrl, cvPrintUrl } from "src/app/cv/urls"
import type { SavedSegment } from "src/server/preferences/saved"
import { relativeTime } from "../format"
import type { Verdict } from "../types"
import { useFeedback } from "../useFeedback"

export type { SavedSegment }
type Doc = { id: string; language: "pl" | "en"; updatedAt: string }
type Row = {
  jobId: string
  title: string
  company: string
  url: string | null
  closed: boolean
  verdict: Verdict | null
  note: string | null
  tags: string[]
  at: string
  cv: Doc | null
  letter: Doc | null
  applicationId: string | null
}

const EMPTY_ICON = { liked: Heart, ready: FileText, applied: CheckCheck, passed: X }

export function SavedList({
  segment,
  counts,
  rows: initial,
}: {
  segment: SavedSegment
  counts: Record<SavedSegment, number>
  rows: Row[]
}) {
  const { t } = useCopy()
  const toast = useToast()
  const feedback = useFeedback()
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)

  /** Back to the verdict the row had: none for a ready offer that was never liked. */
  async function restore(row: Row) {
    if (row.verdict) await feedback.save({ jobId: row.jobId, verdict: row.verdict })
    else await feedback.clear(row.jobId)
  }

  async function act(row: Row, action: "applied" | "clear") {
    setBusy(row.jobId)
    try {
      if (action === "applied") await feedback.save({ jobId: row.jobId, verdict: "APPLIED" })
      else await feedback.clear(row.jobId)
      setRows((current) => current.filter((item) => item.jobId !== row.jobId))
      toast.show({
        message: action === "applied" ? t("toast.applied") : t("toast.undone"),
        action: {
          label: t("act.undo"),
          onClick: () => {
            void restore(row).then(() =>
              setRows((current) => [row, ...current.filter((item) => item.jobId !== row.jobId)])
            )
          },
        },
      })
    } catch {
      toast.show({ message: t("err.save"), tone: "danger" })
    } finally {
      setBusy(null)
    }
  }

  async function download(cv: Doc) {
    const result = await downloadPdf(cvPdfUrl(cv.id))
    if (result === "print") {
      toast.show({
        message: t("cv.pdf.noChrome"),
        action: {
          label: t("cv.pdf.openPrint"),
          onClick: () => window.open(cvPrintUrl(cv.id, { auto: true }), "_blank", "noopener"),
        },
        duration: 10_000,
      })
    } else if (result === "failed") {
      toast.show({ message: t("cv.err.pdf"), tone: "danger" })
    }
  }

  const tab = (value: SavedSegment, label: string) => ({
    href: `/jobs/saved?v=${value}`,
    current: segment === value,
    label: (
      <>
        {label}
        {counts[value] ? <span className="badge num">{counts[value]}</span> : null}
      </>
    ),
  })
  const EmptyIcon = EMPTY_ICON[segment]

  return (
    <div className="stack">
      <LinkTabs
        label={t("saved.title")}
        items={[
          tab("liked", t("saved.liked")),
          tab("ready", t("saved.ready")),
          tab("applied", t("saved.applied")),
          tab("passed", t("saved.passed")),
        ]}
      />
      {segment === "applied" ? (
        <Banner tone="info">
          <span>
            {t("app.trackerHint")}{" "}
            <Link className="link" href="/applications">
              {t("app.trackerLink")}
            </Link>
          </span>
        </Banner>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState icon={<EmptyIcon />} title={t(`saved.empty.${segment}`)}>
          <ButtonLink href="/jobs" variant="primary">
            {t("saved.goFeed")}
          </ButtonLink>
        </EmptyState>
      ) : (
        <ul className="stack-sm" style={{ listStyle: "none" }}>
          {rows.map((row) => (
            <li key={row.jobId} className="card saved-row">
              <CompanyInitial name={row.company || "?"} />
              <div className="saved-row__main">
                <Link href={`/jobs/${row.jobId}`}>{row.title}</Link>
                <span>
                  {row.company}
                  {" · "}
                  {relativeTime(row.at, t)}
                  {row.closed ? (
                    <>
                      {" "}
                      <Badge tone="warning">{t("saved.closed")}</Badge>
                    </>
                  ) : null}
                </span>
                {row.cv || row.letter ? (
                  <ul className="saved-docs" aria-label={t("tl.bar.label")}>
                    {row.cv ? (
                      <li>
                        <Link className="saved-doc" href={`/cv/${row.cv.id}`}>
                          <FileText aria-hidden />
                          {t("tl.bar.cv")} · {row.cv.language.toUpperCase()}
                          <span className="saved-doc__when">
                            {t("cv.updated", { when: relativeTime(row.cv.updatedAt, t) ?? "" })}
                          </span>
                        </Link>
                      </li>
                    ) : null}
                    {row.letter ? (
                      <li>
                        <Link className="saved-doc" href={`/cv/${row.letter.id}`}>
                          <Mail aria-hidden />
                          {t("tl.bar.letter")} · {row.letter.language.toUpperCase()}
                        </Link>
                      </li>
                    ) : segment === "ready" && row.cv ? (
                      <li>
                        <Link className="saved-doc saved-doc--add" href={`/cv/${row.cv.id}`}>
                          {t("tl.bar.addLetter")}
                        </Link>
                      </li>
                    ) : null}
                  </ul>
                ) : null}
                {row.tags.length ? (
                  <div className="chips chips--sm" style={{ marginTop: 4 }}>
                    {row.tags.slice(0, 5).map((tag) => (
                      <span
                        key={tag}
                        className={`chip chip--sm ${
                          segment === "passed" ? "chip--neg" : "chip--pos"
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {row.note ? <span>{t("saved.note", { note: row.note })}</span> : null}
              </div>
              <div className="saved-row__actions">
                {segment === "liked" ? (
                  <ButtonLink
                    href={`/jobs/${row.jobId}/cv`}
                    size="sm"
                    variant="outline"
                    icon={<FileText />}
                  >
                    {t("tl.act")}
                  </ButtonLink>
                ) : null}
                {segment === "ready" && row.cv ? (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Download />}
                    onClick={() => void download(row.cv!)}
                  >
                    {t("cv.act.download")}
                  </Button>
                ) : null}
                {segment === "liked" || segment === "ready" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<CircleCheck />}
                    loading={busy === row.jobId}
                    onClick={() => void act(row, "applied")}
                  >
                    {t("saved.markApplied")}
                  </Button>
                ) : null}
                {segment === "applied" && row.applicationId ? (
                  <ButtonLink
                    href={`/applications?id=${row.applicationId}`}
                    size="sm"
                    variant="outline"
                  >
                    {t("saved.openApplication")}
                  </ButtonLink>
                ) : null}
                {segment !== "ready" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={segment === "passed" ? <RotateCcw /> : <Undo2 />}
                    onClick={() => void act(row, "clear")}
                  >
                    {segment === "passed" ? t("saved.restore") : t("act.undo")}
                  </Button>
                ) : null}
                {row.url ? (
                  <ButtonLink
                    href={row.url}
                    external
                    size="sm"
                    variant="outline"
                    iconRight={<ExternalLink />}
                  >
                    {t("act.open").replace(" ↗", "")}
                  </ButtonLink>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
