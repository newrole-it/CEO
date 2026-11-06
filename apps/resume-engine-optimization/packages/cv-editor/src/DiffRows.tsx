"use client"

import type { DiffPart, DiffRow } from "@newrole/cv-core/diff"
import { useCvCopy } from "./locale"

/** What changed, line by line: removed lines struck through, added ones marked, reworded words marked inside. */
export function DiffRows({ rows }: { rows: DiffRow[] }) {
  const { t } = useCvCopy()
  return (
    <div className="cvt-diff">
      {rows.map((row, index) => {
        if (row.kind === "gap") {
          return (
            <p key={index} className="cvt-diff__gap">
              {t("tl.diff.gap", { n: row.count })}
            </p>
          )
        }
        if (row.kind === "same") {
          return (
            <p key={index} className="cvt-diff__same">
              {row.text}
            </p>
          )
        }
        if (row.kind === "del") {
          return (
            <p key={index} className="cvt-diff__del">
              <span className="sr-only">{t("tl.diff.removed")} </span>
              <del>{row.text}</del>
            </p>
          )
        }
        if (row.kind === "add") {
          return (
            <p key={index} className="cvt-diff__add">
              <span className="sr-only">{t("tl.diff.added")} </span>
              <ins>{row.text}</ins>
            </p>
          )
        }
        return (
          <div key={index} className="cvt-diff">
            <p className="cvt-diff__del">
              <span className="sr-only">{t("tl.diff.removed")} </span>
              <Parts parts={row.before} Mark="del" />
            </p>
            <p className="cvt-diff__add">
              <span className="sr-only">{t("tl.diff.added")} </span>
              <Parts parts={row.after} Mark="ins" />
            </p>
          </div>
        )
      })}
    </div>
  )
}

function Parts({ parts, Mark }: { parts: DiffPart[]; Mark: "ins" | "del" }) {
  return (
    <>
      {parts.map((part, index) =>
        part.changed ? <Mark key={index}>{part.text}</Mark> : <span key={index}>{part.text}</span>
      )}
    </>
  )
}
