"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { assignPages, computePageBreaks, type PageAtom } from "@newrole/cv-core/paginate"
import { MM, pageGeometry } from "@newrole/cv-core/styles"

/** Grey space between sheets on the canvas, in CSS px. */
export const SHEET_GAP = 24
const GEOMETRY = pageGeometry(SHEET_GAP)

/** Top of sheet `index` on the canvas, in unscaled px. */
export function sheetTop(index: number): number {
  return index * (GEOMETRY.pageHeight + SHEET_GAP)
}

/** Canvas height for `count` sheets, in unscaled px. */
export function sheetsHeight(count: number): number {
  return count * GEOMETRY.pageHeight + (count - 1) * SHEET_GAP
}

/** What one page-break decision is about: an atom, or one paragraph block of a text field. */
type Unit = {
  /** Carries the break (a top margin) and gives the top */
  element: HTMLElement
  /** Gives the bottom: the atom itself, or the first paragraph of an atom split into units */
  end: HTMLElement
  keepWithNext: boolean
  lead: number
}

/** The paragraph blocks of an atom that is one text field (Editable `paragraphs`), if any. */
function paragraphBlocks(atom: HTMLElement): HTMLElement[] {
  for (const child of atom.children) {
    if (child instanceof HTMLElement && child.dataset.paras === "1")
      return [...child.children].filter((block): block is HTMLElement => block.tagName === "DIV")
  }
  return []
}

/**
 * The units of a flow in reading order. An atom is one unit, except a text field with several
 * paragraphs: there every paragraph is a unit, so the page breaks between two of them, exactly
 * where the print view (one atom per paragraph, cvFlow) breaks it. The first paragraph's unit
 * is the atom down to the end of that paragraph, so the space above the atom stays with it.
 */
function flowUnits(flow: HTMLElement): Unit[] {
  const units: Unit[] = []
  for (const atom of flow.children) {
    if (!(atom instanceof HTMLElement)) continue
    const keepWithNext = atom.dataset.keep === "1"
    const lead = (Number(atom.dataset.lead) || 0) * MM
    const blocks = paragraphBlocks(atom)
    // the first paragraph's break is the atom's; a block the browser split off another one
    // starts with a copy of that one's margin
    if (blocks[0]?.style.marginTop) blocks[0].style.marginTop = ""
    if (blocks.length < 2) {
      units.push({ element: atom, end: atom, keepWithNext, lead })
      continue
    }
    blocks.forEach((block, index) => {
      const first = index === 0
      units.push({
        element: first ? atom : block,
        end: block,
        // what the atom keeps with (a tech line) follows its last paragraph
        keepWithNext: index === blocks.length - 1 && keepWithNext,
        lead: first ? lead : 0,
      })
    })
  }
  return units
}

/**
 * Live page breaks with the same computePageBreaks as the PDF. Atoms stay direct children of
 * one flow and are never moved: a break is a margin on the atom (or on a paragraph block inside
 * a text field), so typing never loses the caret. Natural positions come from the current
 * layout minus the margins already applied, so nothing has to be reset to measure. Re-runs
 * after every commit and whenever the flow resizes.
 */
export function usePagination(flowRef: RefObject<HTMLElement | null>, revision: unknown) {
  const [pageCount, setPageCount] = useState(1)
  const [ready, setReady] = useState(false)
  const frame = useRef<number | null>(null)

  const measure = useCallback(() => {
    const flow = flowRef.current
    if (!flow || !flow.offsetWidth) return
    const units = flowUnits(flow)
    const box = flow.getBoundingClientRect()
    // rects are scaled by the fit-to-width transform; everything below is in unscaled px
    const scale = box.width / flow.offsetWidth || 1
    let applied = 0
    const atoms: PageAtom[] = units.map((unit) => {
      applied += parseFloat(unit.element.style.marginTop) || 0
      const top = (unit.element.getBoundingClientRect().top - box.top) / scale - applied
      const bottom = (unit.end.getBoundingClientRect().bottom - box.top) / scale - applied
      return { top, bottom, keepWithNext: unit.keepWithNext, lead: unit.lead }
    })
    const spacers = computePageBreaks(atoms, GEOMETRY)
    units.forEach((unit, index) => {
      const next = spacers[index] > 0 ? spacers[index] : 0
      const current = parseFloat(unit.element.style.marginTop) || 0
      if (Math.abs(next - current) > 0.01) unit.element.style.marginTop = next ? `${next}px` : ""
    })
    setPageCount(assignPages(atoms, spacers, GEOMETRY).count)
    setReady(true)
  }, [flowRef])

  const schedule = useCallback(() => {
    if (frame.current != null) return
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null
      measure()
    })
  }, [measure])

  // after every commit, before paint, so a block never flashes on the wrong page
  useLayoutEffect(() => {
    measure()
  }, [measure, revision])

  useEffect(() => {
    const flow = flowRef.current
    if (!flow) return
    const observer = new ResizeObserver(schedule)
    observer.observe(flow)
    void document.fonts?.ready.then(schedule)
    return () => {
      observer.disconnect()
      if (frame.current != null) window.cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [flowRef, schedule])

  return { pageCount, ready, schedule }
}
