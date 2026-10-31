import type { CvContent } from "./schema"
import { cvPlainText } from "./text"

/**
 * What changed between two versions of a document, line by line, with the changed words marked
 * inside a line that was reworded. Compares the text a reader sees, so hiding a section shows as
 * its lines going away, and a change of formatting alone does not show.
 */

export type DiffPart = { text: string; changed: boolean }

export type DiffRow =
  | { kind: "same"; text: string }
  | { kind: "del"; text: string }
  | { kind: "add"; text: string }
  | { kind: "change"; before: DiffPart[]; after: DiffPart[] }
  | { kind: "gap"; count: number }

type Op<T> = { type: "same" | "del" | "add"; value: T }

/** Longest common subsequence, with the shared start and end taken off first. */
function diffSequence<T>(before: T[], after: T[]): Op<T>[] {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1
  let endA = before.length
  let endB = after.length
  while (endA > start && endB > start && before[endA - 1] === after[endB - 1]) {
    endA -= 1
    endB -= 1
  }
  const a = before.slice(start, endA)
  const b = after.slice(start, endB)
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const ops: Op<T>[] = before.slice(0, start).map((value) => ({ type: "same", value }))
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ type: "same", value: a[i] })
      i += 1
      j += 1
    } else if (j >= b.length || (i < a.length && table[i + 1][j] >= table[i][j + 1])) {
      ops.push({ type: "del", value: a[i] })
      i += 1
    } else {
      ops.push({ type: "add", value: b[j] })
      j += 1
    }
  }
  for (const value of before.slice(endA)) ops.push({ type: "same", value })
  return ops
}

const words = (line: string) => line.split(/(\s+)/).filter(Boolean)

function join(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = []
  for (const part of parts) {
    const last = out[out.length - 1]
    if (last && last.changed === part.changed) last.text += part.text
    else out.push({ ...part })
  }
  return out
}

/** The two sides of a reworded line, or null when they share too little to read as one line. */
function reworded(before: string, after: string): { before: DiffPart[]; after: DiffPart[] } | null {
  const ops = diffSequence(words(before), words(after))
  const shared = ops.filter((op) => op.type === "same" && op.value.trim()).length
  const total = Math.max(
    words(before).filter((word) => word.trim()).length,
    words(after).filter((word) => word.trim()).length
  )
  if (!total || shared / total < 0.4) return null
  const side = (skip: "add" | "del") =>
    join(
      ops
        .filter((op) => op.type !== skip)
        .map((op) => ({ text: op.value, changed: op.type !== "same" }))
    )
  return { before: side("add"), after: side("del") }
}

export function diffText(before: string, after: string): DiffRow[] {
  const lines = (text: string) => text.split("\n").filter((line) => line.trim())
  const ops = diffSequence(lines(before), lines(after))
  const rows: DiffRow[] = []
  let at = 0
  while (at < ops.length) {
    const op = ops[at]
    if (op.type === "same") {
      rows.push({ kind: "same", text: op.value })
      at += 1
      continue
    }
    // one run of changes: removed lines, then the added ones that may replace them
    const removed: string[] = []
    const added: string[] = []
    while (at < ops.length && ops[at].type !== "same") {
      if (ops[at].type === "del") removed.push(ops[at].value)
      else added.push(ops[at].value)
      at += 1
    }
    const unmatched = [...added]
    for (const line of removed) {
      const index = unmatched.findIndex((candidate) => reworded(line, candidate))
      if (index < 0) {
        rows.push({ kind: "del", text: line })
        continue
      }
      const pair = reworded(line, unmatched[index])
      unmatched.splice(index, 1)
      if (pair) rows.push({ kind: "change", ...pair })
    }
    for (const line of unmatched) rows.push({ kind: "add", text: line })
  }
  return rows
}

/** The changes with `context` unchanged lines around them; the rest becomes a counted gap. */
export function compactDiff(rows: DiffRow[], context = 1): DiffRow[] {
  const keep = rows.map(() => false)
  rows.forEach((row, index) => {
    if (row.kind === "same") return
    for (
      let at = Math.max(0, index - context);
      at <= Math.min(rows.length - 1, index + context);
      at += 1
    ) {
      keep[at] = true
    }
  })
  const out: DiffRow[] = []
  let skipped = 0
  rows.forEach((row, index) => {
    if (keep[index]) {
      if (skipped) out.push({ kind: "gap", count: skipped })
      skipped = 0
      out.push(row)
    } else {
      skipped += 1
    }
  })
  if (skipped) out.push({ kind: "gap", count: skipped })
  return out
}

/** Version `before` against `after`; the name and contact lines count like any other text. */
export function diffCv(before: CvContent, after: CvContent): DiffRow[] {
  return diffText(cvPlainText(before), cvPlainText(after))
}

export function hasChanges(rows: DiffRow[]): boolean {
  return rows.some((row) => row.kind !== "same" && row.kind !== "gap")
}
