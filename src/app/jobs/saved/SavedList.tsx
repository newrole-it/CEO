"use client"

import Link from "next/link"
import { useState } from "react"
import { CheckCheck, CircleCheck, ExternalLink, Heart, RotateCcw, Undo2, X } from "lucide-react"
import { useCopy } from "src/app/i18n/Locale"
import { Button, ButtonLink } from "src/app/components/ds/Button"
import { useToast } from "src/app/components/ds/interactive"
import { Badge, Banner, CompanyInitial, EmptyState, LinkTabs } from "src/app/components/ds/primitives"
import { relativeTime } from "../format"
import { useFeedback } from "../useFeedback"

export type SavedSegment = "liked" | "applied" | "passed"
type Row = {
  jobId: string
  title: string
  company: string
  url: string | null
  closed: boolean
  note: string | null
  tags: string[]
  at: string
}

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
            const verdict = segment === "liked" ? "LIKE" : segment === "applied" ? "APPLIED" : "DISLIKE"
            void feedback.save({ jobId: row.jobId, verdict }).then(() =>
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

  return (
    <div className="stack">
      <LinkTabs
        label={t("saved.title")}
        items={[tab("liked", t("saved.liked")), tab("applied", t("saved.applied")), tab("passed", t("saved.passed"))]}
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
        <EmptyState
          icon={segment === "liked" ? <Heart /> : segment === "applied" ? <CheckCheck /> : <X />}
          title={t(segment === "liked" ? "saved.empty.liked" : segment === "applied" ? "saved.empty.applied" : "saved.empty.passed")}
        >
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
                {row.tags.length ? (
                  <div className="chips chips--sm" style={{ marginTop: 4 }}>
                    {row.tags.slice(0, 5).map((tag) => (
                      <span key={tag} className={`chip chip--sm ${segment === "passed" ? "chip--neg" : "chip--pos"}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {row.note ? <span>{t("saved.note", { note: row.note })}</span> : null}
              </div>
              <div className="saved-row__actions">
                {segment === "liked" ? (
                  <Button size="sm" variant="ghost" icon={<CircleCheck />} loading={busy === row.jobId} onClick={() => void act(row, "applied")}>
                    {t("saved.markApplied")}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={segment === "passed" ? <RotateCcw /> : <Undo2 />}
                  onClick={() => void act(row, "clear")}
                >
                  {segment === "passed" ? t("saved.restore") : t("act.undo")}
                </Button>
                {row.url ? (
                  <ButtonLink href={row.url} external size="sm" variant="outline" iconRight={<ExternalLink />}>
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
