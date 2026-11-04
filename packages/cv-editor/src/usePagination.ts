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

/**
 * Live page breaks with the same computePageBreaks as the PDF. Atoms stay direct children of
 * one flow and are never moved: a break is a margin on the atom, so typing never loses the
 * caret. Natural positions come from the current layout minus the margins already applied, so
 * nothing has to be reset to measure. Re-runs after every commit and whenever the flow resizes.
 */
export function usePagination(flowRef: RefObject<HTMLElement | null>, revision: unknown) {
  const [pageCount, setPageCount] = useState(1)
  const [ready, setReady] = useState(false)
  const frame = useRef<number | null>(null)

  const measure = useCallback(() => {
    const flow = flowRef.current
    if (!flow || !flow.offsetWidth) return
    const box = flow.getBoundingClientRect()
    // rects are scaled by the fit-to-width transform; everything below is in unscaled px
    const scale = box.width / flow.offsetWidth || 1
    const children = [...flow.children] as HTMLElement[]
    let applied = 0
    const atoms: PageAtom[] = children.map((element) => {
      applied += parseFloat(element.style.marginTop) || 0
      const rect = element.getBoundingClientRect()
      const top = (rect.top - box.top) / scale - applied
      return {
        top,
        bottom: top + rect.height / scale,
        keepWithNext: element.dataset.keep === "1",
        lead: (Number(element.dataset.lead) || 0) * MM,
      }
    })
    const spacers = computePageBreaks(atoms, GEOMETRY)
    children.forEach((element, index) => {
      const next = spacers[index] > 0 ? spacers[index] : 0
      const current = parseFloat(element.style.marginTop) || 0
      if (Math.abs(next - current) > 0.01) element.style.marginTop = next ? `${next}px` : ""
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
