import { describe, expect, it } from "vitest"
import { assignPages, computePageBreaks, type PageAtom } from "./paginate"

/** 100 px pages: 10 px top and bottom margins leave 80 px of content. */
const print = { pageHeight: 100, marginTop: 10, marginBottom: 10, gap: 0 }
const screen = { ...print, gap: 20 }

/** Contiguous atoms from heights (and optional flags). */
function flow(...items: (number | { h: number; keep?: boolean; lead?: number })[]): PageAtom[] {
  let y = 0
  return items.map((item) => {
    const spec = typeof item === "number" ? { h: item } : item
    const atom = { top: y, bottom: y + spec.h, keepWithNext: spec.keep, lead: spec.lead }
    y += spec.h
    return atom
  })
}

describe("computePageBreaks", () => {
  it("keeps everything on one page when it fits", () => {
    expect(computePageBreaks(flow(30, 30, 20), print)).toEqual([0, 0, 0])
  })

  it("moves an atom that crosses the content bottom to the next page", () => {
    const atoms = flow(50, 40)
    const spacers = computePageBreaks(atoms, print)
    // the second atom starts at 50; the next page's content starts at 100
    expect(spacers).toEqual([0, 50])
    expect(assignPages(atoms, spacers, print)).toEqual({ pageOf: [0, 1], count: 2 })
  })

  it("accounts for the gap between stacked pages in the editor", () => {
    const spacers = computePageBreaks(flow(50, 40), screen)
    expect(spacers).toEqual([0, 70])
  })

  it("does not leave a heading alone at the bottom of a page", () => {
    const atoms = flow(60, { h: 10, keep: true }, 20)
    const spacers = computePageBreaks(atoms, print)
    expect(spacers).toEqual([0, 40, 0])
    expect(assignPages(atoms, spacers, print).pageOf).toEqual([0, 1, 1])
  })

  it("moves a whole keep-with-next chain (title, job head) together", () => {
    const atoms = flow(50, { h: 8, keep: true }, { h: 8, keep: true }, 20)
    const spacers = computePageBreaks(atoms, print)
    expect(assignPages(atoms, spacers, print).pageOf).toEqual([0, 1, 1, 1])
  })

  it("keeps the chain when the following atom fits", () => {
    const atoms = flow(40, { h: 10, keep: true }, 20)
    expect(computePageBreaks(atoms, print)).toEqual([0, 0, 0])
  })

  it("lets an atom taller than a page stay and overflow", () => {
    const atoms = flow(20, 150, 10)
    const spacers = computePageBreaks(atoms, print)
    expect(spacers[1]).toBe(0)
    // the next atom starts at 170, inside page 1's content area (100–180): no extra break
    expect(spacers[2]).toBe(0)
    expect(assignPages(atoms, spacers, print).pageOf).toEqual([0, 0, 1])
  })

  it("moves an atom that starts in the bottom margin after an overflow", () => {
    const atoms = flow(20, 165, 10)
    const spacers = computePageBreaks(atoms, print)
    expect(spacers[2]).toBe(200 - 185)
    expect(assignPages(atoms, spacers, print).pageOf).toEqual([0, 0, 2])
  })

  it("does not move a chain that would not fit on one page anyway", () => {
    const atoms = flow(60, { h: 10, keep: true }, 75)
    const spacers = computePageBreaks(atoms, print)
    expect(spacers[1]).toBe(0)
    expect(spacers[2]).toBe(30)
  })

  it("drops the lead (space above) of an atom that starts a page", () => {
    const atoms = flow(70, { h: 20, lead: 6 })
    const spacers = computePageBreaks(atoms, print)
    // content of the moved atom starts at the next page's top: 70 + 6 + spacer = 100
    expect(spacers).toEqual([0, 24])
    expect(assignPages(atoms, spacers, print).pageOf).toEqual([0, 1])
  })

  it("lets an atom whose content fits stay even when its lead does not matter", () => {
    const atoms = flow(50, { h: 30, lead: 10 })
    expect(computePageBreaks(atoms, print)).toEqual([0, 0])
  })

  it("never breaks before the first atom on a page", () => {
    const atoms = flow(80, 80, 80)
    expect(computePageBreaks(atoms, print)).toEqual([0, 20, 20])
    expect(assignPages(atoms, computePageBreaks(atoms, print), print).count).toBe(3)
  })

  it("handles an empty flow", () => {
    expect(computePageBreaks([], print)).toEqual([])
    expect(assignPages([], [], print)).toEqual({ pageOf: [], count: 1 })
  })

  it("survives toString() embedding (no module dependencies)", () => {
    const embedded = new Function(
      `return (${computePageBreaks.toString()})`
    )() as typeof computePageBreaks
    expect(embedded(flow(50, 40), print)).toEqual([0, 50])
    const pages = new Function(`return (${assignPages.toString()})`)() as typeof assignPages
    expect(pages(flow(50, 40), [0, 50], print).count).toBe(2)
  })
})
