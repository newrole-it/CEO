import type { ReactNode } from "react"
import {
  CATEGORY_LABEL,
  progressCopy,
  type AuditAnnotation,
  type BuiltAudit,
} from "src/server/profile/audit"
import type { LinkedInDocument, ProfileBlock, PartField } from "src/server/profile/linkedin"
import { CopyButton } from "./CopyButton"
import { RerunAudit } from "./RerunAudit"

const ORDER = ["headline", "about", "experience", "skills", "education"] as const

function marked(text: string, notes: AuditAnnotation[]) {
  const sorted = [...notes].sort((a, b) => a.start - b.start || b.severity - a.severity)
  const nodes: ReactNode[] = []
  let cursor = 0
  for (const item of sorted) {
    if (item.start < cursor || item.end > text.length) continue
    if (text.slice(item.start, item.end) !== item.quote) continue
    if (item.start > cursor) nodes.push(text.slice(cursor, item.start))
    nodes.push(
      <mark
        key={item.id}
        className={`hl hl-${item.category}`}
        title={CATEGORY_LABEL[item.category]}
      >
        {item.quote}
      </mark>
    )
    cursor = item.end
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function Part({
  block,
  field,
  className,
  as: Tag,
  notes,
}: {
  block: ProfileBlock
  field: PartField
  className?: string
  as: "h3" | "p"
  notes: AuditAnnotation[]
}) {
  const text = block.parts.find((part) => part.field === field)?.text
  if (!text) return null
  const mine = notes.filter((item) => item.sectionId === block.id && item.field === field)
  return <Tag className={className}>{marked(text, mine)}</Tag>
}

function Margin({ notes }: { notes: AuditAnnotation[] }) {
  if (!notes.length) return <div className="margin-slot" />
  return (
    <div className="margin-stack">
      {notes.map((item) => (
        <aside key={item.id} className={`margin-note note-${item.category}`}>
          <p className="note-kicker">{CATEGORY_LABEL[item.category]}</p>
          <p>{item.why}</p>
          <p className="note-rewrite">{item.rewrite}</p>
          <CopyButton text={item.rewrite} />
        </aside>
      ))}
    </div>
  )
}

function BlockRow({ block, notes }: { block: ProfileBlock; notes: AuditAnnotation[] }) {
  const mine = notes.filter((item) => item.sectionId === block.id)
  return (
    <div className="li-row">
      <div className={`li-card li-${block.kind}`}>
        <Part block={block} field="title" as="h3" notes={notes} />
        <Part block={block} field="subtitle" as="p" className="li-sub" notes={notes} />
        <Part block={block} field="body" as="p" className="li-body" notes={notes} />
      </div>
      <Margin notes={mine} />
    </div>
  )
}

export function AuditProfile({
  document,
  audit,
  auditedAt,
}: {
  document: LinkedInDocument
  audit: BuiltAudit | null
  auditedAt: Date | null
}) {
  const notes = audit?.annotations ?? []
  const demand = (audit?.demand ?? []).filter((fact) => fact.matchingOffers > 0).slice(0, 8)
  const progress = audit ? progressCopy(audit.score, audit.previousScore) : null
  return (
    <div className="audit-view stack">
      <section className="hero">
        <p className="kicker">Profile audit</p>
        <h1>A marked copy of your profile</h1>
        <p className="lede">
          Highlights sit on the exact words from the profile you imported. Each note has a rewrite
          you can copy into LinkedIn. Jobscanner cannot edit LinkedIn for you.
        </p>
      </section>
      {audit ? (
        <section className="panel score-panel">
          <div className="score-flag">
            <strong>{audit.score}</strong>
            <div>
              <p className="kicker">Profile score</p>
              {progress ? <p className="progress-line">{progress}</p> : null}
              <p>{audit.summary}</p>
              {auditedAt ? (
                <p className="meta">
                  Audited{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(auditedAt)}
                </p>
              ) : null}
            </div>
          </div>
          <RerunAudit label="Run the audit again" />
        </section>
      ) : (
        <section className="panel stack">
          <p>The parsed profile is saved. Run the audit to mark phrases and suggest rewrites.</p>
          <RerunAudit label="Run the audit" />
        </section>
      )}
      <ul className="legend">
        {(Object.keys(CATEGORY_LABEL) as Array<keyof typeof CATEGORY_LABEL>).map((category) => (
          <li key={category}>
            <span className={`hl hl-${category}`}>{CATEGORY_LABEL[category]}</span>
          </li>
        ))}
      </ul>
      {audit && audit.topChanges.length ? (
        <section className="panel stack">
          <h2>Top changes</h2>
          <ol className="top-changes">
            {audit.topChanges.map((change) => (
              <li key={change.id}>
                <p className="note-kicker">{CATEGORY_LABEL[change.category]}</p>
                <p>{change.why}</p>
                <p className="note-rewrite">{change.rewrite}</p>
                <CopyButton text={change.rewrite} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {audit ? (
        <section className="panel stack">
          <h2>What your matched offers mention</h2>
          {demand.length ? (
            <table className="demand-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Phrase</th>
                  <th>Offers</th>
                  <th>Share</th>
                  <th>On your profile</th>
                </tr>
              </thead>
              <tbody>
                {demand.map((fact) => (
                  <tr key={fact.id}>
                    <td>{fact.role}</td>
                    <td>{fact.phrase}</td>
                    <td>
                      {fact.matchingOffers} of {fact.totalOffers}
                    </td>
                    <td>{fact.percent}%</td>
                    <td>{fact.presentInProfile ? "Yes" : fact.qualifies ? "No, marked" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>
              No checklist phrase appears in the indexed text of a saved search with at least five
              matches. This audit will not invent a percentage.
            </p>
          )}
          <p className="hint">
            Counts use the latest successful search for each saved role. A missing-keyword mark is
            added only when the phrase is absent from your profile, at least five matched offers
            contain it, and that is at least 15% of that role&apos;s results.
          </p>
        </section>
      ) : null}
      <article className="li-profile">
        <header className="li-identity">
          <h2>{document.name ?? "Imported profile"}</h2>
          {document.location ? <p className="li-sub">{document.location}</p> : null}
        </header>
        {ORDER.map((kind) => {
          const blocks = document.blocks.filter((block) => block.kind === kind)
          if (!blocks.length) return null
          return (
            <section key={kind} className="li-section">
              {kind === "headline" ? null : <h2>{blocks[0].label}</h2>}
              {blocks.map((block) => (
                <BlockRow key={block.id} block={block} notes={notes} />
              ))}
            </section>
          )
        })}
      </article>
    </div>
  )
}
