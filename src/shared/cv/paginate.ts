/**
 * Page breaks for the CV flow, shared by the editor and the print/PDF view.
 *
 * The CV is a column of "atoms" (header, section title, paragraph, bullet, row…). Each atom is
 * measured in the unpaginated flow: `top`/`bottom` in px from the top of the first page's
 * content area. `lead` is the atom's top padding (the space above it), dropped when the atom
 * starts a page, like a browser truncates margins at a page break. Pages are stacked with `gap`
 * px between them (0 for print), so page p's content area starts at p × (pageHeight + gap).
 *
 * IMPORTANT: computePageBreaks and assignPages are embedded in the print HTML with
 * Function.prototype.toString(), so they must stay self-contained: no imports, no closures over
 * module scope, no helpers a compiler would inject (spread, for…of over iterables, async).
 */

export type PageAtom = { top: number; bottom: number; keepWithNext?: boolean; lead?: number }
export type PageGeometry = {
  pageHeight: number
  marginTop: number
  marginBottom: number
  gap: number
}

/**
 * Returns one spacer height per atom: the extra px to insert above that atom (0 = no break).
 * Rules: an atom that crosses the page's content bottom moves to the next page; an atom with
 * keepWithNext moves along with the atoms it keeps with, so a heading never ends a page alone;
 * an atom taller than a page stays where it is and overflows.
 */
export function computePageBreaks(atoms: PageAtom[], geometry: PageGeometry): number[] {
  var EPS = 0.5
  var content = geometry.pageHeight - geometry.marginTop - geometry.marginBottom
  var stride = geometry.pageHeight + geometry.gap
  var spacers: number[] = []
  var shift = 0
  var page = 0
  for (var i = 0; i < atoms.length; i++) {
    var top = atoms[i].top + shift
    var bottom = atoms[i].bottom + shift
    var lead = Math.max(0, Math.min(atoms[i].lead || 0, bottom - top))
    var start = top + lead
    while (start >= (page + 1) * stride - EPS) page++
    var pageTop = page * stride
    var pageBottom = pageTop + content
    var move = false
    if (start > pageBottom - EPS && bottom - start > EPS) {
      move = true
    } else if (start > pageTop + EPS) {
      if (bottom > pageBottom + EPS) {
        move = bottom - start <= content + EPS
      } else if (atoms[i].keepWithNext) {
        var j = i
        while (j < atoms.length - 1 && atoms[j].keepWithNext) j++
        if (j > i) {
          var chainBottom = atoms[j].bottom + shift
          move = chainBottom > pageBottom + EPS && chainBottom - start <= content + EPS
        }
      }
    }
    if (move) {
      var spacer = (page + 1) * stride - start
      spacers.push(spacer)
      shift += spacer
      page++
    } else {
      spacers.push(0)
    }
  }
  return spacers
}

/**
 * The page index of each atom once the spacers are applied, and the page count (at least 1).
 * An atom belongs to the page where its content (below the lead) starts.
 */
export function assignPages(
  atoms: PageAtom[],
  spacers: number[],
  geometry: PageGeometry
): { pageOf: number[]; count: number } {
  var EPS = 0.5
  var stride = geometry.pageHeight + geometry.gap
  var shift = 0
  var pageOf: number[] = []
  var count = 1
  for (var i = 0; i < atoms.length; i++) {
    shift += spacers[i] || 0
    var top = atoms[i].top + shift
    var lead = Math.max(0, Math.min(atoms[i].lead || 0, atoms[i].bottom - atoms[i].top))
    var page = Math.max(0, Math.floor((top + lead + EPS) / stride))
    pageOf.push(page)
    if (page + 1 > count) count = page + 1
  }
  return { pageOf: pageOf, count: count }
}
